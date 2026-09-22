/**
 * Personal Finance client-side maths. Mirrors the server formula (handover 17.1) so the charts can follow the inputs
 * live; after Save the server's numbers replace this preview.
 *   expensesTotal = sum(amount)     available = (income ?? 0) - expensesTotal     (NOT a bank balance)
 * Money is handled as integer cents (amounts are limited to 1e12 with 2 decimals, so cents stay exact in a JS number).
 */
import type { PeriodRef, PeriodView, PutPeriodBody } from "../api/types";

export const MAX_AMOUNT_CENTS = 1e12 * 100;
export const MAX_CUSTOM_CATEGORIES = 20;
export const CUSTOM_LABEL_MAX = 40;
export const DEFAULT_LABELS = ["Housing", "Food & Dining", "Transportation", "Bills & Utilities", "Shopping", "Entertainment", "Other"];

const AMOUNT_RE = /^\d{1,13}(\.\d{1,2})?$/;

/** "" -> null (not entered). Returns NaN for malformed input. */
export function toCents(raw: string): number | null {
  const t = raw.trim().replace(/\.$/, "");
  if (t === "") return null;
  if (!AMOUNT_RE.test(t)) return Number.NaN;
  const [i, f = ""] = t.split(".");
  return Number(i) * 100 + Number((f + "00").slice(0, 2));
}

export function amountError(raw: string): string | null {
  const c = toCents(raw);
  if (c === null) return null;
  if (Number.isNaN(c)) return "Enter a number with at most 2 decimals.";
  if (c > MAX_AMOUNT_CENTS) return "This amount is too large.";
  return null;
}

export function centsToDecimal(c: number): string {
  const neg = c < 0;
  const a = Math.abs(c);
  return `${neg ? "-" : ""}${Math.floor(a / 100)}.${String(a % 100).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ form model */
export interface FormRow {
  /** stable client id (not sent to the server) */
  id: string;
  key: string | null;
  label: string;
  amount: string;
  isCustom: boolean;
}
export interface FormState {
  income: string;
  rows: FormRow[];
}

let seq = 0;
export const newId = () => `r${++seq}`;

/** amount from the server ("250000.00") to the editable raw string ("250000"); null -> "" */
export function rawFromServer(v: string | null): string {
  if (v === null || v === undefined) return "";
  return v.replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, "");
}

export function fromView(view: PeriodView): FormState {
  return {
    income: rawFromServer(view.income),
    rows: view.expenses.map((e) => ({ id: newId(), key: e.key, label: e.label, amount: rawFromServer(e.amount), isCustom: e.isCustom })),
  };
}

/** structural fingerprint used for dirty tracking (ids are ignored) */
export function fingerprint(f: FormState): string {
  const num = (raw: string) => {
    const c = toCents(raw);
    return c === null ? "" : Number.isNaN(c) ? `?${raw}` : String(c);
  };
  return JSON.stringify({ i: num(f.income), r: f.rows.map((r) => [r.isCustom ? null : r.key, r.isCustom ? r.label.trim() : "", num(r.amount)]) });
}

/** a custom row the user added but never filled in is ignored on save */
const isBlankCustom = (r: FormRow) => r.isCustom && r.label.trim() === "" && r.amount.trim() === "";

/* ------------------------------------------------------------------ validation */
export interface FormErrors {
  income?: string;
  rows: Record<string, { label?: string; amount?: string }>;
  general?: string;
  ok: boolean;
}

export function validateForm(f: FormState): FormErrors {
  const rows: FormErrors["rows"] = {};
  const seen = new Set(DEFAULT_LABELS.map((l) => l.toLowerCase()));
  let customCount = 0;
  const incomeErr = amountError(f.income) ?? undefined;
  for (const r of f.rows) {
    const e: { label?: string; amount?: string } = {};
    const a = amountError(r.amount);
    if (a) e.amount = a;
    if (r.isCustom && !isBlankCustom(r)) {
      customCount++;
      const label = r.label.trim().replace(/\s+/g, " ");
      if (!label) e.label = "Enter a category name.";
      else if (label.length > CUSTOM_LABEL_MAX) e.label = `Use at most ${CUSTOM_LABEL_MAX} characters.`;
      else if (DEFAULT_LABELS.some((d) => d.toLowerCase() === label.toLowerCase())) e.label = "This name is already used by a default category.";
      else if (seen.has(label.toLowerCase())) e.label = "Category names must be unique.";
      else seen.add(label.toLowerCase());
    }
    if (e.label || e.amount) rows[r.id] = e;
  }
  const general = customCount > MAX_CUSTOM_CATEGORIES ? `You can add at most ${MAX_CUSTOM_CATEGORIES} custom categories per period.` : undefined;
  return { income: incomeErr, rows, general, ok: !incomeErr && !general && Object.keys(rows).length === 0 };
}

/** request body; also returns the row id for every `expenses.N` index so server field errors can be mapped back */
export function toPutBody(f: FormState, ref: PeriodRef): { body: PutPeriodBody; indexToRow: string[] } {
  const expenses: PutPeriodBody["expenses"] = [];
  const indexToRow: string[] = [];
  for (const r of f.rows) {
    if (isBlankCustom(r)) continue;
    const c = toCents(r.amount);
    const amount = c === null || Number.isNaN(c) ? null : centsToDecimal(c);
    expenses.push(r.isCustom ? { label: r.label.trim().replace(/\s+/g, " "), amount } : { key: r.key ?? undefined, amount });
    indexToRow.push(r.id);
  }
  const ic = toCents(f.income);
  const income = ic === null || Number.isNaN(ic) ? null : centsToDecimal(ic);
  return { body: { ...ref, income, expenses }, indexToRow };
}

/* ------------------------------------------------------------------ preview (same formula as the server) */
export interface Preview {
  incomeEntered: boolean;
  incomeCents: number;
  expensesCents: number;
  availableCents: number;
  breakdown: { label: string; cents: number; percent: number }[];
  /** nothing entered: charts must show their empty state, never zero-value bars */
  isEmpty: boolean;
  incomeMissing: boolean;
}

/** Largest-remainder apportionment of 100 points (ties: larger amount first, then lower index). */
export function apportionPercents(amounts: number[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0) return amounts.map(() => 0);
  const exact = amounts.map((a) => (a * 100) / total);
  const floors = exact.map((x) => Math.floor(x + 1e-9));
  const order = amounts
    .map((a, i) => ({ i, rem: exact[i] - floors[i], a }))
    .sort((x, y) => (Math.abs(x.rem - y.rem) > 1e-9 ? y.rem - x.rem : x.a !== y.a ? y.a - x.a : x.i - y.i));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const out = [...floors];
  for (const o of order) {
    if (left <= 0) break;
    out[o.i] += 1;
    left--;
  }
  return out;
}

export function buildPreview(f: FormState): Preview {
  const ic = toCents(f.income);
  const incomeCents = ic === null || Number.isNaN(ic) ? 0 : ic;
  const items: { label: string; cents: number }[] = [];
  let expensesCents = 0;
  for (const r of f.rows) {
    if (isBlankCustom(r)) continue;
    const c = toCents(r.amount);
    if (c === null || Number.isNaN(c)) continue;
    expensesCents += c;
    if (c > 0) items.push({ label: r.isCustom ? r.label.trim() || "Custom category" : r.label, cents: c });
  }
  items.sort((a, b) => (a.cents === b.cents ? a.label.localeCompare(b.label) : b.cents - a.cents));
  const pct = apportionPercents(items.map((i) => i.cents));
  const incomeEntered = ic !== null && !Number.isNaN(ic);
  return {
    incomeEntered,
    incomeCents,
    expensesCents,
    availableCents: incomeCents - expensesCents,
    breakdown: items.map((i, k) => ({ ...i, percent: pct[k] })),
    isEmpty: !incomeEntered && expensesCents === 0,
    incomeMissing: !incomeEntered && expensesCents > 0,
  };
}

/* ------------------------------------------------------------------ period selection */
export type Selection = { kind: "month"; month: string } | { kind: "custom"; start: string; end: string };

export const selectionKey = (s: Selection) => (s.kind === "month" ? `month:${s.month}` : `custom:${s.start}:${s.end}`);
export const selectionRef = (s: Selection): PeriodRef => (s.kind === "month" ? { kind: "month", month: s.month } : { kind: "custom", start: s.start, end: s.end });

export function selectionFromPeriod(p: { kind: string; start: string; end: string }): Selection {
  return p.kind === "month" ? { kind: "month", month: p.start.slice(0, 7) } : { kind: "custom", start: p.start, end: p.end };
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split("-").map(Number);
  const idx = y * 12 + (m - 1) + delta;
  return `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
}

export function daysBetween(start: string, end: string): number {
  return Math.round((Date.UTC(+end.slice(0, 4), +end.slice(5, 7) - 1, +end.slice(8, 10)) - Date.UTC(+start.slice(0, 4), +start.slice(5, 7) - 1, +start.slice(8, 10))) / 86_400_000);
}

export function customRangeError(start: string, end: string): string | null {
  if (!start || !end) return "Choose both a start and an end date.";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return "Enter valid dates.";
  if (end < start) return "The end date can't be before the start date.";
  if (daysBetween(start, end) + 1 > 366) return "A custom period can span at most 366 days.";
  return null;
}
