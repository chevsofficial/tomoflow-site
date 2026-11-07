// POST /api/restore-pro — verify a paid Pro checkout and email the existing restore link.
const { restoreProEmail } = require('../lib/email-brand');
const { stripeGet, isPaidProSession } = require('../lib/stripe');

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
}

async function readBody(req) {
  // Vercel may provide parsed JSON; stream parsing also supports local Node tests.
  if (req.body !== undefined) {
    return typeof req.body === 'string' || Buffer.isBuffer(req.body) ? JSON.parse(req.body.toString()) : req.body;
  }
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString() || '{}');
}

async function findPurchase(email) {
  let after;
  for (let pageNumber = 0; pageNumber < 50; pageNumber++) {
    const params = new URLSearchParams({ limit: '100', status: 'complete' });
    params.append('expand[]', 'data.line_items');
    if (after) params.set('starting_after', after);
    const page = await stripeGet(`/checkout/sessions?${params}`);
    for (const session of page.data || []) {
      const buyer = session.customer_details?.email || session.customer_email;
      if (typeof buyer === 'string' && buyer.trim().toLowerCase() === email.toLowerCase() && await isPaidProSession(session)) return true;
    }
    if (!page.has_more) return false;
    after = page.data?.at(-1)?.id;
    if (!after) throw new Error('Invalid Stripe pagination');
  }
  // Do not report "no purchase" if the search stopped before exhausting results.
  throw new Error('Purchase lookup limit reached');
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return json(res, 405, { ok: false, error: 'Method not allowed' });
  if (!process.env.STRIPE_SECRET_KEY || !process.env.RESEND_API_KEY) {
    return json(res, 503, { ok: false, error: 'Restore email is temporarily unavailable. Please try again later.' });
  }
  let body;
  try { body = await readBody(req); }
  catch { return json(res, 400, { ok: false, error: 'Invalid JSON body' }); }
  const email = typeof body?.email === 'string' ? body.email.trim() : '';
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(res, 400, { ok: false, error: 'Enter a valid email address' });
  }
  try {
    if (!await findPurchase(email)) {
      return json(res, 404, { ok: false, error: 'No paid TomoFlow Pro purchase found for that email. Check your checkout email or contact support@tomoflow.app.' });
    }
    const base = (process.env.PUBLIC_SITE_URL || 'https://www.tomoflow.app').trim().replace(/\/$/, '');
    const mail = restoreProEmail({ unlockUrl: `${base}/?pro=1&restore=1` });
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: process.env.RESEND_FROM || 'TomoFlow <noreply@tomoflow.app>', to: [email], ...mail }),
      signal: AbortSignal.timeout(15000),
    });
    const result = await response.json();
    if (!response.ok || !result.id) throw new Error('Restore email send failed');
    return json(res, 200, { ok: true, emailed: true, message: 'Check your email for a restore link.' });
  } catch (error) {
    console.error('restore-pro:', error.message);
    return json(res, 503, { ok: false, error: 'Could not restore Pro right now. Please try again in a moment.' });
  }
};
