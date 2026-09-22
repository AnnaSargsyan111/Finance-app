import type { Horizon, Risk } from "../api/types";

export const RISKS: { value: Risk; label: string; help: string }[] = [
  { value: "low", label: "Low", help: "Steadier companies with smaller price swings." },
  { value: "medium", label: "Medium", help: "A balance of steadiness and growth." },
  { value: "high", label: "High", help: "Larger price swings for more growth potential." },
];

export const HORIZONS: { value: Horizon; label: string; help: string }[] = [
  { value: "short", label: "Short term", help: "Less than 2 years" },
  { value: "medium", label: "Medium term", help: "2 to 5 years" },
  { value: "long", label: "Long term", help: "More than 5 years" },
];

export const riskLabel = (r: Risk) => RISKS.find((x) => x.value === r)?.label ?? r;
export const horizonLabel = (h: Horizon) => HORIZONS.find((x) => x.value === h)?.label ?? h;

export const MIN_AMOUNT = 1_000;
export const MAX_AMOUNT = 1_000_000_000;
export const EMERGENCY_LABEL = "This money isn't needed for emergencies.";

/** validation message for the amount step; null when valid. `raw` is the digits-only string. */
export function amountProblem(raw: string): string | null {
  if (!raw.trim()) return "Enter the amount you would like to invest.";
  if (!/^\d+$/.test(raw)) return "Use whole numbers only.";
  const n = Number(raw);
  if (n < MIN_AMOUNT) return `The amount must be at least ${MIN_AMOUNT.toLocaleString("en-US")} AMD.`;
  if (n > MAX_AMOUNT) return `The amount can be at most ${MAX_AMOUNT.toLocaleString("en-US")} AMD.`;
  return null;
}

/** how full the progress bar is: each completed requirement fills a quarter */
export function progressPercent(v: { amount: string; risk: Risk | null; horizon: Horizon | null; confirmed: boolean }): number {
  let p = 0;
  if (amountProblem(v.amount) === null) p += 25;
  if (v.risk) p += 25;
  if (v.horizon) p += 25;
  if (v.confirmed) p += 25;
  return p;
}
