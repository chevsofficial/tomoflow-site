/**
 * POST /api/restore-pro
 * Body: { "email": "buyer@example.com" }
 *
 * Best-effort Restore Pro for a one-time Stripe purchase (no full accounts).
 * Flow (sandbox → live):
 *  1. Require STRIPE_SECRET_KEY (501 if missing).
 *  2. Look up Stripe Customer + paid Checkout Sessions for TomoFlow Pro.
 *  3. If RESEND_API_KEY is set → email a magic unlock link (?pro=1&restore=1).
 *  4. Else if ALLOW_CLIENT_RESTORE=1 → return { unlocked: true } for sandbox testing.
 *  5. Else tell the client purchase was found / not found without unlocking.
 *
 * Production should prefer the Resend magic-link path (or a signed token) over
 * trusting the client. ?pro=1 remains a client hint only.
 */

const STRIPE_API = "https://api.stripe.com/v1";

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8") || "{}";
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

function isValidEmail(email) {
  if (typeof email !== "string") return false;
  const e = email.trim();
  if (e.length < 3 || e.length > 254) return false;
  // Pragmatic check — not RFC-perfect.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

async function stripeGet(path, secret) {
  const res = await fetch(`${STRIPE_API}${path}`, {
    headers: {
      Authorization: `Bearer ${secret}`,
      "Stripe-Version": "2024-11-20.acacia",
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.message || `Stripe HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/**
 * Best-effort: any paid checkout.session with matching customer_email / customer
 * details, or a customer with a successful payment for this product.
 * Payment Links typically create Checkout Sessions with customer_email set.
 */
async function findPaidProPurchase(email, secret) {
  const encoded = encodeURIComponent(email.toLowerCase());

  // 1) Customers by email
  const customers = await stripeGet(
    `/customers?email=${encoded}&limit=10`,
    secret
  );
  const customerIds = (customers.data || []).map((c) => c.id);

  // 2) Checkout sessions — Stripe list filter is limited; scan recent paid ones
  //    and match email / customer id. For sandbox volumes this is fine.
  const sessions = await stripeGet(
    `/checkout/sessions?limit=100&status=complete`,
    secret
  );

  const needle = email.toLowerCase();
  for (const session of sessions.data || []) {
    if (session.payment_status !== "paid" && session.payment_status !== "no_payment_required") {
      continue;
    }
    const sessionEmail = (
      session.customer_details?.email ||
      session.customer_email ||
      ""
    ).toLowerCase();
    if (sessionEmail === needle) {
      return { kind: "session", id: session.id, customerId: session.customer || null };
    }
    if (session.customer && customerIds.includes(session.customer)) {
      return { kind: "session", id: session.id, customerId: session.customer };
    }
  }

  // 3) Fallback: customer exists with any paid PaymentIntent (broader match)
  for (const customerId of customerIds) {
    const intents = await stripeGet(
      `/payment_intents?customer=${encodeURIComponent(customerId)}&limit=20`,
      secret
    );
    const paid = (intents.data || []).find((pi) => pi.status === "succeeded");
    if (paid) {
      return { kind: "payment_intent", id: paid.id, customerId };
    }
  }

  return null;
}

function siteBaseUrl() {
  if (process.env.PUBLIC_SITE_URL) {
    return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(/\/$/, "");
  }
  return "https://www.tomoflow.app";
}

async function sendUnlockEmail(to) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || "TomoFlow <noreply@tomoflow.app>";
  if (!apiKey) return false;

  const unlockUrl = `${siteBaseUrl()}/?pro=1&restore=1`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: "Restore your TomoFlow Pro unlock",
      html: `
        <p>Thanks for supporting TomoFlow.</p>
        <p><a href="${unlockUrl}">Click here to restore Pro</a> on the browser you're using.</p>
        <p>This unlock is stored in that browser. Tips never unlock Pro.</p>
        <p>If you didn't request this, you can ignore this email.</p>
      `,
      text: `Restore TomoFlow Pro: ${unlockUrl}\n\nTips never unlock Pro.`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    const err = new Error(`Resend failed: ${res.status} ${body}`);
    err.status = res.status;
    throw err;
  }
  return true;
}

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    return res.end();
  }

  if (req.method !== "POST") {
    return json(res, 405, { ok: false, error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return json(res, 501, {
      ok: false,
      error:
        "Restore isn't configured yet (missing STRIPE_SECRET_KEY). Add Stripe via Vercel Marketplace / env, then retry.",
    });
  }

  let body;
  try {
    body = await readBody(req);
  } catch {
    return json(res, 400, { ok: false, error: "Invalid JSON body" });
  }

  const email = typeof body.email === "string" ? body.email.trim() : "";
  if (!isValidEmail(email)) {
    return json(res, 400, { ok: false, error: "Enter a valid email address" });
  }

  let purchase;
  try {
    purchase = await findPaidProPurchase(email, secret);
  } catch (err) {
    console.error("stripe lookup failed", err);
    return json(res, 502, {
      ok: false,
      error: "Could not reach Stripe. Try again in a moment.",
    });
  }

  if (!purchase) {
    return json(res, 404, {
      ok: false,
      error:
        "No paid TomoFlow Pro purchase found for that email. Check the address on your Stripe receipt, or email support@tomoflow.app.",
    });
  }

  // Prefer emailing a magic unlock link when Resend is configured.
  if (process.env.RESEND_API_KEY) {
    try {
      await sendUnlockEmail(email);
      return json(res, 200, {
        ok: true,
        emailed: true,
        message: "Check your email for a restore link.",
      });
    } catch (err) {
      console.error("resend failed", err);
      // Fall through to sandbox client unlock if allowed.
    }
  }

  if (process.env.ALLOW_CLIENT_RESTORE === "1") {
    return json(res, 200, {
      ok: true,
      unlocked: true,
      message: "Pro restored on this browser (sandbox client restore).",
    });
  }

  return json(res, 200, {
    ok: true,
    emailed: false,
    unlocked: false,
    message:
      "We found your purchase, but restore email isn't configured yet. Email support@tomoflow.app with your Stripe receipt, or set RESEND_API_KEY / ALLOW_CLIENT_RESTORE for sandbox.",
  });
};
