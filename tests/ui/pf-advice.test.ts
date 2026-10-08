import { describe, expect, it } from "vitest";
import { analyse, barShares, goalLine, headline, moneyOf, trimResult, type Money } from "@/ui/pf/advice-rules";
import type { PeriodView } from "@/ui/api/types";

const LABELS: Record<string, string> = { housing: "Housing", food_dining: "Food & Dining", transportation: "Transportation", bills_utilities: "Bills & Utilities", shopping: "Shopping", entertainment: "Entertainment", other: "Other" };
const KEYS = ["housing", "food_dining", "transportation", "bills_utilities", "shopping", "entertainment", "other"];

function view(income: string | null, amounts: Record<string, string>, custom: { label: string; amount: string }[] = []): PeriodView {
  return {
    period: { kind: "month", start: "2026-09-01", end: "2026-09-30" },
    exists: true,
    income,
    expenses: [...KEYS.map((key) => ({ key, label: LABELS[key], isCustom: false, amount: amounts[key] ?? null })), ...custom.map((c) => ({ key: null, label: c.label, isCustom: true, amount: c.amount }))],
    totals: { income: "0.00", expensesTotal: "0.00", available: "0.00" },
    expenseBreakdown: [],
    cashFlow: { income: "0.00", expenses: "0.00", available: "0.00" },
    isEmpty: false,
    incomeMissing: income === null,
    updatedAt: null,
  };
}
const money = (income: string | null, amounts: Record<string, string>, custom?: { label: string; amount: string }[]): Money => moneyOf(view(income, amounts, custom));

const balanced = money("900000", { housing: "270000", food_dining: "150000", transportation: "45000", bills_utilities: "60000", shopping: "70000", entertainment: "40000", other: "25000" });
const tight = money("700000", { housing: "230000", food_dining: "175000", transportation: "50000", bills_utilities: "55000", shopping: "80000", entertainment: "35000", other: "40000" });
const tightBefore = money("700000", { housing: "230000", food_dining: "120000", transportation: "50000", bills_utilities: "55000", shopping: "75000", entertainment: "35000", other: "30000" });

describe("moneyOf", () => {
  it("reads decimal strings, skips empty rows and treats income 0 as not entered", () => {
    const m = money("1000.50", { housing: "200.25", food_dining: "0" });
    expect(m.income).toBe(1000.5);
    expect(m.spent).toBe(200.25);
    expect([...m.cats.keys()]).toEqual(["housing"]);
    expect(money("0", {}).income).toBeNull();
    expect(money(null, {}).income).toBeNull();
  });

  it("keeps custom categories apart from the defaults, matched by their name", () => {
    const m = money("500000", { other: "10000" }, [{ label: "Pets", amount: "20000" }]);
    expect(m.cats.get("c:pets")?.amount).toBe(20000);
    expect(m.cats.get("other")?.amount).toBe(10000);
    expect(m.spent).toBe(30000);
  });
});

describe("analyse", () => {
  it("a balanced month raises nothing and keeps a healthy share", () => {
    const a = analyse(balanced, null);
    expect(a.alerts).toEqual([]);
    expect(a.available).toBe(900000 - 660000);
    expect(a.rate).toBeCloseTo(0.2667, 3);
    expect(a.versus).toBeNull();
  });

  it("flags spending above income as the most important alert, with an action", () => {
    const a = analyse(money("600000", { housing: "300000", food_dining: "140000", shopping: "90000", entertainment: "45000", other: "20000", transportation: "50000", bills_utilities: "55000" }), null);
    expect(a.alerts[0].id).toBe("over");
    expect(a.alerts[0].level).toBe("high");
    expect(a.alerts[0].action).toContain("Shopping");
    expect(a.alerts[0].why).toMatch(/^Rule:/);
  });

  it("flags a thin month (under 10% left) but not when already overspent", () => {
    const thin = analyse(tight, null);
    expect(thin.alerts.map((x) => x.id)).toContain("thin");
    expect(thin.alerts.map((x) => x.id)).not.toContain("over");
  });

  it("flags housing above 30% and above 50% of income", () => {
    expect(analyse(money("1000000", { housing: "350000" }), null).alerts[0]).toMatchObject({ id: "housing", level: "medium" });
    expect(analyse(money("1000000", { housing: "550000" }), null).alerts[0]).toMatchObject({ id: "housing", level: "high" });
    expect(analyse(money("1000000", { housing: "300000" }), null).alerts).toEqual([]);
  });

  it("flags a category that jumped by 25% AND 15,000 AMD, only with a previous month", () => {
    expect(analyse(tight, null).alerts.map((x) => x.id)).not.toContain("spike-food_dining");
    const a = analyse(tight, tightBefore);
    const spike = a.alerts.find((x) => x.id === "spike-food_dining");
    expect(spike?.title).toBe("Food & Dining jumped 46%");
    expect(spike?.action).toContain("120,000");
    expect(a.versus?.change).toBeCloseTo((665000 - 595000) / 595000, 4);
    expect(a.versus?.mover).toEqual({ label: "Food & Dining", diff: 55000 });
  });

  it("ignores a big percentage on a small amount, and a big amount on a small percentage", () => {
    const before = money("700000", { food_dining: "10000", housing: "200000" });
    expect(analyse(money("700000", { food_dining: "20000", housing: "200000" }), before).alerts.map((x) => x.id)).not.toContain("spike-food_dining"); // +100% but only 10,000
    const big = money("700000", { housing: "300000" });
    expect(analyse(money("700000", { housing: "320000" }), big).alerts.map((x) => x.id)).not.toContain("spike-housing"); // +20,000 but only +6.7%
  });

  it("notices a jump in a custom category too", () => {
    const a = analyse(money("800000", { housing: "200000" }, [{ label: "Pets", amount: "60000" }]), money("800000", { housing: "200000" }, [{ label: "Pets", amount: "30000" }]));
    expect(a.alerts.map((x) => x.id)).toContain("spike-c:pets");
  });

  it("flags a large 'Other' share", () => {
    const a = analyse(money("900000", { housing: "100000", other: "90000" }), null);
    expect(a.alerts.map((x) => x.id)).toContain("other");
  });

  it("shows at most three alerts, most important first", () => {
    const a = analyse(money("400000", { housing: "300000", other: "200000", food_dining: "90000" }), money("400000", { housing: "300000", other: "100000", food_dining: "40000" }));
    expect(a.alerts.length).toBeLessThanOrEqual(3);
    expect(a.alerts[0].level).toBe("high");
  });

  it("skips income-based rules without income", () => {
    const a = analyse(money(null, { housing: "300000", other: "10000" }), null);
    expect(a.hasIncome).toBe(false);
    expect(a.alerts.map((x) => x.id)).toEqual([]);
    expect(a.rate).toBe(0);
  });

  it("splits needs, wants and the rest (other plus custom)", () => {
    const a = analyse(money("900000", { housing: "100000", food_dining: "50000", shopping: "30000", entertainment: "10000", other: "20000" }, [{ label: "Pets", amount: "5000" }]), null);
    expect(a.needs).toBe(150000);
    expect(a.wants).toBe(40000);
    expect(a.rest).toBe(25000);
    expect(a.flexible.map((x) => x.key)).toEqual(["shopping", "other", "entertainment"]);
  });
});

describe("headline, bar, goal and what-if", () => {
  it("writes one plain sentence for every situation", () => {
    expect(headline(analyse(balanced, null))).toEqual({ text: "You kept 27% of your income.", tone: "pos" });
    expect(headline(analyse(money("100000", { housing: "130000" }), null))).toEqual({ text: "You spent 30,000 AMD more than you earned.", tone: "neg" });
    expect(headline(analyse(money(null, { housing: "1000" }), null)).tone).toBe("neutral");
    expect(headline(analyse(money("100000", {}), null)).text).toMatch(/Add your expenses/);
  });

  it("the bar never overflows when spending is above income", () => {
    const a = analyse(money("100000", { housing: "100000", shopping: "50000" }), null);
    const sh = barShares(a, 100000);
    expect(sh.needs + sh.wants + sh.rest + sh.left).toBeCloseTo(100, 5);
    expect(sh.left).toBe(0);
  });

  it("states the 20% target and how far away it is", () => {
    const a = analyse(tight, null);
    expect(goalLine(a, 700000)).toEqual({ reached: false, amount: 140000, gap: 105000 });
    expect(goalLine(analyse(balanced, null), 900000).reached).toBe(true);
  });

  it("the what-if is savings only", () => {
    const a = analyse(tight, null);
    expect(trimResult(a, 700000, 80000, 10)).toEqual({ saved: 8000, year: 96000, newRate: (35000 + 8000) / 700000 });
    expect(trimResult(a, 700000, 80000, 0).saved).toBe(0);
  });
});
