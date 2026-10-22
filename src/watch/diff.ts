import type { StockView, WatchView } from "./view";

/**
 * Comparing two views of the same stock, parameter by parameter. Every row has the text shown "before" and "now" and whether the two
 * differ (`changed`: the shown text is not the same) and whether the difference is big enough to be worth an email (`meaningful`).
 * The thresholds are small on purpose and live here in one place.
 */
export interface Row {
  key: string;
  label: string;
  prev: string;
  next: string;
  changed: boolean;
  meaningful: boolean;
}

export const THRESHOLDS = {
  /** price: relative change */
  price: 0.02,
  /** match score: points */
  score: 1,
  /** volatility and drawdown: absolute change as a fraction (0.01 = 1 percentage point) */
  risk: 0.01,
  /** a "why this match" input: change of its "top X%" rank, in points */
  rank: 3,
} as const;

const NONE = "not available";
const usd = (n: number | null) => (n === null ? NONE : `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const amd = (n: number | null) => (n === null ? NONE : `${Math.round(n).toLocaleString("en-US")} AMD`);
const pct = (n: number | null) => (n === null ? NONE : `${(n * 100).toFixed(1)}%`);
const int = (n: number | null) => (n === null ? NONE : String(Math.round(n)));
const dec1 = (n: number | null) => (n === null ? NONE : n.toFixed(1));
const both = (a: string, b: string, ok: boolean) => (ok ? `${a} (${b})` : a);

function row(key: string, label: string, prev: string, next: string, meaningful: boolean): Row {
  return { key, label, prev, next, changed: prev !== next, meaningful: prev !== next && meaningful };
}

const rel = (a: number | null, b: number | null) => (a === null || b === null || a === 0 ? null : Math.abs(b - a) / Math.abs(a));
const abs = (a: number | null, b: number | null) => (a === null || b === null ? null : Math.abs(b - a));
/** a value that appeared or disappeared always counts */
const gone = (a: number | null, b: number | null) => (a === null) !== (b === null);

/** the parameters of one stock, in the order the recommendation page shows them */
export function compareStock(prev: StockView, next: StockView, mode: WatchView["mode"]): Row[] {
  const rows: Row[] = [];
  const priceRel = rel(prev.price, next.price);
  rows.push(row("price", "Price per share", usd(prev.price), usd(next.price), gone(prev.price, next.price) || (priceRel ?? 0) >= THRESHOLDS.price));
  if (mode === "single") {
    rows.push(row("shares", "Shares for your amount", int(prev.shares), int(next.shares), false));
    rows.push(row("cost", "Cost", both(usd(prev.costUsd), amd(prev.costAmd), prev.costAmd !== null), both(usd(next.costUsd), amd(next.costAmd), next.costAmd !== null), false));
    rows.push(row("cash", "Cash left over", both(amd(prev.cashAmd), usd(prev.cashUsd), prev.cashUsd !== null), both(amd(next.cashAmd), usd(next.cashUsd), next.cashUsd !== null), false));
  } else {
    rows.push(row("shares", "Shares you hold", int(prev.shares), int(next.shares), false));
    rows.push(row("position", "Value of this holding", usd(prev.positionUsd), usd(next.positionUsd), false));
  }
  rows.push(row("vol1y", "1-year volatility", pct(prev.vol1y), pct(next.vol1y), gone(prev.vol1y, next.vol1y) || (abs(prev.vol1y, next.vol1y) ?? 0) >= THRESHOLDS.risk));
  rows.push(row("maxDD1y", "1-year max drawdown", pct(prev.maxDD1y), pct(next.maxDD1y), gone(prev.maxDD1y, next.maxDD1y) || (abs(prev.maxDD1y, next.maxDD1y) ?? 0) >= THRESHOLDS.risk));
  rows.push(row("score", "Match score", dec1(prev.score), dec1(next.score), gone(prev.score, next.score) || (abs(prev.score, next.score) ?? 0) >= THRESHOLDS.score));
  rows.push(row("fits", "Fits your risk level", prev.fits ? "Yes" : "No", next.fits ? "Yes" : "No", true));
  for (const d of prev.drivers) {
    const cur = next.drivers.find((x) => x.label === d.label);
    const show = (x: { value: string; topPercent: number } | undefined) => (x ? (x.value === "yes" ? "Yes" : `${x.value} (top ${x.topPercent}% of eligible stocks)`) : NONE);
    const shifted = !cur || Math.abs(cur.topPercent - d.topPercent) >= THRESHOLDS.rank;
    // a "why this match" input can be named like a row above (1-year volatility): tell them apart
    const label = rows.some((r) => r.label === d.label) ? `${d.label} (how it ranks)` : d.label;
    rows.push(row(`driver:${d.label}`, label, show(d), show(cur), shifted));
  }
  return rows;
}

export interface StockComparison {
  symbol: string;
  name: string;
  rows: Row[];
}

export interface Comparison {
  stocks: StockComparison[];
  /** portfolio only: the whole portfolio's value at these prices */
  total: Row | null;
  changedCount: number;
  rowCount: number;
  meaningful: boolean;
}

export function compareViews(prev: WatchView, next: WatchView): Comparison {
  const stocks = prev.stocks.map((p): StockComparison => {
    const n = next.stocks.find((x) => x.symbol === p.symbol) ?? { ...p, price: null, shares: p.shares, costUsd: null, costAmd: null, cashUsd: null, cashAmd: null, positionUsd: null, score: null, fits: false, vol1y: null, maxDD1y: null, drivers: [] };
    return { symbol: p.symbol, name: n.name || p.name, rows: compareStock(p, n, prev.mode) };
  });
  const total = prev.mode === "portfolio" ? row("total", "Value of your portfolio", usd(prev.totalUsd), usd(next.totalUsd), (rel(prev.totalUsd, next.totalUsd) ?? 0) >= THRESHOLDS.price) : null;
  const all = [...stocks.flatMap((s) => s.rows), ...(total ? [total] : [])];
  return { stocks, total, changedCount: all.filter((r) => r.changed).length, rowCount: all.length, meaningful: all.some((r) => r.meaningful) };
}
