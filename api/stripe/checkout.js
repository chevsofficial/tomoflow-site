export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
  const defaultPriceId = process.env.EXPO_PUBLIC_STRIPE_PRICE_ID;
  const { userId, priceId, successUrl, cancelUrl } = req.body || {};

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  if (!stripeSecretKey) {
    return res.status(503).json({
      error: 'Stripe is not configured yet. Set STRIPE_SECRET_KEY and EXPO_PUBLIC_STRIPE_PRICE_ID in Vercel.',
    });
  }

  const resolvedPriceId = priceId || defaultPriceId;
  if (!resolvedPriceId || resolvedPriceId.includes('placeholder')) {
    return res.status(503).json({
      error: 'Stripe price is not configured. Set EXPO_PUBLIC_STRIPE_PRICE_ID in Vercel.',
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
    params.append('subscription_data[metadata][user_id]', userId);

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

    return res.status(200).json({ id: data.id, url: data.url });
  } catch (_error) {
    return res.status(500).json({ error: 'Unexpected Stripe error' });
  }
}
