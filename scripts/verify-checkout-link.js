// Stripe reads by default, plus one synthetic Supabase counter claim. --configure updates only this sandbox link's redirect.
const config = require('../assets/js/config');
async function verify(configure = false) {
  if (process.env.VERCEL_ENV !== 'production') return;
  const key = process.env.STRIPE_SECRET_KEY;
  const id = process.env.STRIPE_PRO_PAYMENT_LINK_ID?.trim();
  if (!key?.startsWith('sk_test_') || !/^plink_[a-zA-Z0-9_]+$/.test(id || '')) throw new Error('Existing sandbox Payment Link configuration required');
  const url = `https://api.stripe.com/v1/payment_links/${id}`;
  const headers = { Authorization: `Bearer ${key}`, 'Stripe-Version': '2024-11-20.acacia' };
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Payment Link lookup failed (HTTP ${response.status})`);
  const link = await response.json();
  if (link.livemode !== false || link.active !== true || link.url !== config.stripePaymentLink) throw new Error('Refusing an unrelated, live or inactive Payment Link');
  const destination = `${(process.env.PUBLIC_SITE_URL || 'https://www.tomoflow.app').trim().replace(/\/$/, '')}/?session_id={CHECKOUT_SESSION_ID}`;
  if (link.after_completion?.type !== 'redirect' || link.after_completion.redirect?.url !== destination) {
    if (!configure) throw new Error('Payment Link needs the verified checkout redirect');
    const changed = await fetch(url, {
      method: 'POST', headers: { ...headers, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ 'after_completion[type]': 'redirect', 'after_completion[redirect][url]': destination }),
      signal: AbortSignal.timeout(15000),
    });
    if (!changed.ok) throw new Error(`Payment Link redirect update failed (HTTP ${changed.status})`);
    const result = await changed.json();
    if (result.after_completion?.redirect?.url !== destination) throw new Error('Payment Link redirect not confirmed');
  }
  // Also exercise the actual production RPC without sending email or redeeming a link.
  const { claim } = require('../lib/request-limits');
  if (!await claim([['checkout-deployment-verification', 100, 3600]])) throw new Error('Request protection verification failed');
  console.log('Sandbox Payment Link redirect and production request protection verified.');
}
if (require.main === module) verify(process.argv.includes('--configure')).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = verify;
