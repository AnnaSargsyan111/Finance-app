import { usdCentsToAmdFloor } from "@/invest/money";
import type { CurrentStock } from "@/invest/current";

/**
 * What a saved recommendation looked like (or looks like now), reduced to the parameters the email talks about: for each stock the
 * price, what it costs for the saved amount, the match score, the 1-year volatility and drawdown, and the "why this match" inputs.
 * The same shape is read from the saved result (the baseline) and built from the latest data snapshot, so the two can be compared.
 */
export interface DriverView {
  label: string;
  value: string;
  rawValue: number;
  topPercent: number;
}

export interface StockView {
  symbol: string;
  name: string;
  /** USD per share */
  price: number | null;
  shares: number | null;
  /** single stock only: what the shares cost and what is left of the budget (USD and AMD) */
  costUsd: number | null;
  costAmd: number | null;
  cashUsd: number | null;
  cashAmd: number | null;
  /** portfolio only: shares x price */
  positionUsd: number | null;
  score: number | null;
  /** does the stock still pass the filters of the saved risk level and horizon? */
  fits: boolean;
  vol1y: number | null;
  maxDD1y: number | null;
  drivers: DriverView[];
}

export interface WatchView {
  mode: "single" | "portfolio";
  /** the data date this view is from (the snapshot date) */
  asOf: string;
  risk: "low" | "medium" | "high";
  horizon: "short" | "medium" | "long";
  amountAmd: number;
  budgetUsd: number;
  usdRate: string;
  stocks: StockView[];
  /** portfolio only: the holdings' value at these prices */
  totalUsd: number | null;
}

type R = Record<string, unknown>;
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const str = (v: unknown): string => (typeof v === "string" ? v : "");
const obj = (v: unknown): R => (v && typeof v === "object" ? (v as R) : {});

function driversOf(card: R): DriverView[] {
  const list = Array.isArray(card.drivers) ? (card.drivers as R[]) : [];
  return list.flatMap((d) => {
    const label = str(d.label);
    const rawValue = num(d.rawValue);
    const topPercent = num(d.topPercent);
    return label && rawValue !== null && topPercent !== null ? [{ label, value: str(d.value), rawValue, topPercent }] : [];
  });
}

/** the saved recommendation as it was shown on the day it was saved */
export function viewFromSaved(result: R, snapshotDate: string): WatchView | null {
  const inputs = obj(result.inputs);
  const risk = inputs.risk as WatchView["risk"];
  const horizon = inputs.horizon as WatchView["horizon"];
  const amountAmd = num(inputs.amountAmd);
  const budgetUsd = num(result.budgetUsd);
  const usdRate = str(result.usdRate);
  if (!["low", "medium", "high"].includes(risk) || !["short", "medium", "long"].includes(horizon) || amountAmd === null || budgetUsd === null || !usdRate) return null;
  const base = { asOf: snapshotDate, risk, horizon, amountAmd, budgetUsd, usdRate };
  const metricsOf = (card: R) => {
    const m = obj(card.metrics);
    return { vol1y: num(m.vol1y), maxDD1y: num(m.maxDD1y) };
  };
  if (result.mode === "portfolio") {
    const holdings = (Array.isArray(result.holdings) ? result.holdings : []) as R[];
    const stocks: StockView[] = holdings.map((h) => ({
      symbol: str(h.symbol),
      name: str(h.name),
      price: num(h.price),
      shares: num(h.shares),
      costUsd: null,
      costAmd: null,
      cashUsd: null,
      cashAmd: null,
      positionUsd: num(h.cost),
      score: num(h.composite),
      fits: true,
      ...metricsOf(h),
      drivers: driversOf(h),
    }));
    return { ...base, mode: "portfolio", stocks, totalUsd: num(result.allocatedAmountUsd) };
  }
  const pick = obj(result.pick);
  if (!str(pick.symbol)) return null;
  const stock: StockView = {
    symbol: str(pick.symbol),
    name: str(pick.name),
    price: num(pick.price),
    shares: num(pick.shares),
    costUsd: num(pick.cost),
    costAmd: num(result.allocatedAmountAmd),
    cashUsd: num(pick.leftoverCash),
    cashAmd: num(result.unallocatedCashAmd),
    positionUsd: null,
    score: num(pick.composite),
    fits: true,
    ...metricsOf(pick),
    drivers: driversOf(pick),
  };
  return { ...base, mode: "single", stocks: [stock], totalUsd: null };
}

const cents = (usd: number) => Math.round(usd * 100);

/** the same stocks, with today's numbers; the saved amount, risk level, horizon, dollar rate and share counts are kept so only the market moves */
export function viewNow(saved: WatchView, now: { asOf: string; stocks: Map<string, CurrentStock> }): WatchView {
  const stocks = saved.stocks.map((s): StockView => {
    const c = now.stocks.get(s.symbol);
    const price = c?.price ?? null;
    const drivers = s.drivers.flatMap((d): DriverView[] => {
      const cur = c?.drivers[d.label];
      return cur ? [{ label: d.label, value: cur.value, rawValue: cur.rawValue, topPercent: cur.topPercent }] : [];
    });
    const common = { symbol: s.symbol, name: c?.name ?? s.name, price, score: c?.score ?? null, fits: c?.eligible ?? false, vol1y: c?.vol1y ?? null, maxDD1y: c?.maxDD1y ?? null, drivers };
    if (saved.mode === "portfolio") {
      return { ...common, shares: s.shares, costUsd: null, costAmd: null, cashUsd: null, cashAmd: null, positionUsd: price !== null && s.shares !== null ? (s.shares * cents(price)) / 100 : null };
    }
    if (price === null || price <= 0) return { ...common, shares: null, costUsd: null, costAmd: null, cashUsd: null, cashAmd: null, positionUsd: null };
    const budget = cents(saved.budgetUsd);
    const shares = Math.floor(budget / cents(price));
    const cost = shares * cents(price);
    const costAmd = usdCentsToAmdFloor(cost, saved.usdRate);
    return { ...common, shares, costUsd: cost / 100, costAmd, cashUsd: (budget - cost) / 100, cashAmd: saved.amountAmd - costAmd, positionUsd: null };
  });
  const total = saved.mode === "portfolio" && stocks.every((s) => s.positionUsd !== null) ? stocks.reduce((sum, s) => sum + (s.positionUsd ?? 0), 0) : null;
  return { ...saved, asOf: now.asOf, stocks, totalUsd: total };
}
