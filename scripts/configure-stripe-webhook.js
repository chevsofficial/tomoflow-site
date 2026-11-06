// Explicit operator command; never part of normal builds. No purchase replay or email.
async function configure(id) {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key?.startsWith('sk_test_')) throw new Error('Sandbox key required');
  if (!/^we_[a-zA-Z0-9]+$/.test(id || '')) throw new Error('An existing webhook endpoint ID is required');
  const url = `https://api.stripe.com/v1/webhook_endpoints/${id}`;
  const headers = { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-11-20.acacia' };
  const current = await fetch(url, { headers, signal: AbortSignal.timeout(30000) });
  if (!current.ok) throw new Error(`Stripe endpoint lookup failed (HTTP ${current.status})`);
  const endpoint = await current.json();
  if (endpoint.livemode !== false || endpoint.url !== 'https://www.tomoflow.app/api/stripe-webhook' || endpoint.status !== 'enabled') {
    throw new Error('Refusing to modify an unrelated, live or disabled endpoint');
  }
  const required = ['checkout.session.completed', 'checkout.session.async_payment_succeeded'];
  const existing = endpoint.enabled_events || [];
  if (existing.includes('*') || required.every(type => existing.includes(type))) {
    console.log('Existing sandbox webhook subscriptions already complete.'); return;
  }
  const events = [...new Set([...existing, ...required])];
  const body = new URLSearchParams();
  events.forEach(type => body.append('enabled_events[]', type));
  const updated = await fetch(url, {
    method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
    body, signal: AbortSignal.timeout(30000),
  });
  if (!updated.ok) throw new Error(`Stripe endpoint update failed (HTTP ${updated.status})`);
  const result = await updated.json();
  if (!required.every(type => result.enabled_events?.includes(type))) throw new Error('Stripe did not confirm required subscriptions');
  console.log(`Updated sandbox webhook ${id}: both success subscriptions enabled.`);
}
if (require.main === module) configure(process.argv[2]).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = configure;
