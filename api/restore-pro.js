/**
 * POST /api/restore-pro
 * Body: { "email": "buyer@example.com" }
 *
 * Best-effort Restore Pro for a one-time Stripe purchase (no full accounts).
 * Flow (sandbox → live):
 *  1. Require STRIPE_SECRET_KEY (501 if missing).
 *  2. Look up paid Checkout Sessions that are TomoFlow Pro for that email
 *     (paginate until exhausted; require product/price/payment_link/metadata match).
 *  3. If RESEND_API_KEY is set → email a magic unlock link (?pro=1&restore=1).
 *  4. Else if ALLOW_CLIENT_RESTORE=1 → return { unlocked: true } for sandbox testing.
 *  5. Else tell the client purchase was found / not found without unlocking.
 *
 * Production should prefer the Resend magic-link path (or a signed token) over
 * trusting the client. ?pro=1 remains a client hint only.
 */

const STRIPE_API = "https://api.stripe.com/v1";
const SESSION_PAGE_SIZE = 100;

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

function proMatchers() {
  return {
    productId: (process.env.STRIPE_PRO_PRODUCT_ID || "").trim(),
    priceId: (process.env.STRIPE_PRO_PRICE_ID || "").trim(),
    paymentLinkId: (process.env.STRIPE_PRO_PAYMENT_LINK_ID || "").trim(),
    // Payment Link / product metadata we set when creating the sandbox link.
    requireAppMeta: true,
  };
}

function sessionEmail(session) {
  return (
    session.customer_details?.email ||
    session.customer_email ||
    ""
  ).toLowerCase();
}

function isPaidSession(session) {
  return (
    session.payment_status === "paid" ||
    session.payment_status === "no_payment_required"
  );
}

function metadataLooksLikePro(meta) {
  if (!meta || typeof meta !== "object") return false;
  const app = String(meta.app || "").toLowerCase();
  const sku = String(meta.sku || "").toLowerCase();
  return app === "tomoflow" || sku === "pro" || sku === "tomoflow_pro";
}

function lineItemsIncludePro(session, matchers) {
  const items = session.line_items?.data || [];
  for (const item of items) {
    const price = item.price || {};
    const priceId = typeof price === "string" ? price : price.id;
    const product =
      typeof price.product === "string" ? price.product : price.product?.id;
    if (matchers.priceId && priceId === matchers.priceId) return true;
    if (matchers.productId && product === matchers.productId) return true;
    if (metadataLooksLikePro(price.metadata) || metadataLooksLikePro(item.metadata)) {
      return true;
    }
  }
  return false;
}

/**
 * Only accept purchases that are clearly TomoFlow Pro — not any paid session
 * on the same Stripe account.
 */
function isTomoFlowProSession(session, matchers) {
  if (!isPaidSession(session)) return false;

  if (matchers.paymentLinkId) {
    const pl =
      typeof session.payment_link === "string"
        ? session.payment_link
        : session.payment_link?.id;
    if (pl && pl === matchers.paymentLinkId) return true;
  }

  if (metadataLooksLikePro(session.metadata)) return true;

  if (lineItemsIncludePro(session, matchers)) return true;

  // If env IDs are configured, require an ID/metadata match (already checked).
  // If nothing is configured yet, refuse ambiguous unlocks rather than accepting
  // any paid email match (Codex P2).
  return false;
}

function sessionBelongsToEmail(session, needle, customerIds) {
  if (sessionEmail(session) === needle) return true;
  if (session.customer && customerIds.includes(session.customer)) return true;
  return false;
}

async function listCompleteSessionsPage(secret, startingAfter) {
  const params = new URLSearchParams({
    limit: String(SESSION_PAGE_SIZE),
    status: "complete",
  });
  // Expand line items so we can match product/price without a second round-trip
  // per session when env IDs are set.
  params.append("expand[]", "data.line_items");
  if (startingAfter) params.set("starting_after", startingAfter);
  return stripeGet(`/checkout/sessions?${params.toString()}`, secret);
}

/**
 * Paginate Checkout Sessions until a TomoFlow Pro purchase for this email is
 * found, or results are exhausted (follows Stripe has_more cursors).
 */
async function findPaidProPurchase(email, secret) {
  const matchers = proMatchers();
  if (!matchers.productId && !matchers.priceId && !matchers.paymentLinkId) {
    // Still allow metadata-only matches (app=tomoflow / sku=pro) which we set
    // on the sandbox Payment Link + product. No open "any paid session" path.
  }

  const encoded = encodeURIComponent(email.toLowerCase());
  const customers = await stripeGet(
    `/customers?email=${encoded}&limit=10`,
    secret
  );
  const customerIds = (customers.data || []).map((c) => c.id);
  const needle = email.toLowerCase();

  let startingAfter = null;
  let pages = 0;
  const maxPages = 50; // safety cap (~5k sessions)

  do {
    const page = await listCompleteSessionsPage(secret, startingAfter);
    pages += 1;
    const data = page.data || [];

    for (const session of data) {
      if (!sessionBelongsToEmail(session, needle, customerIds)) continue;
      if (!isTomoFlowProSession(session, matchers)) continue;
      return {
        kind: "session",
        id: session.id,
        customerId: session.customer || null,
      };
    }

    if (!page.has_more || data.length === 0) break;
    startingAfter = data[data.length - 1].id;
  } while (pages < maxPages);

  return null;
}

function siteBaseUrl() {
  if (process.env.PUBLIC_SITE_URL) {
    return process.env.PUBLIC_SITE_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) {
    return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`.replace(
      /\/$/,
      ""
    );
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
