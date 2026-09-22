import { describe, expect, it } from "vitest";
import { amountError, apportionPercents, buildPreview, customRangeError, fingerprint, fromView, shiftMonth, toCents, toPutBody, validateForm, type FormState } from "@/ui/pf/calc";
import type { PeriodView } from "@/ui/api/types";

const emptyView: PeriodView = {
  period: { kind: "month", start: "2026-09-01", end: "2026-09-30" },
  exists: false,
  income: null,
  expenses: ["housing", "food_dining", "transportation", "bills_utilities", "shopping", "entertainment", "other"].map((key) => ({ key, label: key, isCustom: false, amount: null })),
  totals: { income: "0.00", expensesTotal: "0.00", available: "0.00" },
  expenseBreakdown: [],
  cashFlow: { income: "0.00", expenses: "0.00", available: "0.00" },
  isEmpty: true,
  incomeMissing: false,
  updatedAt: null,
};

const withAmounts = (income: string, amounts: Record<string, string>): FormState => {
  const f = fromView(emptyView);
  f.income = income;
  f.rows = f.rows.map((r) => (r.key && amounts[r.key] !== undefined ? { ...r, amount: amounts[r.key] } : r));
  return f;
};

describe("Personal Finance client maths (same formula as the server)", () => {
  it("parses money in exact cents", () => {
    expect(toCents("")).toBeNull();
    expect(toCents("900000")).toBe(90000000);
    expect(toCents("120000.5")).toBe(12000050);
    expect(toCents("0.07")).toBe(7);
    expect(Number.isNaN(toCents("12.345") as number)).toBe(true);
    expect(Number.isNaN(toCents("abc") as number)).toBe(true);
    expect(amountError("-5")).not.toBeNull();
    expect(amountError("1000000000000")).toBeNull(); // 1e12 is allowed
    expect(amountError("10000000000000")).not.toBeNull(); // 14 digits is not
  });

  it("available / difference = income - expenses (never a balance)", () => {
    const p = buildPreview(withAmounts("900000", { housing: "250000", food_dining: "120000.5", transportation: "80000" }));
    expect(p.incomeCents).toBe(90000000);
    expect(p.expensesCents).toBe(45000050);
    expect(p.availableCents).toBe(44999950);
    expect(p.isEmpty).toBe(false);
    expect(p.incomeMissing).toBe(false);
  });

  it("matches the backend sample: income 900000.00, expenses 652500.50 -> 247499.50", () => {
    const p = buildPreview(withAmounts("900000.00", { housing: "500000", shopping: "152500.50" }));
    expect(p.expensesCents).toBe(65250050);
    expect(p.availableCents).toBe(24749950);
  });

  it("is empty (no chart data) when nothing is entered, and flags missing income", () => {
    expect(buildPreview(withAmounts("", {})).isEmpty).toBe(true);
    const zero = buildPreview(withAmounts("", { housing: "0" }));
    expect(zero.isEmpty).toBe(true);
    expect(zero.breakdown).toHaveLength(0); // zero-value categories never become slices
    const noIncome = buildPreview(withAmounts("", { housing: "100" }));
    expect(noIncome.incomeMissing).toBe(true);
    expect(noIncome.availableCents).toBe(-10000);
  });

  it("breakdown percents always sum to 100 (largest remainder)", () => {
    for (const set of [[1, 1, 1], [35, 20, 15], [1, 2, 4, 8, 16], [33, 33, 34], [7, 7, 7, 7, 7, 7, 7]]) {
      expect(apportionPercents(set).reduce((a, b) => a + b, 0)).toBe(100);
    }
    const p = buildPreview(withAmounts("1", { housing: "350", food_dining: "200", transportation: "150" }));
    expect(p.breakdown.map((b) => `${b.label}:${b.percent}`)).toEqual(["housing:50", "food_dining:29", "transportation:21"]);
  });

  it("custom categories count in the total and the breakdown, and blank ones are ignored", () => {
    const f = withAmounts("500", { housing: "100" });
    f.rows.push({ id: "c1", key: null, label: "Pets", amount: "50", isCustom: true });
    f.rows.push({ id: "c2", key: null, label: "", amount: "", isCustom: true });
    const p = buildPreview(f);
    expect(p.expensesCents).toBe(15000);
    expect(p.breakdown.map((b) => b.label)).toContain("Pets");
    const { body, indexToRow } = toPutBody(f, { kind: "month", month: "2026-09" });
    expect(body.expenses.filter((e) => e.label)).toEqual([{ label: "Pets", amount: "50.00" }]);
    expect(body.expenses.find((e) => e.key === "housing")).toEqual({ key: "housing", amount: "100.00" });
    expect(indexToRow).not.toContain("c2");
    expect(body.income).toBe("500.00");
  });

  it("validates custom category names like the server", () => {
    const f = withAmounts("", {});
    f.rows.push({ id: "a", key: null, label: "Housing", amount: "", isCustom: true });
    f.rows.push({ id: "b", key: null, label: "pets", amount: "1", isCustom: true });
    f.rows.push({ id: "c", key: null, label: "PETS", amount: "1", isCustom: true });
    f.rows.push({ id: "d", key: null, label: "x".repeat(41), amount: "1", isCustom: true });
    f.rows.push({ id: "e", key: null, label: "", amount: "5", isCustom: true });
    const v = validateForm(f);
    expect(v.ok).toBe(false);
    expect(v.rows.a?.label).toMatch(/default category/);
    expect(v.rows.c?.label).toMatch(/unique/);
    expect(v.rows.d?.label).toMatch(/at most 40/);
    expect(v.rows.e?.label).toMatch(/Enter a category name/);
    expect(v.rows.b).toBeUndefined();
  });

  it("dirty tracking ignores client ids and formatting, but notices real edits", () => {
    const base = fromView(emptyView);
    const same = fromView(emptyView); // fresh ids
    expect(fingerprint(base)).toBe(fingerprint(same));
    expect(fingerprint({ ...same, income: "10" })).not.toBe(fingerprint(base));
    expect(fingerprint({ ...base, income: "10.0" })).toBe(fingerprint({ ...base, income: "10" }));
  });

  it("period helpers", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(customRangeError("2026-09-10", "2026-09-01")).toMatch(/before/);
    expect(customRangeError("2026-01-01", "2027-12-31")).toMatch(/366/);
    expect(customRangeError("2026-09-01", "2026-09-15")).toBeNull();
    expect(customRangeError("", "2026-09-15")).not.toBeNull();
  });
});
