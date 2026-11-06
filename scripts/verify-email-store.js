// Runs in Vercel builds. No emails, purchase replay, data writes or credential logging.
async function verify() {
  if (process.env.VERCEL_ENV !== 'production') {
    console.log('Email store connectivity check skipped outside Production.');
    return;
  }
  const required = ['TOMOFLOW_SUPABASE_URL', 'TOMOFLOW_SUPABASE_SECRET_KEY', 'STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'RESEND_API_KEY'];
  for (const name of required) {
    if (!process.env[name]?.trim()) throw new Error(`Missing required configuration: ${name}`);
  }
  if (!process.env.STRIPE_SECRET_KEY.startsWith('sk_test_')) throw new Error('Stripe must remain in sandbox.');
  if (!['STRIPE_PRO_PRODUCT_ID', 'STRIPE_PRO_PRICE_ID', 'STRIPE_PRO_PAYMENT_LINK_ID'].some(name => process.env[name]?.trim())) {
    throw new Error('An exact Pro identifier is required.');
  }
  const key = process.env.TOMOFLOW_SUPABASE_SECRET_KEY.trim();
  const base = process.env.TOMOFLOW_SUPABASE_URL.trim().replace(/\/$/, '');
  const url = new URL(base);
  if (url.protocol !== 'https:' || !url.hostname.endsWith('.supabase.co')) throw new Error('Invalid Supabase project URL.');
  if (!key.startsWith('sb_secret_')) {
    let claims;
    try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString()); } catch { /* rejected below */ }
    if (claims?.role !== 'service_role') throw new Error('A server-only Supabase secret or service_role key is required.');
  }
  const result = await fetch(`${base}/rest/v1/purchase_email_deliveries?select=delivery_key&limit=0`, {
    headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }) },
    signal: AbortSignal.timeout(30000),
  });
  if (!result.ok) throw new Error(`Supabase email store connectivity failed (HTTP ${result.status}).`);
  const rows = await result.json();
  if (!Array.isArray(rows) || rows.length !== 0) throw new Error('Unexpected Supabase email store response.');
  console.log('Production email store: Supabase Data API access verified; Stripe sandbox configuration verified.');
}
if (require.main === module) {
  verify().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = verify;
