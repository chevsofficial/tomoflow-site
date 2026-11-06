const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const configure = require('../scripts/configure-stripe-webhook');
const env = { ...process.env }, originalFetch = global.fetch;
beforeEach(() => { process.env.STRIPE_SECRET_KEY = 'sk_test_mock'; });
afterEach(() => { process.env = { ...env }; global.fetch = originalFetch; });
const endpoint = overrides => ({ url: 'https://www.tomoflow.app/api/stripe-webhook', livemode: false, status: 'enabled', enabled_events: ['checkout.session.completed', 'checkout.session.expired'], ...overrides });
test('explicit sandbox setup adds delayed success and preserves all existing events', async () => {
  global.fetch = async (_url, options) => {
    if (!options.method) return { ok: true, json: async () => endpoint() };
    assert.equal(options.method, 'POST');
    const events = options.body.getAll('enabled_events[]');
    assert.deepEqual(events, ['checkout.session.completed', 'checkout.session.expired', 'checkout.session.async_payment_succeeded']);
    return { ok: true, json: async () => ({ enabled_events: events }) };
  };
  await configure('we_mock');
});
test('explicit sandbox setup rejects unrelated, disabled and live endpoints', async () => {
  for (const overrides of [{ url: 'https://other.example' }, { livemode: true }, { status: 'disabled' }]) {
    global.fetch = async (_url, options) => {
      assert.equal(options.method, undefined);
      return { ok: true, json: async () => endpoint(overrides) };
    };
    await assert.rejects(() => configure('we_mock'), /Refusing/);
  }
});
test('explicit sandbox setup rejects live credentials and skips already configured endpoints', async () => {
  process.env.STRIPE_SECRET_KEY = 'sk_live_mock';
  await assert.rejects(() => configure('we_mock'), /Sandbox/);
  process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
  global.fetch = async (_url, options) => {
    assert.equal(options.method, undefined);
    return { ok: true, json: async () => endpoint({ enabled_events: ['*'] }) };
  };
  await configure('we_mock');
});
