/**
 * POST /api/stripe-webhook
 *
 * Stub for checkout.session.completed → mark entitlement / email unlock.
 *
 * When STRIPE_WEBHOOK_SECRET is set, verifies the Stripe-Signature header shape
 * and (best-effort) HMAC. Full verification should use Stripe's official
 * constructEvent once you attach a live endpoint.
 *
 * TODO (go-live):
 *  - On checkout.session.completed with payment_status=paid:
 *      store email → entitlement (KV / DB) and/or send Resend unlock mail
 *  - Idempotency on event.id
 *  - Reject unsigned / mismatched signatures with 400
 */

const crypto = require("crypto");

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

/**
 * Lightweight signature check: require Stripe-Signature header and, when a
 * webhook secret exists, verify at least one v1 HMAC over the signed payload.
 * Not a full substitute for stripe.webhooks.constructEvent — good enough for
 * sandbox wiring and to fail closed when the header is missing.
 */
function verifyStripeSignature(rawBody, header, secret) {
  if (!header || typeof header !== "string") {
    return { ok: false, reason: "missing Stripe-Signature header" };
  }
  if (!secret) {
    // Secrets missing: accept shape-only so local/sandbox stubs can 200.
    const hasT = /(?:^|,)\s*t=\d+/.test(header);
    const hasV1 = /(?:^|,)\s*v1=[0-9a-f]+/i.test(header);
    return hasT && hasV1
      ? { ok: true, mode: "shape-only" }
      : { ok: false, reason: "malformed Stripe-Signature header" };
  }

  const parts = Object.create(null);
  header.split(",").forEach((piece) => {
    const [k, v] = piece.trim().split("=");
    if (!k || v == null) return;
    if (!parts[k]) parts[k] = [];
    parts[k].push(v);
  });

  const timestamp = parts.t && parts.t[0];
  const signatures = parts.v1 || [];
  if (!timestamp || !signatures.length) {
    return { ok: false, reason: "incomplete Stripe-Signature header" };
  }

  const signedPayload = `${timestamp}.${rawBody.toString("utf8")}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  const match = signatures.some((sig) => {
    try {
      const a = Buffer.from(expected, "hex");
      const b = Buffer.from(sig, "hex");
      return a.length === b.length && crypto.timingSafeEqual(a, b);
    } catch {
      return false;
    }
  });

  return match ? { ok: true, mode: "hmac" } : { ok: false, reason: "signature mismatch" };
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  let raw;
  try {
    raw = await readRawBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Could not read body" });
  }

  const sigHeader = req.headers["stripe-signature"];
  const verified = verifyStripeSignature(raw, sigHeader, secret);

  if (!secret) {
    // Documented stub path — acknowledge event so Stripe retries don't pile up
    // while env is still being wired. Never treat this as production-safe.
    console.warn(
      "stripe-webhook: STRIPE_WEBHOOK_SECRET missing — returning 200 stub. Do not use in production."
    );
    return json(res, 200, {
      ok: true,
      stub: true,
      todo: "Set STRIPE_WEBHOOK_SECRET and handle checkout.session.completed → entitlement / Resend unlock email",
      signature: verified,
    });
  }

  if (!verified.ok) {
    return json(res, 400, { ok: false, error: verified.reason || "Invalid signature" });
  }

  let event;
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    return json(res, 400, { ok: false, error: "Invalid JSON" });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data && event.data.object;
    const email =
      session?.customer_details?.email ||
      session?.customer_email ||
      null;
    const paid =
      session?.payment_status === "paid" ||
      session?.payment_status === "no_payment_required";

    // TODO: persist entitlement for `email` and/or send Resend magic unlock.
    console.log("checkout.session.completed", {
      id: session?.id,
      email,
      paid,
      // entitlement / Resend wiring lands here
    });
  }

  return json(res, 200, { ok: true, received: true, type: event.type || null });
};
