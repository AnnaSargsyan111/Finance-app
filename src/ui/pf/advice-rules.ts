/**
 * Personal Finance "Your money, explained": plain rules over the user's OWN saved numbers (no outside data, no investment
 * input). Every message is produced by a fixed rule that is written out in `why`, so the user can always see why it appears.
 *
 * Levels in one flow: the insight (headline + snapshot), the alert (something worth a look) and the suggestion (the one
 * action attached to each alert, plus a what-if).
 */
import type { PeriodView } from "../api/types";
import { formatAmd, formatPercent } from "../lib/format";

export const NEEDS_KEYS = ["housing", "bills_utilities", "transportation", "food_dining"] as const;
export const WANTS_KEYS = ["shopping", "entertainment"] as const;

/** rule thresholds, in one place */
export const RULES = {
  /** below this share of income left over, the month is "thin" */
  thinRate: 0.1,
  /** a common affordability line for housing (share of income) */
  housingGuide: 0.3,
  housingSevere: 0.5,
  /** a category "jumped" when it rose by both this share AND this amount (AMD) versus the previous period */
  spikeShare: 0.25,
  spikeAmount: 15_000,
  /** share of expenses filed under "Other" that makes the picture unclear */
  otherShare: 0.2,
  /** the commonly quoted savings target */
  goalRate: 0.2,
  maxAlerts: 3,
} as const;

export interface Cat {
  label: string;
  amount: number;
}
/** One period's numbers in AMD. `cats` is keyed by the default key, or "c:<label>" for a custom category. */
export interface Money {
  /** null when no income was entered (or it is 0): income-based rules are skipped */
  income: number | null;
  spent: number;
  cats: Map<string, Cat>;
}

const num = (v: string | null | undefined) => {
  const n = v === null || v === undefined ? 0 : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function moneyOf(view: PeriodView): Money {
  const cats = new Map<string, Cat>();
  let spent = 0;
  for (const e of view.expenses) {
    const amount = num(e.amount);
    if (amount <= 0) continue;
    spent += amount;
    cats.set(e.isCustom || !e.key ? `c:${e.label.trim().toLowerCase()}` : e.key, { label: e.label, amount });
  }
  const income = view.income === null ? null : num(view.income);
  return { income: income !== null && income > 0 ? income : null, spent, cats };
}

const amountOf = (m: Money, key: string) => m.cats.get(key)?.amount ?? 0;
const sumKeys = (m: Money, keys: readonly string[]) => keys.reduce((a, k) => a + amountOf(m, k), 0);

export type Level = "high" | "medium" | "low";
export interface Alert {
  id: string;
  level: Level;
  title: string;
  text: string;
  /** the one thing to try */
  action: string;
  /** the exact rule behind the message */
  why: string;
}

export interface Analysis {
  hasIncome: boolean;
  spent: number;
  available: number;
  /** share of income left over (can be negative); 0 when there is no income */
  rate: number;
  needs: number;
  wants: number;
  /** "Other" plus custom categories */
  rest: number;
  /** the places spending is easiest to trim, biggest first (only those above 0) */
  flexible: { key: string; label: string; amount: number }[];
  /** the single largest category (default or custom) */
  biggest: { label: string; amount: number } | null;
  alerts: Alert[];
  /** change in expenses versus the previous period (a share), and its biggest mover; null without a comparison */
  versus: { change: number; mover: { label: string; diff: number } | null } | null;
}

const FLEX_KEYS = ["shopping", "entertainment", "other"] as const;
const FLEX_LABEL: Record<string, string> = { shopping: "Shopping", entertainment: "Entertainment", other: "Other" };

const LEVEL_ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 };

export function analyse(now: Money, prev: Money | null): Analysis {
  const income = now.income ?? 0;
  const hasIncome = now.income !== null;
  const available = income - now.spent;
  const rate = hasIncome ? available / income : 0;
  const needs = sumKeys(now, NEEDS_KEYS);
  const wants = sumKeys(now, WANTS_KEYS);
  const rest = Math.max(0, now.spent - needs - wants);

  const flexible = FLEX_KEYS.map((k) => ({ key: k, label: FLEX_LABEL[k], amount: amountOf(now, k) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const flexLine = flexible
    .slice(0, 2)
    .map((x) => `${x.label} (${formatAmd(x.amount)})`)
    .join(" and ");

  const alerts: Alert[] = [];

  if (hasIncome && available < 0) {
    alerts.push({
      id: "over",
      level: "high",
      title: "You spent more than you earned",
      text: `Expenses are ${formatAmd(-available)} above income this period.`,
      action: flexLine ? `Closing the gap takes ${formatAmd(-available)}. Your most flexible spending is ${flexLine}: start there.` : `Closing the gap takes ${formatAmd(-available)}. Start with your largest expense.`,
      why: `Rule: expenses (${formatAmd(now.spent)}) are greater than income (${formatAmd(income)}).`,
    });
  } else if (hasIncome && rate < RULES.thinRate) {
    const need = Math.round(income * RULES.thinRate - available);
    const first = flexible[0];
    alerts.push({
      id: "thin",
      level: "medium",
      title: "Very little is left over",
      text: `Only ${formatPercent(rate * 100, 0)} of income is left (${formatAmd(available)}). A surprise cost could tip the month negative.`,
      action: first
        ? `Keeping 10% would take another ${formatAmd(need)}. Trimming ${first.label} by 10% frees about ${formatAmd(Math.round(first.amount * 0.1))}.`
        : `Keeping 10% would take another ${formatAmd(need)}. Look at your largest expense first.`,
      why: "Rule: money left over is under 10% of income.",
    });
  }

  const housing = amountOf(now, "housing");
  const housingShare = hasIncome ? housing / income : 0;
  if (housingShare > RULES.housingGuide) {
    alerts.push({
      id: "housing",
      level: housingShare > RULES.housingSevere ? "high" : "medium",
      title: housingShare > RULES.housingSevere ? "Housing takes more than half of income" : "Housing is above the 30% guide",
      text: `Housing is ${formatPercent(housingShare * 100, 0)} of income. Housing agencies call more than 30% a "cost burden" (and more than 50% "severe").`,
      action: "Housing is usually the biggest lever: sharing, a smaller place or renegotiating the rent can save more than trimming small items.",
      why: "Rule: housing / income is above 30%, the commonly used affordability line (for example US HUD). It is a guide, not a verdict: rents differ a lot between cities.",
    });
  }

  let versus: Analysis["versus"] = null;
  if (prev && prev.spent > 0) {
    const keys = new Set([...now.cats.keys(), ...prev.cats.keys()]);
    const movers = [...keys]
      .map((k) => {
        const a = now.cats.get(k);
        const b = prev.cats.get(k);
        return { key: k, label: (a ?? b)!.label, now: a?.amount ?? 0, before: b?.amount ?? 0 };
      })
      .map((m) => ({ ...m, diff: m.now - m.before, pct: m.before > 0 ? (m.now - m.before) / m.before : 0 }))
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
    versus = { change: (now.spent - prev.spent) / prev.spent, mover: movers[0] ? { label: movers[0].label, diff: movers[0].diff } : null };
    const jump = movers.find((m) => m.before > 0 && m.pct >= RULES.spikeShare && m.diff >= RULES.spikeAmount);
    if (jump) {
      alerts.push({
        id: `spike-${jump.key}`,
        level: "medium",
        title: `${jump.label} jumped ${formatPercent(jump.pct * 100, 0)}`,
        text: `${formatAmd(jump.now)} this period vs ${formatAmd(jump.before)} last period (+${formatAmd(jump.diff)}).`,
        action: `Try bringing ${jump.label} back toward last period's ${formatAmd(jump.before)}: that would free ${formatAmd(jump.diff)}.`,
        why: "Rule: a category rose by at least 25% AND at least 15,000 AMD compared with the previous month (both, so small amounts do not create noise).",
      });
    }
  }

  const other = amountOf(now, "other");
  if (now.spent > 0 && other / now.spent > RULES.otherShare) {
    alerts.push({
      id: "other",
      level: "low",
      title: "A lot is filed under “Other”",
      text: `${formatPercent((other / now.spent) * 100, 0)} of expenses are uncategorised, so the picture is less clear.`,
      action: "Move the largest items into named categories (use “Add category” in the form below) and every message here gets more accurate.",
      why: "Rule: “Other” is more than 20% of expenses.",
    });
  }

  alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const top = [...now.cats.values()].sort((p, q) => q.amount - p.amount)[0];
  return { hasIncome, spent: now.spent, available, rate, needs, wants, rest, flexible, biggest: top ?? null, alerts: alerts.slice(0, RULES.maxAlerts), versus };
}

/** one sentence for the top of the card */
export function headline(a: Analysis): { text: string; tone: "pos" | "neg" | "neutral" } {
  if (!a.hasIncome) return { text: "Add your income to see how much of it you keep.", tone: "neutral" };
  if (a.spent === 0) return { text: "Add your expenses to see where your money goes.", tone: "neutral" };
  if (a.available < 0) return { text: `You spent ${formatAmd(-a.available)} more than you earned.`, tone: "neg" };
  return { text: `You kept ${formatPercent(a.rate * 100, 0)} of your income.`, tone: "pos" };
}

/** the "what if I trim" maths (savings only: no investment return is assumed) */
export function trimResult(a: Analysis, income: number, amount: number, cutPercent: number) {
  const saved = Math.round((amount * cutPercent) / 100);
  return { saved, year: saved * 12, newRate: income > 0 ? (a.available + saved) / income : 0 };
}

/** share of income for each bar segment; the base is the larger of income and spending so nothing overflows */
export function barShares(a: Analysis, income: number) {
  const base = Math.max(income, a.spent, 1);
  const pc = (n: number) => Math.max(0, (n / base) * 100);
  return { needs: pc(a.needs), wants: pc(a.wants), rest: pc(a.rest), left: pc(Math.max(0, a.available)) };
}

/** the savings-target sentence */
export function goalLine(a: Analysis, income: number, goalRate: number = RULES.goalRate): { reached: boolean; amount: number; gap: number } {
  const amount = Math.round(income * goalRate);
  const gap = Math.max(0, Math.round(amount - a.available));
  return { reached: a.available >= amount, amount, gap };
}
