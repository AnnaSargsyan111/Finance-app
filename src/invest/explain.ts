import type { FactorName, Horizon, Risk, SnapshotRecord } from "@/market/read";
import { FACTORS } from "@/lib/quant/types";
import type { Weights } from "@/lib/quant/composite";

/**
 * Deterministic explanations built ONLY from the snapshot's real numbers (handover 7.5): the same inputs the scoring
 * used, formatted with fixed rules, so a test can parse the text and compare it with the snapshot values.
 */
type Fmt = "pct" | "ratio" | "bool";
const LABELS: Record<string, { label: string; fmt: Fmt }> = {
  roe: { label: "Return on equity", fmt: "pct" },
  opMargin: { label: "Operating margin", fmt: "pct" },
  fcfMargin: { label: "Free-cash-flow margin", fmt: "pct" },
  debtToEquity: { label: "Liabilities to equity", fmt: "ratio" },
  earningsStability: { label: "Profitable years (last 3)", fmt: "pct" },
  pe: { label: "P/E (latest fiscal year)", fmt: "ratio" },
  ps: { label: "Price to sales", fmt: "ratio" },
  pb: { label: "Price to book", fmt: "ratio" },
  fcfYield: { label: "Free-cash-flow yield", fmt: "pct" },
  revGrowth: { label: "Revenue growth (year on year)", fmt: "pct" },
  rev3yCAGR: { label: "Revenue growth (3-year annualised)", fmt: "pct" },
  epsGrowth: { label: "EPS growth (year on year)", fmt: "pct" },
  mom12_1: { label: "12-1 month price momentum", fmt: "pct" },
  mom6: { label: "6-month price momentum", fmt: "pct" },
  above200dma: { label: "Price vs 200-day average", fmt: "pct" },
  vol1y: { label: "1-year volatility", fmt: "pct" },
  beta3y: { label: "Beta vs the S&P 500 ETF (3 years)", fmt: "ratio" },
  maxDDAbs: { label: "1-year maximum drawdown", fmt: "pct" },
  divYield: { label: "Dividend yield", fmt: "pct" },
  payoutOk: { label: "Dividend payout at or below 70%", fmt: "bool" },
  paysDividend: { label: "Pays a dividend", fmt: "bool" },
};

export const FACTOR_LABELS: Record<FactorName, string> = {
  quality: "Quality",
  value: "Value",
  growth: "Growth",
  momentum: "Momentum",
  lowRisk: "Low risk",
  income: "Income",
};

export interface Driver {
  label: string;
  factor: FactorName;
  /** display string built from rawValue */
  value: string;
  rawValue: number;
  /** percentile rank among eligible stocks, 0-100, higher = better */
  percentile: number;
  /** "top X %" of eligible stocks = 100 - percentile, rounded (at least 1) */
  topPercent: number;
}

export const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

function display(name: string, value: number, rec: SnapshotRecord): { text: string; raw: number } {
  const f = LABELS[name].fmt;
  if (name === "maxDDAbs") return { text: pct1(rec.maxDD1y ?? -value), raw: rec.maxDD1y ?? -value };
  if (f === "pct") return { text: pct1(value), raw: value };
  if (f === "ratio") return { text: value.toFixed(2), raw: value };
  return { text: value ? "yes" : "no", raw: value };
}

/** the inputs that contributed most to the composite: weight of the factor x percentile of the input */
export function driversFor(rec: SnapshotRecord, weights: Weights, max = 5): Driver[] {
  const rows = Object.entries(rec.factorInputs)
    .filter(([name]) => LABELS[name])
    .map(([name, inp]) => ({ name, inp, contribution: weights[inp.factor] * inp.pct }))
    .filter((r) => !(LABELS[r.name].fmt === "bool" && !r.inp.value))
    .sort((a, b) => (b.contribution !== a.contribution ? b.contribution - a.contribution : a.name < b.name ? -1 : 1));
  // drivers are STRENGTHS: prefer inputs in the upper part of the eligible set; fall back to the best remaining ones
  const strong = rows.filter((r) => r.inp.pct >= 60);
  const chosen = strong.length >= 3 ? strong.slice(0, max) : [...strong, ...rows.filter((r) => r.inp.pct < 60)].slice(0, Math.max(3, Math.min(max, strong.length + 1)));
  return chosen.map(({ name, inp }) => {
    const d = display(name, inp.value, rec);
    return {
      label: LABELS[name].label,
      factor: inp.factor,
      value: d.text,
      rawValue: d.raw,
      percentile: inp.pct,
      topPercent: Math.max(1, Math.round(100 - inp.pct)),
    };
  });
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

export function explanationText(drivers: Driver[], weights: Weights, risk: Risk, horizon: Horizon): string {
  const parts = drivers.map((d) => (d.value === "yes" ? `${d.label}` : `${d.label} ${d.value} (top ${d.topPercent}% of eligible stocks)`));
  const w = FACTORS.filter((f) => weights[f] > 0)
    .map((f) => `${FACTOR_LABELS[f]} ${Math.round(weights[f])}%`)
    .join(", ");
  return `${parts.join(" · ")}. Scoring weights for ${cap(risk)} risk and ${cap(horizon)} horizon: ${w}.`;
}
