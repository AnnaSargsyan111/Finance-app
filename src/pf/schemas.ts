import { z } from "zod";
import { APP } from "@/config/app";
import { ApiError } from "@/lib/errors";
import { parseCents, centsToString } from "@/lib/money";
import { addDays, diffDays, firstOfMonth, isValidDate, lastOfMonth, todayIn, APP_TZ } from "@/lib/time";

/** The 7 fixed default expense categories (Change Order 1, 17.1). Keys are stable; labels are the UI strings. */
export const DEFAULT_EXPENSE_CATEGORIES = [
  { key: "housing", label: "Housing" },
  { key: "food_dining", label: "Food & Dining" },
  { key: "transportation", label: "Transportation" },
  { key: "bills_utilities", label: "Bills & Utilities" },
  { key: "shopping", label: "Shopping" },
  { key: "entertainment", label: "Entertainment" },
  { key: "other", label: "Other" },
] as const;
export type DefaultKey = (typeof DEFAULT_EXPENSE_CATEGORIES)[number]["key"];
export const DEFAULT_KEYS: readonly string[] = DEFAULT_EXPENSE_CATEGORIES.map((c) => c.key);

export const MAX_CUSTOM_CATEGORIES = 20;
export const CUSTOM_LABEL_MAX = 40;
export const MAX_CUSTOM_PERIOD_DAYS = 366;

const AMOUNT_RE = /^\d{1,13}(\.\d{1,2})?$/;
const MAX_CENTS = parseCents(APP.pf.maxAmount);

const dateWithinBounds = (s: string) => isValidDate(s) && s >= APP.pf.minDate && s <= APP.pf.maxDate;

/**
 * Money input: decimal string (preferred) or finite JSON number, >= 0, <= 2 decimals, <= 1e12; null / "" = "not entered".
 * Always normalised to a 2-decimal string; a number is converted through its shortest decimal text (never arithmetic).
 */
export const moneyInput = z
  .union([z.string(), z.number(), z.null()], { error: 'Enter an amount as a decimal, e.g. "12500.00"' })
  .transform((v, ctx): string | null => {
    if (v === null) return null;
    const raw = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "NaN") : v.trim();
    if (raw === "") return null;
    if (!AMOUNT_RE.test(raw)) {
      ctx.addIssue({ code: "custom", message: "Amount must be a number >= 0 with at most 2 decimals" });
      return z.NEVER;
    }
    const cents = parseCents(raw);
    if (cents > MAX_CENTS) {
      ctx.addIssue({ code: "custom", message: "Amount is too large" });
      return z.NEVER;
    }
    return centsToString(cents);
  });

const customLabel = z
  .string({ error: "Enter a category name" })
  .transform((s) => s.trim().replace(/\s+/g, " "))
  .refine((s) => s.length >= 1 && s.length <= CUSTOM_LABEL_MAX, `Category name must be 1-${CUSTOM_LABEL_MAX} characters`);

export const expenseInputSchema = z
  .object({
    key: z.string().nullable().optional(),
    label: customLabel.optional(),
    amount: moneyInput.optional().default(null),
  })
  .strict();

export type PeriodRef = { kind: "month" | "custom"; start: string; end: string };

const MONTH_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;

/**
 * Resolve `{kind, month | start+end}` to a concrete period. A custom range that is exactly one whole calendar month
 * is normalised to kind "month" (one record per (start,end), see README-backend).
 */
export function resolvePeriodRef(input: { kind?: string; month?: string; start?: string; end?: string }, now: Date = new Date()): PeriodRef {
  const fields: Record<string, string> = {};
  const fail = () => {
    throw new ApiError("VALIDATION_ERROR", 400, "Some fields are invalid.", fields);
  };
  let { kind } = input;
  if (kind === undefined) {
    // no selector at all -> the default period: current calendar month in Asia/Yerevan
    if (!input.month && !input.start && !input.end) {
      const today = todayIn(APP_TZ, now);
      return { kind: "month", start: firstOfMonth(today), end: lastOfMonth(today) };
    }
    kind = input.month ? "month" : "custom";
  }
  if (kind !== "month" && kind !== "custom") {
    fields.kind = "kind must be 'month' or 'custom'";
    return fail();
  }
  if (kind === "month") {
    if (input.start || input.end) fields[input.start ? "start" : "end"] = "Not allowed when kind is 'month'";
    if (!input.month) fields.month = "month (YYYY-MM) is required";
    else if (!MONTH_RE.test(input.month) || !dateWithinBounds(`${input.month}-01`)) fields.month = "month must be a valid YYYY-MM";
    if (Object.keys(fields).length) return fail();
    const start = `${input.month}-01`;
    return { kind: "month", start, end: lastOfMonth(start) };
  }
  if (input.month) fields.month = "Not allowed when kind is 'custom'";
  if (!input.start) fields.start = "start (YYYY-MM-DD) is required";
  else if (!dateWithinBounds(input.start)) fields.start = "start must be a valid date (YYYY-MM-DD)";
  if (!input.end) fields.end = "end (YYYY-MM-DD) is required";
  else if (!dateWithinBounds(input.end)) fields.end = "end must be a valid date (YYYY-MM-DD)";
  if (Object.keys(fields).length) return fail();
  const start = input.start!;
  const end = input.end!;
  if (start > end) {
    fields.end = "end must not be before start";
    return fail();
  }
  if (diffDays(end, start) + 1 > MAX_CUSTOM_PERIOD_DAYS) {
    fields.end = `A custom period may span at most ${MAX_CUSTOM_PERIOD_DAYS} days`;
    return fail();
  }
  const wholeMonth = firstOfMonth(start) === start && lastOfMonth(start) === end;
  return { kind: wholeMonth ? "month" : "custom", start, end };
}

/** query string of GET / DELETE /api/pf/period */
export const periodQuerySchema = z
  .object({
    kind: z.string().optional(),
    month: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
  })
  .strict();

/** body of PUT /api/pf/period (strict: unknown fields are rejected) */
export const putPeriodSchema = z
  .object({
    kind: z.enum(["month", "custom"], { error: "kind must be 'month' or 'custom'" }),
    month: z.string().optional(),
    start: z.string().optional(),
    end: z.string().optional(),
    income: moneyInput.optional().default(null),
    expenses: z.array(expenseInputSchema, { error: "expenses must be an array" }).max(DEFAULT_KEYS.length + MAX_CUSTOM_CATEGORIES + 5, "Too many categories").default([]),
  })
  .strict();

export interface NormalisedExpense {
  key: string | null;
  label: string;
  isCustom: boolean;
  amount: string | null;
}

/**
 * Validate the category list of a PUT and return it in storage order: the 7 defaults (missing ones = not entered),
 * then custom categories in the order given. Enforces: known default keys only, no duplicates, custom label 1-40 chars,
 * case-insensitive unique, never equal to a default label, at most 20 custom categories.
 */
export function normaliseExpenses(list: z.infer<typeof expenseInputSchema>[]): NormalisedExpense[] {
  const errors: Record<string, string> = {};
  const defaults = new Map<string, string | null>();
  const customs: NormalisedExpense[] = [];
  const seenLabels = new Set(DEFAULT_EXPENSE_CATEGORIES.map((c) => c.label.toLowerCase()));
  list.forEach((e, i) => {
    const at = `expenses.${i}`;
    if (e.key) {
      const def = DEFAULT_EXPENSE_CATEGORIES.find((c) => c.key === e.key);
      if (!def) {
        errors[`${at}.key`] = "Unknown category key";
      } else if (defaults.has(e.key)) {
        errors[`${at}.key`] = "Duplicate category";
      } else {
        defaults.set(e.key, e.amount);
      }
      return;
    }
    if (e.label === undefined) {
      errors[`${at}.label`] = "Enter a category name";
      return;
    }
    const lower = e.label.toLowerCase();
    if (seenLabels.has(lower)) {
      // custom label equal to a default label (or a previous custom label)
      errors[`${at}.label`] = DEFAULT_EXPENSE_CATEGORIES.some((c) => c.label.toLowerCase() === lower)
        ? "This name is already used by a default category"
        : "Category names must be unique";
      return;
    }
    seenLabels.add(lower);
    customs.push({ key: null, label: e.label, isCustom: true, amount: e.amount });
  });
  if (customs.length > MAX_CUSTOM_CATEGORIES) errors.expenses = `At most ${MAX_CUSTOM_CATEGORIES} custom categories per period`;
  if (Object.keys(errors).length) throw new ApiError("VALIDATION_ERROR", 400, "Some fields are invalid.", errors);
  return [
    ...DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ key: c.key as string | null, label: c.label as string, isCustom: false, amount: defaults.get(c.key) ?? null })),
    ...customs,
  ];
}

export { addDays };
