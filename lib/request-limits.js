const { digest, ip } = require('./pro-access');
async function claim(entries) {
  const key = process.env.TOMOFLOW_SUPABASE_SECRET_KEY?.trim();
  const base = process.env.TOMOFLOW_SUPABASE_URL?.trim().replace(/\/$/, '');
  if (!key || !base) throw new Error('Request protection not configured');
  const response = await fetch(`${base}/rest/v1/rpc/claim_pro_requests`, {
    method: 'POST',
    headers: { apikey: key, ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }), 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_keys: entries.map(x => digest(x[0])), p_limits: entries.map(x => x[1]), p_windows: entries.map(x => x[2]) }),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error('Request protection unavailable');
  const result = await response.json();
  if (typeof result !== 'boolean') throw new Error('Invalid request protection response');
  return result;
}
function limit(req, scope, count = 20) { return claim([[`${scope}:ip:${ip(req)}`, count, 900]]); }
module.exports = { claim, limit };
