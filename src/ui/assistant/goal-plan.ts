/**
 * Savings-goal maths for the AI Assistant. Deterministic and exact: the assistant never does this arithmetic itself.
 *
 *  - Deposits are made at the END of each month. With no interest: monthly = (goal - saved) / months.
 *  - With a yearly interest rate r the monthly rate is i = r / 12 and the money already saved grows too:
 *      monthly = (goal - saved * (1+i)^n) * i / ((1+i)^n - 1)
 *  - A user-given deposit rate is an ASSUMPTION, not a promise. Interest on deposits is taxed at 10% for individuals (Armenian Tax Code),
 *    so the plan uses the rate after tax.
 */
export const DEPOSIT_INTEREST_TAX = 0.1;

export const LIMITS = {
  minMonths: 1,
  maxMonths: 600,
  maxAmount: 1_000_000_000_000,
  maxRatePct: 50,
} as const;

/** share of income above which a plan is called a stretch / probably not realistic */
export const REALISM = { stretch: 0.3, unrealistic: 0.5 } as const;

export type Realism = "comfortable" | "stretch" | "unrealistic";

export function netRatePct(grossPct: number): number {
  return grossPct * (1 - DEPOSIT_INTEREST_TAX);
}

const monthlyRate = (ratePct: number) => ratePct / 100 / 12;

/** the amount to put aside at the end of every month so that `goal` is reached after `months` (0 when already reached) */
export function monthlyNeeded(goal: number, months: number, saved = 0, ratePct = 0): number {
  const i = monthlyRate(ratePct);
  if (i === 0) return Math.max(0, (goal - saved) / months);
  const growth = (1 + i) ** months;
  const need = goal - saved * growth;
  if (need <= 0) return 0;
  return (need * i) / (growth - 1);
}

/** the whole number of months needed when `monthly` is put aside at the end of every month; null when it can never be reached */
export function monthsNeeded(goal: number, monthly: number, saved = 0, ratePct = 0): number | null {
  if (goal - saved <= 0) return 0;
  if (!(monthly > 0)) return null;
  const i = monthlyRate(ratePct);
  if (i === 0) return Math.ceil((goal - saved) / monthly);
  const ratio = (goal + monthly / i) / (saved + monthly / i);
  if (!(ratio > 1)) return 0;
  return Math.ceil(Math.log(ratio) / Math.log(1 + i) - 1e-9);
}

export function realismOf(share: number): Realism {
  return share > REALISM.unrealistic ? "unrealistic" : share > REALISM.stretch ? "stretch" : "comfortable";
}

export function durationLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = y === 1 ? "1 year" : `${y} years`;
  const ms = m === 1 ? "1 month" : `${m} months`;
  return y === 0 ? ms : m === 0 ? ys : `${ys} ${ms}`;
}

export interface PlanInput {
  goal: number;
  months: number;
  /** already saved for this goal */
  saved?: number;
  /** monthly income (typed by the user, optional) */
  income?: number | null;
  /** the user's assumed yearly deposit rate in percent, BEFORE tax (optional) */
  ratePct?: number | null;
}

export interface WhatIf {
  pct: number;
  monthly: number;
  /** null: never (nothing to put aside) */
  months: number | null;
}

export interface PlanResult {
  goal: number;
  months: number;
  saved: number;
  /** the amount to set aside every month, rounded up to a whole dram */
  monthly: number;
  alreadyReached: boolean;
  /** share of income (0..n) and how to read it; null without income */
  share: number | null;
  realism: Realism | null;
  /** the rate used after tax, or null when no rate was given */
  rate: { grossPct: number; netPct: number } | null;
  /** what the same plan needs with NO interest, to show what the rate changes (only when a rate is given) */
  monthlyWithoutInterest: number | null;
  /** how many drams of the goal come from interest (after tax) rather than from deposits; 0 without a rate */
  interestPart: number;
  whatIfs: WhatIf[] | null;
}

export type PlanProblem = { field: "goal" | "months" | "saved" | "income" | "rate"; message: string };

/** the first thing wrong with the numbers, or null */
export function checkPlanInput(i: PlanInput): PlanProblem | null {
  const bad = (n: unknown) => typeof n !== "number" || !Number.isFinite(n);
  if (bad(i.goal) || i.goal <= 0) return { field: "goal", message: "Please check the goal amount: it has to be more than 0." };
  if (i.goal > LIMITS.maxAmount) return { field: "goal", message: "That goal amount looks too large. Please check it." };
  if (bad(i.months) || i.months < LIMITS.minMonths) return { field: "months", message: "Please give a time of at least 1 month." };
  if (i.months > LIMITS.maxMonths) return { field: "months", message: "That is more than 50 years. Please choose a shorter time." };
  if (i.saved !== undefined && (bad(i.saved) || i.saved < 0)) return { field: "saved", message: "Please check the amount already saved: it can't be negative." };
  if (i.income !== undefined && i.income !== null && (bad(i.income) || i.income <= 0)) return { field: "income", message: "Please check the income: it has to be more than 0." };
  if (i.income !== undefined && i.income !== null && i.income > LIMITS.maxAmount) return { field: "income", message: "That income looks too large. Please check it." };
  if (i.ratePct !== undefined && i.ratePct !== null && (bad(i.ratePct) || i.ratePct < 0 || i.ratePct > LIMITS.maxRatePct)) return { field: "rate", message: `Please give a yearly rate between 0 and ${LIMITS.maxRatePct}%.` };
  return null;
}

export function planFor(i: PlanInput): PlanResult {
  const problem = checkPlanInput(i);
  if (problem) throw new Error(problem.message);
  const saved = i.saved ?? 0;
  const grossPct = i.ratePct && i.ratePct > 0 ? i.ratePct : 0;
  const netPct = netRatePct(grossPct);
  const monthly = Math.ceil(monthlyNeeded(i.goal, i.months, saved, netPct) - 1e-9) || 0; // `|| 0` turns -0 into 0
  const withoutInterest = Math.ceil(monthlyNeeded(i.goal, i.months, saved, 0) - 1e-9) || 0;
  const income = i.income ?? null;
  const share = income ? monthly / income : null;
  const deposits = saved + monthly * i.months;
  return {
    goal: i.goal,
    months: i.months,
    saved,
    monthly,
    alreadyReached: i.goal - saved <= 0,
    share,
    realism: share === null ? null : realismOf(share),
    rate: grossPct > 0 ? { grossPct, netPct } : null,
    monthlyWithoutInterest: grossPct > 0 ? withoutInterest : null,
    interestPart: grossPct > 0 ? Math.max(0, Math.round(i.goal - deposits)) : 0,
    whatIfs: income ? [10, 15, 20].map((pct) => ({ pct, monthly: Math.round((income * pct) / 100), months: monthsNeeded(i.goal, (income * pct) / 100, saved, netPct) })) : null,
  };
}
