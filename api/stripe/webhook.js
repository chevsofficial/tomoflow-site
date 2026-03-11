import crypto from 'node:crypto';

export const config = {
  api: {
    bodyParser: false,
  },
};

const STRIPE_API_BASE = 'https://api.stripe.com/v1';
const ACTIVE_STATUSES = new Set(['active', 'trialing']);

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function verifyStripeSignature(rawBody, signatureHeader, webhookSecret) {
  if (!signatureHeader || !webhookSecret) return false;

  const parts = signatureHeader.split(',').reduce((acc, item) => {
    const [k, v] = item.split('=');
    if (k && v) acc[k] = v;
    return acc;
  }, {});

  const timestamp = parts.t;
  const signature = parts.v1;
  if (!timestamp || !signature) return false;

  const payloadToSign = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', webhookSecret).update(payloadToSign, 'utf8').digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function stripeRequest(path, stripeSecretKey, method = 'GET', bodyParams = null) {
  const headers = {
    Authorization: `Bearer ${stripeSecretKey}`,
  };

  const init = { method, headers };

  if (bodyParams) {
    headers['Content-Type'] = 'application/x-www-form-urlencoded';
    init.body = new URLSearchParams(bodyParams).toString();
  }

  const response = await fetch(`${STRIPE_API_BASE}${path}`, init);
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data?.error?.message || `Stripe API error (${response.status})`);
  }

  return data;
}

function makeSupabaseHeaders(serviceRoleKey) {
  return {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  };
}

async function upsertSubscription({ supabaseUrl, serviceRoleKey, row }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/subscriptions?on_conflict=stripe_subscription_id`, {
    method: 'POST',
    headers: {
      ...makeSupabaseHeaders(serviceRoleKey),
      Prefer: 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify([row]),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase subscriptions upsert failed: ${response.status} ${text}`);
  }
}

async function setProfilePro({ supabaseUrl, serviceRoleKey, userId, isPro }) {
  const response = await fetch(`${supabaseUrl}/rest/v1/profiles?id=eq.${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    headers: makeSupabaseHeaders(serviceRoleKey),
    body: JSON.stringify({ is_pro: isPro, updated_at: new Date().toISOString() }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase profile update failed: ${response.status} ${text}`);
  }
}

async function lookupUserIdBySubscription({ supabaseUrl, serviceRoleKey, stripeSubscriptionId, stripeCustomerId }) {
  if (!stripeSubscriptionId && !stripeCustomerId) return null;

  let query = `${supabaseUrl}/rest/v1/subscriptions?select=user_id&limit=1`;

  if (stripeSubscriptionId) {
    query += `&stripe_subscription_id=eq.${encodeURIComponent(stripeSubscriptionId)}`;
  } else if (stripeCustomerId) {
    query += `&stripe_customer_id=eq.${encodeURIComponent(stripeCustomerId)}`;
  }

  const response = await fetch(query, {
    headers: makeSupabaseHeaders(serviceRoleKey),
  });

  if (!response.ok) {
    return null;
  }

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;

  return rows[0]?.user_id || null;
}

function resolveUserIdFromEvent(event) {
  const object = event?.data?.object || {};
  return (
    object?.metadata?.user_id ||
    object?.client_reference_id ||
    object?.customer_details?.metadata?.user_id ||
    null
  );
}

function mapSubscriptionRow({ userId, subscription, stripeCustomerId }) {
  return {
    user_id: userId,
    stripe_subscription_id: subscription.id,
    stripe_customer_id: stripeCustomerId || subscription.customer || null,
    status: subscription.status,
    price_id: subscription.items?.data?.[0]?.price?.id || null,
    current_period_end: subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null,
    cancel_at_period_end: Boolean(subscription.cancel_at_period_end),
    updated_at: new Date().toISOString(),
  };
}

async function processEvent({ event, stripeSecretKey, supabaseUrl, serviceRoleKey }) {
  const type = event?.type;
  const object = event?.data?.object;

  if (!type || !object) return;

  if (type === 'checkout.session.completed') {
    const session = object;
    const userId = resolveUserIdFromEvent(event);
    const stripeSubscriptionId = session.subscription;

    if (!userId || !stripeSubscriptionId) return;

    const subscription = await stripeRequest(`/subscriptions/${stripeSubscriptionId}`, stripeSecretKey);
    const row = mapSubscriptionRow({
      userId,
      subscription,
      stripeCustomerId: session.customer,
    });

    await upsertSubscription({ supabaseUrl, serviceRoleKey, row });
    await setProfilePro({ supabaseUrl, serviceRoleKey, userId, isPro: ACTIVE_STATUSES.has(subscription.status) });
    return;
  }

  if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
    const subscription = object;
    let userId = subscription?.metadata?.user_id || null;

    if (!userId) {
      userId = await lookupUserIdBySubscription({
        supabaseUrl,
        serviceRoleKey,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer || null,
      });
    }

    if (!userId) return;

    const row = mapSubscriptionRow({
      userId,
      subscription,
      stripeCustomerId: subscription.customer,
    });

    await upsertSubscription({ supabaseUrl, serviceRoleKey, row });
    await setProfilePro({
      supabaseUrl,
      serviceRoleKey,
      userId,
      isPro: ACTIVE_STATUSES.has(subscription.status),
    });
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const supabaseUrl = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!stripeSecretKey || !stripeWebhookSecret || !supabaseUrl || !serviceRoleKey) {
    return res.status(503).json({
      error:
        'Missing required env. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, SUPABASE_URL (or EXPO_PUBLIC_SUPABASE_URL), and SUPABASE_SERVICE_ROLE_KEY.',
    });
  }

  try {
    const rawBody = await readRawBody(req);
    const signature = req.headers['stripe-signature'];

    if (!verifyStripeSignature(rawBody, signature, stripeWebhookSecret)) {
      return res.status(400).json({ error: 'Invalid Stripe signature' });
    }

    const event = JSON.parse(rawBody);

    await processEvent({ event, stripeSecretKey, supabaseUrl, serviceRoleKey });

    return res.status(200).json({ received: true });
  } catch (error) {
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}
