/**
 * Personal Finance "Your money, explained": plain rules over the user's OWN saved numbers (no outside data, no investment
 * input). Every message is produced by a fixed rule that is written out in `why`, so the user can always see why it appears.
 *
 * Levels in one flow: the insight (headline + snapshot), the alert (something worth a look) and the suggestion (the one
 * action attached to each alert, plus a what-if).
 */
import type { PeriodView } from "../api/types";
import { tg } from "../i18n/translate";
import { formatAmd, formatPercent } from "../lib/format";
import { categoryLabel, toCents, type FormState } from "./calc";

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
    cats.set(e.isCustom || !e.key ? `c:${e.label.trim().toLowerCase()}` : e.key, { label: categoryLabel(e.key, e.isCustom, e.label), amount });
  }
  const income = view.income === null ? null : num(view.income);
  return { income: income !== null && income > 0 ? income : null, spent, cats };
}

/** the same numbers straight from the form while the user types (blank or malformed amounts count as nothing) */
export function moneyFromForm(f: FormState): Money {
  const cats = new Map<string, Cat>();
  let spent = 0;
  for (const r of f.rows) {
    const c = toCents(r.amount);
    if (c === null || Number.isNaN(c) || c <= 0) continue;
    const amount = c / 100;
    const label = r.isCustom ? r.label.trim() || tg("pf.category.customFallback") : categoryLabel(r.key, false, r.label);
    const key = r.isCustom || !r.key ? `c:${label.toLowerCase()}` : r.key;
    spent += amount;
    cats.set(key, { label, amount: (cats.get(key)?.amount ?? 0) + amount });
  }
  const ic = toCents(f.income);
  return { income: ic !== null && !Number.isNaN(ic) && ic > 0 ? ic / 100 : null, spent, cats };
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

/** "Shopping (80,000 AMD) and Other (40,000 AMD)": the (up to) two most flexible places, as one phrase */
export function flexLineOf(flexible: { label: string; amount: number }[]): string {
  const parts = flexible.slice(0, 2).map((x) => tg("pf.rules.catAmount", { label: x.label, amount: formatAmd(x.amount) }));
  return parts.length === 2 ? tg("pf.rules.and", { a: parts[0], b: parts[1] }) : (parts[0] ?? "");
}

const LEVEL_ORDER: Record<Level, number> = { high: 0, medium: 1, low: 2 };

export function analyse(now: Money, prev: Money | null): Analysis {
  const income = now.income ?? 0;
  const hasIncome = now.income !== null;
  const available = income - now.spent;
  const rate = hasIncome ? available / income : 0;
  const needs = sumKeys(now, NEEDS_KEYS);
  const wants = sumKeys(now, WANTS_KEYS);
  const rest = Math.max(0, now.spent - needs - wants);

  const flexible = FLEX_KEYS.map((k) => ({ key: k, label: categoryLabel(k, false, k), amount: amountOf(now, k) }))
    .filter((x) => x.amount > 0)
    .sort((a, b) => b.amount - a.amount);
  const flexLine = flexLineOf(flexible);

  const alerts: Alert[] = [];

  if (hasIncome && available < 0) {
    alerts.push({
      id: "over",
      level: "high",
      title: tg("pf.rules.over.title"),
      text: tg("pf.rules.over.text", { gap: formatAmd(-available) }),
      action: flexLine ? tg("pf.rules.over.action", { gap: formatAmd(-available), flex: flexLine }) : tg("pf.rules.over.actionNoFlex", { gap: formatAmd(-available) }),
      why: tg("pf.rules.over.why", { spent: formatAmd(now.spent), income: formatAmd(income) }),
    });
  } else if (hasIncome && rate < RULES.thinRate) {
    const need = Math.round(income * RULES.thinRate - available);
    const first = flexible[0];
    alerts.push({
      id: "thin",
      level: "medium",
      title: tg("pf.rules.thin.title"),
      text: tg("pf.rules.thin.text", { rate: formatPercent(rate * 100, 0), left: formatAmd(available) }),
      action: first
        ? tg("pf.rules.thin.action", { need: formatAmd(need), label: first.label, freed: formatAmd(Math.round(first.amount * 0.1)) })
        : tg("pf.rules.thin.actionNoFirst", { need: formatAmd(need) }),
      why: tg("pf.rules.thin.why"),
    });
  }

  const housing = amountOf(now, "housing");
  const housingShare = hasIncome ? housing / income : 0;
  if (housingShare > RULES.housingGuide) {
    alerts.push({
      id: "housing",
      level: housingShare > RULES.housingSevere ? "high" : "medium",
      title: housingShare > RULES.housingSevere ? tg("pf.rules.housing.titleSevere") : tg("pf.rules.housing.titleHigh"),
      text: tg("pf.rules.housing.text", { share: formatPercent(housingShare * 100, 0) }),
      action: tg("pf.rules.housing.action"),
      why: tg("pf.rules.housing.why"),
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
        title: tg("pf.rules.spike.title", { label: jump.label, pct: formatPercent(jump.pct * 100, 0) }),
        text: tg("pf.rules.spike.text", { now: formatAmd(jump.now), before: formatAmd(jump.before), diff: formatAmd(jump.diff) }),
        action: tg("pf.rules.spike.action", { label: jump.label, before: formatAmd(jump.before), diff: formatAmd(jump.diff) }),
        why: tg("pf.rules.spike.why"),
      });
    }
  }

  const other = amountOf(now, "other");
  if (now.spent > 0 && other / now.spent > RULES.otherShare) {
    alerts.push({
      id: "other",
      level: "low",
      title: tg("pf.rules.other.title"),
      text: tg("pf.rules.other.text", { pct: formatPercent((other / now.spent) * 100, 0) }),
      action: tg("pf.rules.other.action"),
      why: tg("pf.rules.other.why"),
    });
  }

  alerts.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const top = [...now.cats.values()].sort((p, q) => q.amount - p.amount)[0];
  return { hasIncome, spent: now.spent, available, rate, needs, wants, rest, flexible, biggest: top ?? null, alerts: alerts.slice(0, RULES.maxAlerts), versus };
}

/** one sentence for the top of the card */
export function headline(a: Analysis): { text: string; tone: "pos" | "neg" | "neutral" } {
  if (!a.hasIncome) return { text: tg("pf.rules.headline.noIncome"), tone: "neutral" };
  if (a.spent === 0) return { text: tg("pf.rules.headline.noExpenses"), tone: "neutral" };
  if (a.available < 0) return { text: tg("pf.rules.headline.over", { amount: formatAmd(-a.available) }), tone: "neg" };
  return { text: tg("pf.rules.headline.kept", { pct: formatPercent(a.rate * 100, 0) }), tone: "pos" };
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
