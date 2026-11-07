const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { sign, verify, cookie } = require('../lib/pro-access');
const unlock = require('../api/unlock-pro');
const start = require('../api/start-checkout');
const restore = require('../api/restore-pro');
const env = { ...process.env }, originalFetch = global.fetch;
let purchase, allowed, used, requests, sendCount;
const paid = extra => ({ id: 'cs_test_purchase', payment_intent: { status: 'succeeded', latest_charge: { paid: true, refunded: false } }, mode: 'payment', status: 'complete', payment_status: 'paid', payment_link: 'plink_pro', livemode: false, customer_email: 'buyer@example.com', ...extra });
beforeEach(() => {
  Object.assign(process.env, { PRO_TOKEN_SECRET: 'a'.repeat(64), STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_PRO_PAYMENT_LINK_ID: 'plink_pro', TOMOFLOW_SUPABASE_URL: 'https://database.example', TOMOFLOW_SUPABASE_SECRET_KEY: 'sb_secret_mock', RESEND_API_KEY: 'mock' });
  delete process.env.STRIPE_PRO_PRICE_ID; delete process.env.STRIPE_PRO_PRODUCT_ID;
  purchase = paid(); allowed = true; used = false; requests = []; sendCount = 0;
  global.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    if (url.endsWith('/rpc/claim_pro_requests')) {
      assert.doesNotMatch(options.body, /buyer@example|unknown/);
      const params = JSON.parse(options.body);
      assert.ok(params.p_keys.every(x => /^[a-f0-9]{64}$/.test(x)));
      let result = allowed;
      if (params.p_limits[0] === 1) { result = !used; used = true; }
      return { ok: true, json: async () => result };
    }
    if (url.startsWith('https://api.stripe.com/')) return { ok: true, json: async () => url.includes('sessions?') ? { data: purchase ? [purchase] : [], has_more: false } : purchase };
    assert.equal(url, 'https://api.resend.com/emails'); sendCount++;
    return { ok: true, json: async () => ({ id: 'mock-mail' }) };
  };
});
afterEach(() => { process.env = { ...env }; global.fetch = originalFetch; });
async function call(handler, body = {}, headers = {}, method = 'POST') {
  const req = Readable.from([Buffer.from(JSON.stringify(body))]);
  req.method = method; req.headers = { host: 'www.tomoflow.app', ...headers };
  const res = { headers: {}, setHeader(key, value) { this.headers[key] = value; }, end(value) { this.body = value ? JSON.parse(value) : null; } };
  await handler(req, res); return res;
}
function context() {
  const token = sign('checkout', {}, 86400);
  purchase.client_reference_id = verify(token, 'checkout').nonce;
  return { cookie: cookie(token).split(';')[0] };
}
test('signed tokens reject expiry, tampering and a different purpose', () => {
  const token = sign('restore', { sessionId: 'cs_test_purchase' }, 1800);
  assert.equal(verify(token, 'restore').sessionId, 'cs_test_purchase');
  assert.equal(verify(token, 'checkout'), null);
  assert.equal(verify(token.replace(/.$/, token.endsWith('a') ? 'b' : 'a'), 'restore'), null);
  assert.equal(verify(sign('restore', {}, -1), 'restore'), null);
  assert.equal(verify('anything', 'restore'), null);
});
test('checkout redirect carries a random reference bound to an HttpOnly cookie', async () => {
  const result = await call(start, {}, {}, 'GET');
  assert.equal(result.statusCode, 303);
  const url = new URL(result.headers.Location);
  assert.equal(url.origin, 'https://buy.stripe.com');
  assert.match(url.pathname, /^\/test_/);
  assert.match(result.headers['Set-Cookie'], /HttpOnly; SameSite=Lax/);
  const token = result.headers['Set-Cookie'].split(';')[0].split('=')[1];
  assert.equal(url.searchParams.get('client_reference_id'), verify(token, 'checkout').nonce);
});
test('checkout unlock requires a valid context from the same browser and a matching paid purchase', async () => {
  assert.equal((await call(unlock, { sessionId: 'cs_test_purchase' })).statusCode, 401);
  const headers = context();
  purchase.client_reference_id = 'another-browser';
  assert.equal((await call(unlock, { sessionId: 'cs_test_purchase' }, headers)).statusCode, 403);
  const valid = context();
  const result = await call(unlock, { sessionId: 'cs_test_purchase' }, valid);
  assert.equal(result.body.unlocked, true);
  assert.match(result.headers['Set-Cookie'], /Max-Age=0/);
});
test('unpaid, unrelated, subscription, free and live sessions never unlock', async () => {
  for (const extra of [{ payment_status: 'unpaid' }, { payment_link: 'plink_tip' }, { mode: 'subscription' }, { payment_status: 'no_payment_required' }, { livemode: true }]) {
    purchase = paid(extra);
    const result = await call(unlock, { sessionId: 'cs_test_purchase' }, context());
    assert.notEqual(result.body.unlocked, true);
  }
});
test('restore token is redeemed once only after the purchase is reverified', async () => {
  const token = sign('restore', { sessionId: 'cs_test_purchase' }, 1800);
  assert.equal((await call(unlock, { restoreToken: token })).body.unlocked, true);
  assert.equal((await call(unlock, { restoreToken: token })).statusCode, 410);
  purchase = paid({ payment_link: 'plink_tip' }); used = false;
  assert.equal((await call(unlock, { restoreToken: token })).statusCode, 403);
  assert.equal(used, false);
});
test('Restore does not reveal purchase existence and throttles before Stripe or Resend calls', async () => {
  const found = await call(restore, { email: 'buyer@example.com' });
  assert.equal(sendCount, 1);
  const mail = JSON.parse(requests.find(r => r.url.includes('resend')).options.body);
  const token = mail.text.match(/#restore=([A-Za-z0-9_.-]+)/)[1];
  assert.equal(verify(token, 'restore').sessionId, 'cs_test_purchase');
  assert.match(mail.text, /30 minutes/);
  purchase = null;
  const missing = await call(restore, { email: 'buyer@example.com' });
  assert.deepEqual(missing.body, found.body);
  allowed = false; requests = [];
  const blocked = await call(restore, { email: 'buyer@example.com' });
  assert.equal(blocked.statusCode, 429);
  assert.equal(requests.length, 1);
  assert.equal(sendCount, 1);
});
test('cross-origin requests and unavailable request protection fail closed', async () => {
  assert.equal((await call(restore, { email: 'buyer@example.com' }, { origin: 'https://evil.example' })).statusCode, 403);
  assert.equal((await call(unlock, {}, { origin: 'https://evil.example' })).statusCode, 403);
  global.fetch = async () => { throw new Error('mock outage'); };
  assert.equal((await call(restore, { email: 'buyer@example.com' })).statusCode, 503);
  assert.equal((await call(start, {}, {}, 'GET')).statusCode, 503);
  assert.equal(sendCount, 0);
});
test('fully refunded purchases cannot be restored or grant a new checkout unlock', async () => {
  purchase.payment_intent.latest_charge.refunded = true;
  const result = await call(unlock, { sessionId: 'cs_test_purchase' }, context());
  assert.equal(result.statusCode, 403);
  const restoreResult = await call(restore, { email: 'buyer@example.com' });
  assert.equal(restoreResult.body.accepted, true);
  assert.equal(sendCount, 0);
});
test('concurrent restore redemptions produce only one successful grant', async () => {
  const restoreToken = sign('restore', { sessionId: 'cs_test_purchase' }, 1800);
  const results = await Promise.all([call(unlock, { restoreToken }), call(unlock, { restoreToken })]);
  assert.equal(results.filter(r => r.body.unlocked === true).length, 1);
  assert.equal(results.filter(r => r.statusCode === 410).length, 1);
});
test('throttled checkout/unlock requests cannot reach Stripe or issue a cookie', async () => {
  allowed = false;
  const result = await call(start, {}, {}, 'GET');
  assert.equal(result.statusCode, 429);
  assert.equal(result.headers['Set-Cookie'], undefined);
  assert.equal((await call(unlock, { sessionId: 'cs_test_purchase' }, context())).statusCode, 429);
  assert.equal(requests.some(r => r.url.startsWith('https://api.stripe.com')), false);
});
test('oversized requests are rejected before provider access', async () => {
  const result = await call(unlock, { restoreToken: 'x'.repeat(9000) });
  assert.equal(result.statusCode, 400);
  assert.equal(requests.length, 0);
});
