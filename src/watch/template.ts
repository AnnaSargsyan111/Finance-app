import { APP_NAME } from "@/config/app";
import type { Comparison, Row } from "./diff";
import type { WatchView } from "./view";

/**
 * The "parameters changed" email. English for now; plain text and an HTML version (table layout and inline styles only, because mail
 * clients ignore stylesheets and SVG). For every parameter it shows the previous value and the new one, or "(unchanged)" when nothing changed.
 */
export const CONTACT_PHONE = "(+374) 77731713";

export interface WatchEmailInput {
  firstName: string;
  prev: WatchView;
  next: WatchView;
  comparison: Comparison;
  /** a manual test send: sent even when nothing changed, and marked as a test */
  test: boolean;
  manageUrl: string;
  unsubscribeUrl: string;
}

const C = { ink: "#020203", slate: "#4F5753", silver: "#C0C2C3", lime: "#91F60D", blue: "#2F587E", bg: "#F2F3F3", card: "#FFFFFF", line: "#E3E5E5", muted: "#7A827E" };
const FONT = "Manrope,'Segoe UI',Arial,Helvetica,sans-serif";

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function title(i: WatchEmailInput): string {
  return i.prev.mode === "single" ? i.comparison.stocks[0]?.name || i.comparison.stocks[0]?.symbol || "stock" : "portfolio";
}

export function emailSubject(i: WatchEmailInput): string {
  const base = i.prev.mode === "single" ? `Changes to your "${title(i)}" stock parameters` : `Changes to the stocks in your portfolio`;
  return `${i.test ? "[Test] " : ""}${base}`;
}

function intro(i: WatchEmailInput): string {
  const single = i.prev.mode === "single";
  const what = single ? `your "${title(i)}" stock` : "the stocks in your portfolio";
  if (i.comparison.changedCount === 0) return `No parameters have changed for ${what} since the last report.`;
  return single ? `Changes have been made to the parameters for ${what}.` : `Changes have been made to the parameters for ${what}.`;
}

const dataLine = (i: WatchEmailInput) => `Data as of ${i.next.asOf} (previous report: ${i.prev.asOf}).`;
const unchanged = (r: Row) => !r.changed;

/* ---------- plain text ---------- */

function textRows(rows: Row[]): string {
  return rows.map((r) => (r.changed ? `  ${r.label}: ${r.prev}  ->  ${r.next}` : `  ${r.label}: ${r.prev} (unchanged)`)).join("\n");
}

export function emailText(i: WatchEmailInput): string {
  const parts = [`Dear ${i.firstName || "User"},`, "", intro(i), dataLine(i), "", "Parameters"];
  for (const s of i.comparison.stocks) {
    parts.push("", `${s.name} (${s.symbol})`, textRows(s.rows));
  }
  if (i.comparison.total) parts.push("", textRows([i.comparison.total]));
  parts.push(
    "",
    i.test ? "This is a test email: it was sent to you only, on request." : "",
    "This is general information from your saved recommendation, not personal financial advice.",
    "",
    `${APP_NAME} - ${CONTACT_PHONE}`,
    `Manage notifications: ${i.manageUrl}`,
    `Stop these emails: ${i.unsubscribeUrl}`,
    "",
  );
  return parts.join("\n");
}

/* ---------- HTML ---------- */

function htmlRow(r: Row): string {
  const cell = `padding:10px 12px;border-bottom:1px solid ${C.line};font-size:14px;line-height:20px;vertical-align:top;font-family:${FONT};`;
  const mark = r.changed ? `border-left:3px solid ${r.meaningful ? C.lime : C.silver};` : `border-left:3px solid transparent;`;
  const now = unchanged(r) ? `<span style="color:${C.muted};">(unchanged)</span>` : `<strong style="color:${C.ink};">${esc(r.next)}</strong>`;
  return (
    `<tr>` +
    `<td style="${cell}${mark}color:${C.slate};width:34%;">${esc(r.label)}</td>` +
    `<td style="${cell}color:${unchanged(r) ? C.ink : C.slate};">${esc(r.prev)}</td>` +
    `<td style="${cell}">${now}</td>` +
    `</tr>`
  );
}

function htmlTable(rows: Row[]): string {
  const th = `padding:8px 12px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:${C.muted};text-align:left;font-family:${FONT};font-weight:600;border-bottom:1px solid ${C.line};`;
  return (
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:0 0 6px;">` +
    `<tr><th style="${th}">Parameter</th><th style="${th}">Previous</th><th style="${th}">New</th></tr>` +
    rows.map(htmlRow).join("") +
    `</table>`
  );
}

function logo(size: number): string {
  return (
    `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:separate;"><tr>` +
    `<td width="${size}" height="${size}" align="center" valign="middle" style="width:${size}px;height:${size}px;border:1px solid ${C.slate};border-radius:${Math.round(size * 0.3)}px;font-family:${FONT};font-size:${Math.round(size * 0.55)}px;line-height:${size - 2}px;font-weight:800;color:${C.lime};">F</td>` +
    `<td style="padding-left:10px;font-family:${FONT};font-size:${Math.round(size * 0.6)}px;font-weight:800;color:${C.card};letter-spacing:.01em;">${esc(APP_NAME)}</td>` +
    `</tr></table>`
  );
}

export function emailHtml(i: WatchEmailInput): string {
  const p = `margin:0 0 14px;font-family:${FONT};font-size:15px;line-height:23px;color:${C.ink};`;
  const sections = i.comparison.stocks
    .map(
      (s) =>
        `<p style="margin:22px 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">${esc(s.name)} <span style="color:${C.muted};font-weight:600;">${esc(s.symbol)}</span></p>` + htmlTable(s.rows),
    )
    .join("");
  const total = i.comparison.total ? `<p style="margin:22px 0 8px;font-family:${FONT};font-size:15px;font-weight:700;color:${C.ink};">Whole portfolio</p>${htmlTable([i.comparison.total])}` : "";
  const test = i.test
    ? `<p style="margin:18px 0 0;padding:10px 12px;background-color:${C.bg};border-radius:8px;font-family:${FONT};font-size:13px;line-height:19px;color:${C.slate};">This is a test email. It was sent to you only, on request.</p>`
    : "";
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(emailSubject(i))}</title></head>` +
    `<body bgcolor="${C.bg}" style="margin:0;padding:0;background-color:${C.bg};">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${C.bg}" style="background-color:${C.bg};"><tr><td align="center" style="padding:24px 12px;">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;border-collapse:separate;">` +
    // header
    `<tr><td bgcolor="${C.ink}" style="background-color:${C.ink};border-radius:14px 14px 0 0;padding:20px 28px;">${logo(30)}</td></tr>` +
    // body
    `<tr><td bgcolor="${C.card}" style="background-color:${C.card};padding:28px 28px 22px;">` +
    `<p style="${p}">Dear ${esc(i.firstName || "User")},</p>` +
    `<p style="${p}">${esc(intro(i))}</p>` +
    `<p style="margin:0 0 4px;font-family:${FONT};font-size:12px;color:${C.muted};">${esc(dataLine(i))}</p>` +
    `<p style="margin:22px 0 0;font-family:${FONT};font-size:12px;letter-spacing:.08em;text-transform:uppercase;font-weight:700;color:${C.blue};">Parameters</p>` +
    sections +
    total +
    test +
    `</td></tr>` +
    // footer
    `<tr><td bgcolor="${C.ink}" style="background-color:${C.ink};border-radius:0 0 14px 14px;padding:24px 28px;">` +
    `${logo(26)}` +
    `<p style="margin:16px 0 4px;font-family:${FONT};font-size:14px;color:${C.silver};">Questions? Call us: <a href="tel:+37477731713" style="color:${C.lime};text-decoration:none;font-weight:700;">${esc(CONTACT_PHONE)}</a></p>` +
    `<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.muted};">This is general information based on your saved recommendation, not personal financial advice. Prices and data are delayed and indicative.</p>` +
    `<p style="margin:12px 0 0;font-family:${FONT};font-size:12px;color:${C.muted};"><a href="${esc(i.manageUrl)}" style="color:${C.silver};">Manage notifications</a> &nbsp;·&nbsp; <a href="${esc(i.unsubscribeUrl)}" style="color:${C.silver};">Stop these emails</a></p>` +
    `</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

export function renderWatchEmail(i: WatchEmailInput): { subject: string; text: string; html: string } {
  return { subject: emailSubject(i), text: emailText(i), html: emailHtml(i) };
}
