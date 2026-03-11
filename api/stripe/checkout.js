const PLAN_KEYS = new Set(['monthly', 'annual']);

function resolvePriceId(planKey) {
  const monthlyPriceId =
    process.env.STRIPE_PRICE_ID_MONTHLY || process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_MONTHLY || '';
  const annualPriceId =
    process.env.STRIPE_PRICE_ID_ANNUAL || process.env.EXPO_PUBLIC_STRIPE_PRICE_ID_ANNUAL || '';

  if (planKey === 'monthly') return monthlyPriceId;
  if (planKey === 'annual') return annualPriceId;

  return process.env.EXPO_PUBLIC_STRIPE_PRICE_ID || '';
}

function isValidPriceId(value) {
  return typeof value === 'string' && /^price_[A-Za-z0-9]+$/.test(value) && !value.includes('placeholder');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const { userId, planKey, priceId, successUrl, cancelUrl } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  if (planKey && !PLAN_KEYS.has(planKey)) {
    return res.status(400).json({ error: 'Invalid planKey. Use monthly or annual.' });
  }

  if (!stripeSecretKey) {
    return res.status(503).json({
      error: 'Stripe is not configured yet. Set STRIPE_SECRET_KEY and Stripe price env vars in Vercel.',
    });
  }

  const resolvedPriceId = resolvePriceId(planKey) || priceId || process.env.EXPO_PUBLIC_STRIPE_PRICE_ID || '';
  if (!isValidPriceId(resolvedPriceId)) {
    return res.status(503).json({
      error:
        'Stripe price is not configured. Set STRIPE_PRICE_ID_MONTHLY and STRIPE_PRICE_ID_ANNUAL (legacy fallback: EXPO_PUBLIC_STRIPE_PRICE_ID).',
    });
  }

  try {
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('success_url', successUrl || 'https://www.tomoflow.app/paywall?checkout=success');
    params.append('cancel_url', cancelUrl || 'https://www.tomoflow.app/paywall?checkout=cancel');
    params.append('line_items[0][price]', resolvedPriceId);
    params.append('line_items[0][quantity]', '1');
    params.append('client_reference_id', userId);
    params.append('metadata[user_id]', userId);
    if (planKey) params.append('metadata[plan_key]', planKey);
    params.append('subscription_data[metadata][user_id]', userId);
    if (planKey) params.append('subscription_data[metadata][plan_key]', planKey);

    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeSecretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(500).json({ error: data?.error?.message || 'Stripe session creation failed' });
    }

    return res.status(200).json({ id: data.id, url: data.url, planKey: planKey || 'legacy' });
  } catch (_error) {
    return res.status(500).json({ error: 'Unexpected Stripe error' });
  }
}
