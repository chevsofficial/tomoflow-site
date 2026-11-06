const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const verify = require('../scripts/verify-email-store');
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => {
  Object.assign(process.env, { VERCEL_ENV: 'production', TOMOFLOW_SUPABASE_URL: 'https://example.supabase.co', TOMOFLOW_SUPABASE_SECRET_KEY: 'sb_secret_mock', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_WEBHOOK_SECRET: 'mock', RESEND_API_KEY: 'mock', STRIPE_PRO_PAYMENT_LINK_ID: 'plink_mock' });
});
afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; });
test('production deployment verifies zero-row Data API access without email or writes', async () => {
  global.fetch = async (url, options) => {
    assert.equal(url, 'https://example.supabase.co/rest/v1/purchase_email_deliveries?select=delivery_key&limit=0');
    assert.equal(options.method, undefined);
    assert.equal(options.headers.apikey, 'sb_secret_mock');
    return { ok: true, json: async () => [] };
  };
  await verify();
});
test('production deployment rejects live Stripe keys and missing credentials before network access', async () => {
  global.fetch = async () => assert.fail('must not request');
  process.env.STRIPE_SECRET_KEY = 'sk_live_mock';
  await assert.rejects(verify, /sandbox/);
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  delete process.env.TOMOFLOW_SUPABASE_SECRET_KEY;
  await assert.rejects(verify, /Missing required configuration/);
});
test('production deployment rejects publishable keys and Supabase API authentication failures', async () => {
  process.env.TOMOFLOW_SUPABASE_SECRET_KEY = 'sb_publishable_mock';
  await assert.rejects(verify, /server-only/);
  process.env.TOMOFLOW_SUPABASE_SECRET_KEY = 'sb_secret_mock';
  global.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(verify, /HTTP 401/);
});
test('preview deployment never requests Production database access', async () => {
  process.env.VERCEL_ENV = 'preview';
  global.fetch = async () => assert.fail('must not request');
  await verify();
});
