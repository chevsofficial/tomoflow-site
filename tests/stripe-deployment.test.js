const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const verify = require('../scripts/verify-stripe-webhook');
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
beforeEach(() => Object.assign(process.env, { VERCEL_ENV: 'production', STRIPE_SECRET_KEY: 'sk_test_mock' }));
afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; });
const endpoint = overrides => ({ id: 'we_mock', url: 'https://www.tomoflow.app/api/stripe-webhook', status: 'enabled', livemode: false, enabled_events: ['checkout.session.completed', 'checkout.session.async_payment_succeeded'], ...overrides });
test('webhook audit requires both success subscriptions on the exact enabled sandbox URL', async () => {
  for (const overrides of [{ enabled_events: ['checkout.session.completed'] }, { status: 'disabled' }, { livemode: true }, { url: 'https://other.example/api/stripe-webhook' }]) {
    global.fetch = async () => ({ ok: true, json: async () => ({ data: [endpoint(overrides)], has_more: false }) });
    await assert.rejects(verify, /subscriptions missing/);
  }
});
test('webhook audit paginates without mutating Stripe and accepts wildcard subscriptions', async () => {
  let calls = 0;
  global.fetch = async (url, options) => {
    assert.equal(options.method, undefined);
    calls++;
    if (calls === 1) return { ok: true, json: async () => ({ data: [endpoint({ id: 'we_other', url: 'https://other.example' })], has_more: true }) };
    assert.match(url, /starting_after=we_other/);
    return { ok: true, json: async () => ({ data: [endpoint({ enabled_events: ['*'] })], has_more: false }) };
  };
  await verify(); assert.equal(calls, 2);
});
test('webhook audit rejects live keys and API errors', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_mock';
  await assert.rejects(verify, /Sandbox key required/);
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  global.fetch = async () => ({ ok: false, status: 401 });
  await assert.rejects(verify, /HTTP 401/);
});
