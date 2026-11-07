const id = value => typeof value === 'string' ? value : value?.id;

function proIds() {
  return {
    link: process.env.STRIPE_PRO_PAYMENT_LINK_ID?.trim(),
    price: process.env.STRIPE_PRO_PRICE_ID?.trim(),
    product: process.env.STRIPE_PRO_PRODUCT_ID?.trim(),
  };
}

async function stripeGet(path) {
  const secret = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secret) throw new Error('Stripe not configured');
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secret}`, 'Stripe-Version': '2024-11-20.acacia' },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Stripe request failed');
  return response.json();
}

// Shared by confirmations and Restore. Generic app/sku metadata also describes tips.
async function isPaidProSession(session) {
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid') return false;
  const ids = proIds();
  if (!ids.link && !ids.price && !ids.product) throw new Error('Pro identifiers not configured');
  if (ids.link && id(session.payment_link) === ids.link) return true;
  if (!ids.price && !ids.product) return false;
  let page = session.line_items;
  let after;
  do {
    if (!page) {
      const params = new URLSearchParams({ limit: '100' });
      if (after) params.set('starting_after', after);
      page = await stripeGet(`/checkout/sessions/${encodeURIComponent(session.id)}/line_items?${params}`);
    }
    if ((page.data || []).some(item =>
      (ids.price && id(item.price) === ids.price) ||
      (ids.product && id(item.price?.product) === ids.product)
    )) return true;
    if (!page.has_more) return false;
    after = page.data?.at(-1)?.id;
    if (!after) throw new Error('Invalid Stripe pagination');
    page = null;
  } while (after);
  return false;
}

module.exports = { stripeGet, isPaidProSession };

// New grants/Restore requests recheck payment details, including full refunds.
async function isAvailableProSession(session) {
  if (!await isPaidProSession(session)) return false;
  let intent = session.payment_intent;
  if (typeof intent === 'string') intent = await stripeGet(`/payment_intents/${encodeURIComponent(intent)}?expand[]=latest_charge`);
  let charge = intent?.latest_charge;
  if (typeof charge === 'string') charge = await stripeGet(`/charges/${encodeURIComponent(charge)}`);
  return intent?.status === 'succeeded' && charge?.paid === true && charge.refunded === false;
}
module.exports.isAvailableProSession = isAvailableProSession;
