/**
 * Shared TomoFlow email branding for Resend (and any future transactional mail).
 * Keep markup inline-CSS / table-based for client compatibility. No deps.
 */

const BRAND = {
  name: "TomoFlow",
  primary: "#FF5A5F",
  accent: "#00A896",
  bg: "#121417",
  surface: "#1E2126",
  text: "#F5F5F5",
  muted: "#A8ADB7",
  siteUrl: "https://www.tomoflow.app",
  supportEmail: "support@tomoflow.app",
  // PNG works in email clients; SVG often does not.
  logoUrl: "https://www.tomoflow.app/assets/img/tomatoes/tomato-happy.png",
};

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{
 *   title: string,
 *   preheader?: string,
 *   bodyHtml: string,
 *   cta?: { label: string, url: string },
 *   footerNote?: string,
 * }} opts
 */
function brandedEmailHtml(opts) {
  const title = escapeHtml(opts.title || BRAND.name);
  const preheader = escapeHtml(opts.preheader || "");
  const bodyHtml = opts.bodyHtml || "";
  const footerNote = opts.footerNote
    ? `<p style="text-align:center;margin:16px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">${escapeHtml(opts.footerNote)}</p>`
    : "";
  const cta =
    opts.cta && opts.cta.url
      ? `<tr>
          <td align="center" style="text-align:center;padding:8px 0 24px;">
            <a href="${escapeHtml(opts.cta.url)}"
               style="display:inline-block;background:${BRAND.primary};color:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;font-weight:600;line-height:1.25;text-decoration:none;padding:14px 28px;border-radius:999px;">
              ${escapeHtml(opts.cta.label || "Continue")}
            </a>
          </td>
        </tr>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${title}</title>
  <!--[if mso]><style>body,table,td{font-family:Arial,sans-serif!important;}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:${BRAND.bg};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${preheader}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${BRAND.bg};padding:32px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:560px;background:${BRAND.surface};border-radius:16px;overflow:hidden;">
          <tr>
            <td align="center" style="text-align:center;padding:28px 28px 12px;border-bottom:1px solid #2A2E35;">
              <img src="${BRAND.logoUrl}" width="56" height="56" alt="${BRAND.name}" style="display:block;margin:0 auto 12px;border:0;" />
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:22px;font-weight:700;letter-spacing:-0.02em;color:${BRAND.text};">
                ${BRAND.name}
              </div>
              <div style="margin-top:4px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:${BRAND.accent};">
                Focus timer · themes · characters
              </div>
            </td>
          </tr>
          <tr>
            <td align="center" style="text-align:center;padding:28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:16px;line-height:1.55;color:${BRAND.text};">
              ${bodyHtml}
            </td>
          </tr>
          ${cta}
          <tr>
            <td align="center" style="text-align:center;padding:0 28px 28px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
              ${footerNote}
              <p style="text-align:center;margin:20px 0 0;font-size:12px;line-height:1.5;color:${BRAND.muted};">
                <a href="${BRAND.siteUrl}" style="color:${BRAND.accent};text-decoration:none;">www.tomoflow.app</a>
                ·
                <a href="mailto:${BRAND.supportEmail}" style="color:${BRAND.accent};text-decoration:none;">${BRAND.supportEmail}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function brandedEmailText(opts) {
  const lines = [];
  lines.push(opts.title || BRAND.name);
  lines.push("");
  if (opts.bodyText) lines.push(opts.bodyText.trim());
  if (opts.cta && opts.cta.url) {
    lines.push("");
    lines.push(`${opts.cta.label || "Open link"}: ${opts.cta.url}`);
  }
  if (opts.footerNote) {
    lines.push("");
    lines.push(opts.footerNote);
  }
  lines.push("");
  lines.push(`${BRAND.siteUrl} · ${BRAND.supportEmail}`);
  return lines.join("\n");
}

function restoreProEmail({ unlockUrl }) {
  const title = "Restore your TomoFlow Pro unlock";
  const bodyHtml = `
    <p style="text-align:center;margin:0 0 16px;">Thanks for supporting TomoFlow.</p>
    <p style="text-align:center;margin:0 0 16px;">Use the button below to restore Pro on the browser you’re using. This link expires in 30 minutes and can be used once. The unlock is stored in that browser only.</p>
    <p style="text-align:center;margin:0;color:${BRAND.muted};font-size:14px;">Tips never unlock Pro. If you didn’t request this, you can ignore this email.</p>
  `;
  const bodyText = [
    "Thanks for supporting TomoFlow.",
    "",
    "Open this link to restore Pro on the browser you're using:",
    unlockUrl,
    "",
    "This link expires in 30 minutes and can be used once. The unlock is stored in that browser only. Tips never unlock Pro.",
    "If you didn't request this, you can ignore this email.",
  ].join("\n");

  return {
    subject: title,
    html: brandedEmailHtml({
      title,
      preheader: "Tap to restore TomoFlow Pro on this browser.",
      bodyHtml,
      cta: { label: "Restore Pro", url: unlockUrl },
      footerNote: "One-time unlock · no account required",
    }),
    text: brandedEmailText({
      title,
      bodyText,
      cta: { label: "Restore Pro", url: unlockUrl },
      footerNote: "One-time unlock · no account required",
    }),
  };
}

function purchaseConfirmationEmail({ session }) {
  // Stripe uses two decimal minor units except these documented currency exceptions.
  const zero = new Set('bif clp djf gnf jpy kmf krw mga pyg rwf ugx vnd vuv xaf xof xpf'.split(' '));
  const three = new Set('bhd jod kwd omr tnd'.split(' '));
  const digits = zero.has(session.currency) ? 0 : three.has(session.currency) ? 3 : 2;
  const amount = `${(session.amount_total / 10 ** digits).toFixed(digits)} ${session.currency.toUpperCase()}`;
  const test = !session.livemode;
  const title = `${test ? '[TEST] ' : ''}TomoFlow Pro purchase confirmation`;
  const paragraphs = [
    'Thanks for supporting TomoFlow.',
    test ? `Sandbox/test purchase: ${amount}. No real money was charged.` : `Payment received: ${amount}.`,
    `Purchase reference: ${session.id}`,
    'Return to the browser where you completed checkout to use Pro. Your one-time unlock is stored in that browser only; no account is required.',
    'If Pro is missing or you use another browser, open TomoFlow, choose Restore Pro, and enter the email address used at checkout. Follow the restore email on the browser you want to unlock.',
    'Tips never unlock Pro. Keep this email for your records.',
  ];
  const opts = { title, preheader: paragraphs[1],
    bodyHtml: paragraphs.map(p => `<p style="text-align:center;margin:0 0 16px;">${escapeHtml(p)}</p>`).join(''),
    bodyText: paragraphs.join('\n\n'),
    cta: { label: 'Open TomoFlow', url: BRAND.siteUrl },
    footerNote: 'One-time unlock · no account required',
  };
  return { subject: title, html: brandedEmailHtml(opts), text: brandedEmailText(opts) };
}

module.exports = {
  purchaseConfirmationEmail,
  BRAND,
  brandedEmailHtml,
  brandedEmailText,
  restoreProEmail,
};
