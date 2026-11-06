const crypto = require('node:crypto');
const { purchaseConfirmationEmail } = require('./email-brand');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}
function verified(raw, header, secret) {
  if (typeof header !== 'string') return false;
  const pieces = header.split(',').map(p => p.trim().split('='));
  const timestamp = pieces.find(([k]) => k === 't')?.[1];
  if (!/^\d+$/.test(timestamp || '') || Math.abs(Date.now() / 1000 - Number(timestamp)) > 300) return false;
  const expected = crypto.createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  return pieces.some(([k, v]) => k === 'v1' && /^[a-f0-9]{64}$/i.test(v || '') && crypto.timingSafeEqual(expected, Buffer.from(v, 'hex')));
}
async function stripe(path) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`, 'Stripe-Version': '2024-11-20.acacia' },
  });
  if (!response.ok) throw new Error('Stripe request failed');
  return response.json();
}
// Deliberately require configured exact identifiers; app=tomoflow alone also describes tips.
async function isPro(session) {
  const id = value => typeof value === 'string' ? value : value?.id;
  const link = process.env.STRIPE_PRO_PAYMENT_LINK_ID;
  if (link && id(session.payment_link) === link) return true;
  let after;
  do {
    const params = new URLSearchParams({ limit: '100' });
    if (after) params.set('starting_after', after);
    const page = await stripe(`/checkout/sessions/${encodeURIComponent(session.id)}/line_items?${params}`);
    for (const item of page.data || []) {
      if ((process.env.STRIPE_PRO_PRICE_ID && id(item.price) === process.env.STRIPE_PRO_PRICE_ID) ||
          (process.env.STRIPE_PRO_PRODUCT_ID && id(item.price?.product) === process.env.STRIPE_PRO_PRODUCT_ID)) return true;
    }
    if (!page.has_more) return false;
    after = page.data?.at(-1)?.id;
    if (!after) throw new Error('Invalid Stripe pagination');
  } while (after);
  return false;
}
async function redis(...command) {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  });
  const data = await response.json();
  if (!response.ok || data.error) throw new Error('Delivery store unavailable');
  return data.result;
}
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { error: 'Method not allowed' });
  if (!process.env.STRIPE_WEBHOOK_SECRET) return json(res, 503, { error: 'Webhook not configured' });
  let raw;
  try {
    const chunks = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    raw = Buffer.concat(chunks);
  } catch { return json(res, 400, { error: 'Could not read body' }); }
  if (!verified(raw, req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET)) return json(res, 400, { error: 'Invalid signature' });
  let event;
  try { event = JSON.parse(raw); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
  if (!['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event?.type)) return json(res, 200, { ignored: true });
  const session = event.data?.object;
  if (!session || session.object !== 'checkout.session' || !/^cs_[a-zA-Z0-9_]+$/.test(session.id || '')) return json(res, 400, { error: 'Invalid session' });
  if (session.mode !== 'payment' || session.status !== 'complete' || session.payment_status !== 'paid') return json(res, 200, { ignored: true });
  try {
    if (!process.env.STRIPE_SECRET_KEY || !['STRIPE_PRO_PAYMENT_LINK_ID', 'STRIPE_PRO_PRICE_ID', 'STRIPE_PRO_PRODUCT_ID'].some(k => process.env[k])) throw new Error('Purchase verification not configured');
    if (!await isPro(session)) return json(res, 200, { ignored: true });
    const to = session.customer_details?.email || session.customer_email;
    if (typeof to !== 'string' || to.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) throw new Error('Purchase recipient missing');
    if (!Number.isSafeInteger(session.amount_total) || session.amount_total <= 0 || !/^[a-z]{3}$/.test(session.currency || '') || typeof session.livemode !== 'boolean') throw new Error('Invalid purchase details');
    if (!process.env.RESEND_API_KEY || !process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) throw new Error('Delivery not configured');
    const key = `tomoflow:confirmation:v1:${session.livemode ? 'live' : 'test'}:${session.id}`;
    // Atomic first writer freezes the entire payload, so concurrent events use identical requests.
    const record = { started: Date.now(), mail: {
      from: process.env.RESEND_FROM || 'TomoFlow <noreply@tomoflow.app>', to,
      ...purchaseConfirmationEmail({ session }),
    } };
    await redis('SET', key, JSON.stringify(record), 'NX');
    const saved = JSON.parse(await redis('GET', key));
    if (saved.sent) return json(res, 200, { duplicate: true });
    // Resend retains idempotency keys for 24 hours. Never risk a second email after expiry.
    if (Date.now() - saved.started > 23 * 60 * 60 * 1000) throw new Error('Delivery requires reconciliation');
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
      body: JSON.stringify(saved.mail),
    });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error('Email send failed');
    await redis('SET', key, JSON.stringify({ ...saved, sent: result.id }));
    return json(res, 200, { sent: true });
  } catch (error) {
    console.error('purchase confirmation:', error.message);
    return json(res, 503, { error: 'Confirmation pending; retry required' });
  }
};
// Stripe signatures require the exact bytes, before any platform JSON parsing.
module.exports.config = { api: { bodyParser: false } };
