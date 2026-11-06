const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Readable } = require('node:stream');
const webhook = require('../api/stripe-webhook');
const restore = require('../api/restore-pro');
const { restoreProEmail, purchaseConfirmationEmail } = require('../api/email-brand');
const originalEnv = { ...process.env };
const originalFetch = global.fetch;
let records, sends, accepted, failSend, failStore, stripePages, stripeCalls;
const session = overrides => ({ object: 'checkout.session', id: 'cs_test_purchase', mode: 'payment', status: 'complete', payment_status: 'paid', payment_link: 'plink_pro', customer_details: { email: 'buyer@example.com' }, amount_total: 1875, currency: 'usd', livemode: false, ...overrides });
const event = (overrides, type = 'checkout.session.completed') => ({ id: 'evt_one', type, data: { object: session(overrides) } });
const response = (body, ok = true) => ({ ok, json: async () => body });
beforeEach(() => {
  Object.assign(process.env, { STRIPE_WEBHOOK_SECRET: 'whsec_mock', STRIPE_SECRET_KEY: 'sk_test_mock', STRIPE_PRO_PAYMENT_LINK_ID: 'plink_pro', RESEND_API_KEY: 'mock', SUPABASE_URL: 'https://database.example', SUPABASE_SECRET_KEY: 'sb_secret_mock' });
  delete process.env.STRIPE_PRO_PRICE_ID;
  delete process.env.STRIPE_PRO_PRODUCT_ID;
  records = new Map(); sends = []; accepted = new Map(); failSend = false; failStore = false; stripeCalls = 0;
  stripePages = [{ data: [], has_more: false }];
  global.fetch = async (url, options) => {
    if (url.startsWith('https://database.example/rest/v1/purchase_email_deliveries')) {
      assert.equal(options.headers.apikey, process.env.SUPABASE_SECRET_KEY);
      if (process.env.SUPABASE_SECRET_KEY.startsWith('sb_secret_')) assert.equal(options.headers.Authorization, undefined);
      const parsed = new URL(url);
      if (options.method === 'POST') {
        assert.equal(options.headers.Prefer, 'resolution=ignore-duplicates,return=minimal');
        const row = JSON.parse(options.body);
        if (!records.has(row.delivery_key)) records.set(row.delivery_key, JSON.stringify({ started: Date.now(), mail: row.mail, sent: null }));
        return response(null);
      }
      const key = parsed.searchParams.get('delivery_key').slice(3);
      if (options.method === 'PATCH') {
        if (failStore) throw new Error('store failed');
        const row = JSON.parse(records.get(key));
        row.sent = JSON.parse(options.body).sent;
        records.set(key, JSON.stringify(row));
        return response([row]);
      }
      return response(records.has(key) ? [JSON.parse(records.get(key))] : []);
    }
    if (url.startsWith('https://api.stripe.com')) { stripeCalls++; return response(stripePages.shift()); }
    assert.equal(url, 'https://api.resend.com/emails');
    sends.push(options);
    if (failSend) return response({}, false);
    const key = options.headers['Idempotency-Key'];
    if (accepted.has(key)) assert.equal(options.body, accepted.get(key));
    accepted.set(key, options.body);
    return response({ id: 'email_mock' });
  };
});
afterEach(() => { process.env = { ...originalEnv }; global.fetch = originalFetch; });
async function call(handler, payload, { timestamp = Math.floor(Date.now() / 1000), signature, method = 'POST', raw } = {}) {
  const bytes = raw ?? JSON.stringify(payload);
  const digest = crypto.createHmac('sha256', 'whsec_mock').update(`${timestamp}.${bytes}`).digest('hex');
  const req = Readable.from([Buffer.from(bytes)]);
  req.method = method;
  req.headers = { 'stripe-signature': signature ?? `t=${timestamp},v1=${digest}` };
  const res = { setHeader() {}, end(body) { this.body = JSON.parse(body); } };
  await handler(req, res);
  return res;
}
test('paid Pro sends test-labelled actual amount, text and safe app CTA', async () => {
  assert.equal((await call(webhook, event())).statusCode, 200);
  const mail = JSON.parse(sends[0].body);
  assert.match(mail.subject, /TEST/);
  assert.match(mail.text, /18.75 USD/);
  assert.match(mail.text, /No real money was charged/);
  assert.match(mail.text, /Restore Pro/);
  assert.doesNotMatch(mail.html, /pro=1/);
  assert.equal(webhook.config.api.bodyParser, false);
});
test('signature missing, malformed, incorrect, stale, future and tampered payloads fail', async () => {
  for (const options of [{ signature: '' }, { signature: 't=1,v1=abc' }, { signature: `t=${Math.floor(Date.now()/1000)},v1=${'0'.repeat(64)}` }, { timestamp: 1 }, { timestamp: Math.floor(Date.now()/1000) + 600 }]) {
    assert.equal((await call(webhook, event(), options)).statusCode, 400);
  }
  const timestamp = Math.floor(Date.now()/1000);
  const signature = crypto.createHmac('sha256', 'whsec_mock').update(`${timestamp}.${JSON.stringify(event())}`).digest('hex');
  assert.equal((await call(webhook, event({ amount_total: 9999 }), { signature: `t=${timestamp},v1=${signature}` })).statusCode, 400);
  assert.equal(sends.length, 0);
});
test('missing signing secret fails closed; invalid JSON fails', async () => {
  assert.equal((await call(webhook, null, { raw: '{' })).statusCode, 400);
  delete process.env.STRIPE_WEBHOOK_SECRET;
  assert.equal((await call(webhook, event())).statusCode, 503);
  assert.equal(sends.length, 0);
});
test('unpaid, failed, free, subscription, incomplete and unrelated events ignored', async () => {
  for (const overrides of [{ payment_status: 'unpaid' }, { payment_status: 'no_payment_required' }, { mode: 'subscription' }, { status: 'open' }]) {
    assert.equal((await call(webhook, event(overrides))).statusCode, 200);
  }
  for (const type of ['checkout.session.async_payment_failed', 'payment_intent.succeeded']) await call(webhook, event({}, type));
  assert.equal(sends.length, 0);
  assert.equal(stripeCalls, 0);
});
test('tips and generic app or pro metadata cannot identify Pro', async () => {
  for (const metadata of [{ app: 'tomoflow' }, { sku: 'pro' }]) {
    stripePages = [{ data: [{ price: { id: 'price_tip', product: 'prod_tip', metadata } }], has_more: false }];
    assert.equal((await call(webhook, event({ payment_link: 'plink_tip', metadata }))).statusCode, 200);
  }
  assert.equal(sends.length, 0);
});
test('configured price and product matching paginate Stripe line items', async () => {
  process.env.STRIPE_PRO_PRODUCT_ID = 'prod_pro';
  stripePages = [{ data: [{ id: 'li_tip', price: { product: 'prod_tip' } }], has_more: true }, { data: [{ price: { product: 'prod_pro' } }], has_more: false }];
  assert.equal((await call(webhook, event({ payment_link: null }))).statusCode, 200);
  assert.equal(sends.length, 1);
  process.env.STRIPE_PRO_PRICE_ID = 'price_pro';
  stripePages = [{ data: [{ price: { id: 'price_pro' } }], has_more: false }];
  await call(webhook, event({ id: 'cs_other', payment_link: null }));
  assert.equal(sends.length, 2);
});
test('delayed success sends once across event types, retries and concurrent deliveries', async () => {
  await call(webhook, event({ payment_status: 'unpaid' }));
  await Promise.all([call(webhook, event({}, 'checkout.session.async_payment_succeeded')), call(webhook, event())]);
  await call(webhook, { ...event(), id: 'evt_retry' });
  assert.equal(accepted.size, 1);
  assert.equal(JSON.parse([...records.values()][0]).sent, 'email_mock');
});
test('send failure recovers on retry; marker write failure retries identical request', async () => {
  failSend = true;
  assert.equal((await call(webhook, event())).statusCode, 503);
  failSend = false; failStore = true;
  assert.equal((await call(webhook, event())).statusCode, 503);
  failStore = false;
  assert.equal((await call(webhook, event())).statusCode, 200);
  assert.equal(accepted.size, 1);
  assert.equal(sends[0].body, sends[2].body);
});
test('missing recipient and delivery configuration return retryable errors without sending', async () => {
  assert.equal((await call(webhook, event({ customer_details: {} }))).statusCode, 503);
  delete process.env.SUPABASE_SECRET_KEY;
  assert.equal((await call(webhook, event())).statusCode, 503);
  assert.equal(sends.length, 0);
});
test('expired ambiguous deliveries fail closed; sent records survive indefinitely', async () => {
  await call(webhook, event());
  const key = [...records.keys()][0];
  const record = JSON.parse(records.get(key));
  record.started -= 25 * 60 * 60 * 1000;
  records.set(key, JSON.stringify(record));
  assert.equal((await call(webhook, event())).body.duplicate, true);
  delete record.sent;
  records.set(key, JSON.stringify(record));
  assert.equal((await call(webhook, event())).statusCode, 503);
  assert.equal(sends.length, 1);
});
test('rendering escapes dynamic content and handles live, zero and three decimal currencies', () => {
  for (const [currency, amount, expected] of [['jpy', 2500, '2500 JPY'], ['kwd', 1234, '1.234 KWD'], ['usd', 2100, '21.00 USD']]) {
    const mail = purchaseConfirmationEmail({ session: session({ currency, amount_total: amount, livemode: true, id: '<script>"&' }) });
    assert.match(mail.text, new RegExp(expected.replace('.', '\\.')));
    assert.doesNotMatch(mail.subject, /TEST/);
    assert.match(mail.html, /&lt;script&gt;&quot;&amp;/);
    assert.doesNotMatch(mail.html, /<script>/);
  }
});
test('every visible text cell and paragraph is centered in both templates', () => {
  for (const mail of [restoreProEmail({ unlockUrl: 'https://www.tomoflow.app/?pro=1&restore=1' }), purchaseConfirmationEmail({ session: session() })]) {
    for (const cell of mail.html.matchAll(/<td\b[^>]*>/g)) {
      assert.match(cell[0], /align="center"/);
      if (cell[0].includes('style=')) {
        assert.match(cell[0], /style="[^"]*text-align:center[^"]*"/);
        assert.doesNotMatch(cell[0], /"padding:/);
      }
    }
    for (const paragraph of mail.html.matchAll(/<p\b[^>]*>/g)) assert.match(paragraph[0], /text-align:center/);
    assert.match(mail.html, /support@tomoflow.app/);
    assert.ok(mail.text);
  }
});
test('Restore endpoint still finds purchase and sends the existing branded unlock link', async () => {
  stripePages = [{ data: [] }, { data: [session()], has_more: false }];
  const result = await call(restore, { email: 'buyer@example.com' });
  assert.equal(result.statusCode, 200);
  assert.equal(result.body.emailed, true);
  const mail = JSON.parse(sends[0].body);
  assert.match(mail.html, /pro=1&amp;restore=1/);
  assert.match(mail.text, /stored in that browser only/);
});

test('Stripe lookup and delivery store outages remain retryable', async () => {
  global.fetch = async () => { throw new Error('mock outage'); };
  assert.equal((await call(webhook, event({ payment_link: null }))).statusCode, 503);
  assert.equal((await call(webhook, event())).statusCode, 503);
  assert.equal(sends.length, 0);
});
test('invalid amounts, absent matchers, malformed sessions and non-POST never send', async () => {
  for (const overrides of [{ amount_total: 0 }, { amount_total: -1 }, { amount_total: 1.5 }, { currency: null }, { livemode: undefined }]) {
    assert.equal((await call(webhook, event(overrides))).statusCode, 503);
  }
  assert.equal((await call(webhook, event({ id: '../invalid' }))).statusCode, 400);
  assert.equal((await call(webhook, event(), { method: 'GET' })).statusCode, 405);
  delete process.env.STRIPE_PRO_PAYMENT_LINK_ID;
  assert.equal((await call(webhook, event())).statusCode, 503);
  assert.equal(sends.length, 0);
});
test('Supabase API rejects HTTP failures and missing records; never sends without durable storage', async () => {
  for (const failure of ['insert', 'read', 'missing', 'invalid']) {
    global.fetch = async (_url, options) => {
      if (options.method === 'POST') return response(null, failure !== 'insert');
      if (failure === 'read') return response({}, false);
      return response(failure === 'invalid' ? [{ started: 'not-a-timestamp', mail: {} }] : []);
    };
    assert.equal((await call(webhook, event())).statusCode, 503);
  }
  assert.equal(sends.length, 0);
});
test('Supabase missing update result remains retryable after Resend acceptance', async () => {
  const normalFetch = global.fetch;
  global.fetch = async (url, options) => options.method === 'PATCH' ? response([]) : normalFetch(url, options);
  assert.equal((await call(webhook, event())).statusCode, 503);
  assert.equal(accepted.size, 1);
  global.fetch = normalFetch;
  assert.equal((await call(webhook, event())).statusCode, 200);
  assert.equal(accepted.size, 1);
});
test('legacy service_role credential uses Bearer auth only on Supabase requests', async () => {
  process.env.SUPABASE_SECRET_KEY = 'eyJ_mock_legacy';
  const normalFetch = global.fetch;
  global.fetch = async (url, options) => {
    if (url.startsWith('https://database.example/')) assert.equal(options.headers.Authorization, 'Bearer eyJ_mock_legacy');
    return normalFetch(url, options);
  };
  assert.equal((await call(webhook, event())).statusCode, 200);
});
