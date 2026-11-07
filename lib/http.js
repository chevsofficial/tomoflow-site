function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.end(JSON.stringify(body));
}
async function readJson(req) {
  let raw = req.body;
  if (raw === undefined) {
    const chunks = []; let length = 0;
    for await (const chunk of req) {
      const bytes = Buffer.from(chunk); length += bytes.length;
      if (length > 8192) throw new Error('Request too large');
      chunks.push(bytes);
    }
    raw = Buffer.concat(chunks).toString() || '{}';
  }
  if (typeof raw === 'object' && raw !== null && !Buffer.isBuffer(raw)) {
    if (JSON.stringify(raw).length > 8192) throw new Error('Request too large');
    return raw;
  }
  if (String(raw).length > 8192) throw new Error('Request too large');
  return JSON.parse(String(raw));
}
function sameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return true;
  return origin === `https://${req.headers.host}` || (!['production', 'preview'].includes(process.env.VERCEL_ENV) && origin === `http://${req.headers.host}`);
}
module.exports = { json, readJson, sameOrigin };
