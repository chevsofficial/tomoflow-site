// Server-only durable outbox. Never expose this credential to the static client.
async function request(query, options = {}) {
  const key = process.env.TOMOFLOW_SUPABASE_SECRET_KEY;
  const base = process.env.TOMOFLOW_SUPABASE_URL?.replace(/\/$/, '');
  if (!key || !base) throw new Error('Delivery store not configured');
  const response = await fetch(`${base}/rest/v1/purchase_email_deliveries${query}`, {
    ...options,
    headers: {
      apikey: key,
      // Modern secret keys are not JWTs. Legacy service_role keys also need Bearer auth.
      ...(key.startsWith('sb_secret_') ? {} : { Authorization: `Bearer ${key}` }),
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!response.ok) throw new Error('Delivery store unavailable');
  return response;
}
async function getOrCreate(deliveryKey, mail) {
  // A primary key plus DO NOTHING keeps the first payload and timestamp immutable.
  await request('?on_conflict=delivery_key', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=minimal' },
    body: JSON.stringify({ delivery_key: deliveryKey, mail }),
  });
  const response = await request(`?delivery_key=eq.${encodeURIComponent(deliveryKey)}&select=started,mail,sent&limit=1`);
  const rows = await response.json();
  const saved = rows?.[0];
  if (!saved || !Number.isSafeInteger(saved.started) || !saved.mail || typeof saved.mail !== 'object') {
    throw new Error('Invalid delivery record');
  }
  return saved;
}
async function markSent(deliveryKey, emailId) {
  const response = await request(`?delivery_key=eq.${encodeURIComponent(deliveryKey)}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ sent: emailId }),
  });
  const rows = await response.json();
  if (rows?.length !== 1 || rows[0].sent !== emailId) throw new Error('Delivery marker not saved');
}
module.exports = { getOrCreate, markSent };
