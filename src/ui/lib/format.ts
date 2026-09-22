/**
 * Formatting rules (handover 11.8): AMD with thousands separators (850,000 AMD), USD $1,376, percentages 1-2 decimals,
 * dates like "21 Sep 2026", times in Asia/Yerevan, negative numbers with a minus sign.
 * All helpers are pure and accept decimal strings (the API sends money as strings) or numbers.
 */
export const APP_TZ = "Asia/Yerevan";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export const MINUS = "-";

export function toNumber(v: string | number | null | undefined): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Group an unsigned digit string with commas. */
export function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Split a decimal number into sign / integer part (grouped) / fraction digits. */
export function splitDecimal(v: string | number | null | undefined, decimals: number): { neg: boolean; int: string; frac: string } | null {
  const n = toNumber(v);
  if (n === null) return null;
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, f = ""] = fixed.split(".");
  const isZero = Number(fixed) === 0;
  return { neg: n < 0 && !isZero, int: groupDigits(i), frac: f };
}

export function formatNumber(v: string | number | null | undefined, decimals = 0, fallback = "-"): string {
  const s = splitDecimal(v, decimals);
  if (!s) return fallback;
  return `${s.neg ? MINUS : ""}${s.int}${s.frac ? `.${s.frac}` : ""}`;
}

/** AMD amounts: whole dram unless the value has a fraction (Personal Finance allows 2 decimals). "850,000 AMD" */
export function formatAmd(v: string | number | null | undefined, opts: { decimals?: number; suffix?: boolean; fallback?: string } = {}): string {
  const n = toNumber(v);
  if (n === null) return opts.fallback ?? "-";
  const decimals = opts.decimals ?? (Math.abs(n % 1) > 0 ? 2 : 0);
  return `${formatNumber(n, decimals)}${opts.suffix === false ? "" : " AMD"}`;
}

/** USD: "$1,376" (0 decimals) or "$227.20" (2 decimals); negatives "-$12.00". */
export function formatUsd(v: string | number | null | undefined, decimals = 0, fallback = "-"): string {
  const s = splitDecimal(v, decimals);
  if (!s) return fallback;
  return `${s.neg ? MINUS : ""}$${s.int}${s.frac ? `.${s.frac}` : ""}`;
}

const isPositive = (s: { neg: boolean; int: string; frac: string }) => !s.neg && Number(`${s.int.replace(/,/g, "")}.${s.frac || 0}`) > 0;

export function formatPercent(v: string | number | null | undefined, decimals = 2, opts: { sign?: boolean; fallback?: string } = {}): string {
  const s = splitDecimal(v, decimals);
  if (!s) return opts.fallback ?? "-";
  const sign = s.neg ? MINUS : opts.sign && isPositive(s) ? "+" : "";
  return `${sign}${s.int}${s.frac ? `.${s.frac}` : ""}%`;
}

/** Signed number with an explicit + or - (never colour alone). */
export function formatSigned(v: string | number | null | undefined, decimals = 2, fallback = "-"): string {
  const s = splitDecimal(v, decimals);
  if (!s) return fallback;
  return `${s.neg ? MINUS : isPositive(s) ? "+" : ""}${s.int}${s.frac ? `.${s.frac}` : ""}`;
}

/** FX: 2 decimals, RUB 4 decimals. */
export function fxDecimals(pair: string): number {
  return pair.startsWith("RUB") ? 4 : 2;
}
export function formatFx(v: string | number | null | undefined, pair: string): string {
  return formatNumber(v, fxDecimals(pair));
}

/** Whole part and decimals kept apart so the decimals can be rendered muted ("$82,940" + ".00"). */
export function figureParts(v: string | number | null | undefined, decimals = 2): { neg: boolean; int: string; frac: string } | null {
  return splitDecimal(v, decimals);
}

/* ------------------------------------------------------------------ dates (calendar strings, no timezone maths) */

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})/;

/** "2026-09-21" -> "21 Sep 2026" */
export function formatDate(iso: string | null | undefined, fallback = "-"): string {
  if (!iso) return fallback;
  const m = DATE_RE.exec(iso);
  if (!m) return fallback;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-09-21" -> "21 Sep" (chart axes) */
export function formatDayMonth(iso: string): string {
  const m = DATE_RE.exec(iso);
  if (!m) return iso;
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`;
}

/** "2026-09" or "2026-09-01" -> "September 2026" */
export function formatMonth(iso: string): string {
  const m = /^(\d{4})-(\d{2})/.exec(iso);
  if (!m) return iso;
  return `${MONTHS_LONG[Number(m[2]) - 1]} ${m[1]}`;
}

/** "2026-09-21" -> "September 21, 2026" (history group headings) */
export function formatDateLong(iso: string): string {
  const m = DATE_RE.exec(iso);
  if (!m) return iso;
  return `${MONTHS_LONG[Number(m[2]) - 1]} ${Number(m[3])}, ${m[1]}`;
}

function partsIn(d: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return { y: get("year"), mo: get("month"), d: get("day"), h: get("hour"), mi: get("minute") };
}

/** ISO timestamp -> "21 Sep 2026, 14:03" in Asia/Yerevan */
export function formatDateTime(iso: string | null | undefined, fallback = "-"): string {
  if (!iso) return fallback;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return fallback;
  const p = partsIn(d, APP_TZ);
  return `${Number(p.d)} ${MONTHS[Number(p.mo) - 1]} ${p.y}, ${p.h}:${p.mi}`;
}

/** Yerevan calendar day (YYYY-MM-DD) of a timestamp */
export function yerevanDay(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  const p = partsIn(d, APP_TZ);
  return `${p.y}-${p.mo}-${p.d}`;
}

export function todayYerevan(now: Date = new Date()): string {
  return yerevanDay(now);
}

export function currentMonthYerevan(now: Date = new Date()): string {
  return todayYerevan(now).slice(0, 7);
}

/** "5 min ago" style label */
export function formatAgo(iso: string | null | undefined, now: Date = new Date()): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const sec = Math.max(0, Math.round((now.getTime() - t) / 1000));
  if (sec < 45) return "just now";
  const min = Math.round(sec / 60);
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} d ago`;
}

export function greeting(now: Date = new Date()): string {
  const h = Number(partsIn(now, APP_TZ).h);
  if (h < 5) return "Good night";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

/** Strip spaces, thousands commas and currency words from typed/pasted money; keep a single dot. */
export function cleanAmountInput(raw: string): string {
  let s = raw.replace(/[\s, ]/g, "").replace(/[A-Za-z$]/g, "");
  const dot = s.indexOf(".");
  if (dot >= 0) s = s.slice(0, dot + 1) + s.slice(dot + 1).replace(/\./g, "");
  return s;
}

export function capitalize(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
