const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const verify = require('../scripts/verify-checkout-link');
const config = require('../assets/js/config');
const env = { ...process.env }, originalFetch = global.fetch;
beforeEach(() => Object.assign(process.env, { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_PRO_PAYMENT_LINK_ID: 'plink_mock', PRO_TOKEN_SECRET: 'a'.repeat(64), TOMOFLOW_SUPABASE_URL: 'https://database.example', TOMOFLOW_SUPABASE_SECRET_KEY: 'sb_secret_mock', PUBLIC_SITE_URL: 'https://www.tomoflow.app' }));
afterEach(() => { process.env = { ...env }; global.fetch = originalFetch; });
const expected = 'https://www.tomoflow.app/?session_id={CHECKOUT_SESSION_ID}';
const link = overrides => ({ active: true, livemode: false, url: config.stripePaymentLink, after_completion: { type: 'redirect', redirect: { url: 'https://www.tomoflow.app/?pro=1' } }, ...overrides });
test('explicit setup changes only the existing sandbox Payment Link redirect', async () => {
  let updated = false;
  global.fetch = async (url, options) => {
    if (url.includes('/rpc/')) return { ok: true, json: async () => true };
    if (options.method === 'POST') {
      updated = true;
      assert.deepEqual([...options.body.keys()], ['after_completion[type]', 'after_completion[redirect][url]']);
      assert.equal(options.body.get('after_completion[redirect][url]'), expected);
      return { ok: true, json: async () => ({ after_completion: { redirect: { url: expected } } }) };
    }
    return { ok: true, json: async () => link() };
  };
  await verify(true); assert.equal(updated, true);
});
test('read-only checks and unrelated/live/inactive link checks never mutate Stripe', async () => {
  for (const overrides of [{}, { livemode: true }, { active: false }, { url: 'https://other.example' }]) {
    global.fetch = async (_url, options) => {
      assert.equal(options.method, undefined);
      return { ok: true, json: async () => link(overrides) };
    };
    await assert.rejects(() => verify(false));
  }
});
test('live secret keys are rejected before any request', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_mock';
  global.fetch = async () => assert.fail('must not request');
  await assert.rejects(() => verify(true), /sandbox/);
});
