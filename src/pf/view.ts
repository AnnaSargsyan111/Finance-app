import { centsToString, parseCents } from "@/lib/money";

/** Pure view-building for a period (no I/O): totals, breakdown percents, flags. All money is exact BigInt cents. */
export interface ExpenseRow {
  key: string | null;
  label: string;
  isCustom: boolean;
  amount: string | null;
}

export interface PeriodView {
  period: { kind: "month" | "custom"; start: string; end: string };
  exists: boolean;
  income: string | null;
  expenses: ExpenseRow[];
  totals: { income: string; expensesTotal: string; available: string };
  /** only categories with amount > 0; integer percents that sum to exactly 100 (largest-remainder rounding) */
  expenseBreakdown: { label: string; amount: string; percent: number }[];
  cashFlow: { income: string; expenses: string; available: string };
  isEmpty: boolean;
  incomeMissing: boolean;
  updatedAt: string | null;
}

/**
 * Largest-remainder apportionment of 100 points over `amounts` (BigInt cents, all > 0).
 * Deterministic: ties on the remainder go to the larger amount, then to the lower index.
 */
export function apportionPercents(amounts: bigint[]): number[] {
  const total = amounts.reduce((a, b) => a + b, 0n);
  if (total <= 0n) return amounts.map(() => 0);
  const floors = amounts.map((a) => Number((a * 100n) / total));
  const remainders = amounts.map((a, i) => ({ i, rem: (a * 100n) % total, amount: a }));
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  remainders.sort((x, y) => (x.rem !== y.rem ? (x.rem > y.rem ? -1 : 1) : x.amount !== y.amount ? (x.amount > y.amount ? -1 : 1) : x.i - y.i));
  const out = [...floors];
  for (const r of remainders) {
    if (left <= 0) break;
    out[r.i] += 1;
    left--;
  }
  return out;
}

export function buildView(input: {
  period: PeriodView["period"];
  exists: boolean;
  income: string | null;
  expenses: ExpenseRow[];
  updatedAt: string | null;
}): PeriodView {
  const incomeCents = input.income === null ? null : parseCents(input.income);
  let expensesCents = 0n;
  for (const e of input.expenses) if (e.amount !== null) expensesCents += parseCents(e.amount);
  const available = (incomeCents ?? 0n) - expensesCents;

  const positive = input.expenses
    .filter((e) => e.amount !== null && parseCents(e.amount) > 0n)
    .map((e) => ({ label: e.label, cents: parseCents(e.amount!) }))
    .sort((a, b) => (a.cents === b.cents ? a.label.localeCompare(b.label) : a.cents > b.cents ? -1 : 1));
  const percents = apportionPercents(positive.map((p) => p.cents));
  const expenseBreakdown = positive.map((p, i) => ({ label: p.label, amount: centsToString(p.cents), percent: percents[i] }));

  const totals = {
    income: centsToString(incomeCents ?? 0n),
    expensesTotal: centsToString(expensesCents),
    available: centsToString(available),
  };
  return {
    period: input.period,
    exists: input.exists,
    income: input.income,
    expenses: input.expenses,
    totals,
    expenseBreakdown,
    cashFlow: { income: totals.income, expenses: totals.expensesTotal, available: totals.available },
    isEmpty: incomeCents === null && expensesCents === 0n,
    incomeMissing: incomeCents === null && expensesCents > 0n,
    updatedAt: input.updatedAt,
  };
}
