import type { DerivedMetrics } from "./types";
import { correlation, covariance, dailyReturns, stdev } from "./stats";

/** Raw fundamentals + price for one company; every field may be null (data gap). Values in USD / shares. */
export interface RawFundamentals {
  price: number | null;
  sharesOut: number | null;
  revenue: number | null;
  revenuePrev: number | null;
  revenue3yAgo: number | null;
  netIncome: number | null;
  netIncomePrev: number | null;
  netIncome2yAgo: number | null;
  eps: number | null;
  epsPrev: number | null;
  opIncome: number | null;
  equity: number | null;
  liabilities: number | null;
  opCashFlow: number | null;
  capex: number | null;
  dps: number | null;
}

const pos = (n: number | null): n is number => n !== null && Number.isFinite(n) && n > 0;
const ok = (n: number | null): n is number => n !== null && Number.isFinite(n);
const div = (a: number | null, b: number | null): number | null => (ok(a) && pos(b) ? a / b : null);

/**
 * Derived fundamentals metrics (handover 7.3). Annual (latest fiscal year) basis in v1.
 * A missing dividend value is treated as "no dividend" ONLY for dividend metrics (flagged by the caller) because the
 * XBRL dividend tags are absent for non-payers; every other gap stays null (never silently imputed).
 */
export function deriveMetrics(r: RawFundamentals, marketCap: number | null): DerivedMetrics {
  const dps = r.dps ?? 0;
  const fcf = ok(r.opCashFlow) && ok(r.capex) ? r.opCashFlow - Math.abs(r.capex) : null;
  const positives = [r.netIncome, r.netIncomePrev, r.netIncome2yAgo].filter(ok);
  return {
    roe: div(r.netIncome, r.equity),
    opMargin: div(r.opIncome, r.revenue),
    netMargin: div(r.netIncome, r.revenue),
    fcfMargin: div(fcf, r.revenue),
    debtToEquity: div(r.liabilities, r.equity),
    earningsStability: positives.length >= 2 ? positives.filter((x) => x > 0).length / positives.length : null,
    pe: pos(r.eps) && pos(r.price) ? r.price / r.eps : null,
    ps: div(marketCap, r.revenue),
    pb: div(marketCap, r.equity),
    fcfYield: ok(fcf) && pos(marketCap) ? fcf / marketCap : null,
    divYield: pos(r.price) ? dps / r.price : null,
    payout: pos(r.eps) ? dps / r.eps : null,
    revGrowth: pos(r.revenuePrev) && ok(r.revenue) ? r.revenue / r.revenuePrev - 1 : null,
    rev3yCAGR: pos(r.revenue3yAgo) && pos(r.revenue) ? (r.revenue / r.revenue3yAgo) ** (1 / 3) - 1 : null,
    epsGrowth: pos(r.epsPrev) && ok(r.eps) ? r.eps / r.epsPrev - 1 : null,
  };
}

export interface Bar {
  date: string;
  close: number;
  adjClose: number;
}

export interface PriceMetrics {
  vol1y: number | null;
  beta3y: number | null;
  maxDD1y: number | null;
  mom12_1: number | null;
  mom6: number | null;
  above200dma: number | null;
  historyDays: number;
  historyStart: string | null;
  /** largest single-day move on the ADJUSTED series (data-error detector) */
  maxAbsJump: number;
  lastDate: string | null;
  lastClose: number | null;
}

const daysBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Price-derived metrics from adjusted closes (handover 7.3):
 *  vol1y = stdev(last 252 daily simple returns) * sqrt(252); maxDD1y over the last 252 closes;
 *  mom12_1 = P(t-21)/P(t-252) - 1; mom6 = P(t)/P(t-126) - 1; above200dma = P(t)/SMA200 - 1;
 *  beta3y = cov(r, r_bench)/var(r_bench) on dates common to both series (needs >= betaMinObservations).
 */
export function computePriceMetrics(
  bars: Bar[],
  bench: Bar[] | null,
  opts: { tradingDays: number; betaMinObservations: number; betaYears: number },
): PriceMetrics {
  const b = [...bars].sort((x, y) => (x.date < y.date ? -1 : 1));
  const n = b.length;
  const empty: PriceMetrics = { vol1y: null, beta3y: null, maxDD1y: null, mom12_1: null, mom6: null, above200dma: null, historyDays: 0, historyStart: null, maxAbsJump: 0, lastDate: null, lastClose: null };
  if (n < 2) return { ...empty, lastDate: n ? b[0].date : null, lastClose: n ? b[0].close : null, historyStart: n ? b[0].date : null };
  const adj = b.map((x) => x.adjClose);
  const rets = dailyReturns(adj);
  const T = opts.tradingDays;
  const last = b[n - 1];
  const out: PriceMetrics = {
    ...empty,
    historyDays: daysBetween(b[0].date, last.date),
    historyStart: b[0].date,
    maxAbsJump: rets.reduce((m, r) => Math.max(m, Math.abs(r)), 0),
    lastDate: last.date,
    lastClose: last.close,
  };
  if (rets.length >= T - 12) {
    const r1 = rets.slice(-T);
    out.vol1y = stdev(r1) * Math.sqrt(T);
    const win = adj.slice(-T - 1);
    let peak = win[0];
    let dd = 0;
    for (const p of win) {
      peak = Math.max(peak, p);
      dd = Math.min(dd, p / peak - 1);
    }
    out.maxDD1y = dd;
  }
  if (n > T) out.mom12_1 = adj[n - 1 - 21] / adj[n - 1 - T] - 1;
  if (n > 126) out.mom6 = adj[n - 1] / adj[n - 1 - 126] - 1;
  if (n >= 200) {
    const sma = adj.slice(-200).reduce((s, x) => s + x, 0) / 200;
    out.above200dma = adj[n - 1] / sma - 1;
  }
  if (bench && bench.length > 10) {
    const bm = new Map(bench.map((x) => [x.date, x.adjClose]));
    const common = b.filter((x) => bm.has(x.date)).slice(-(T * opts.betaYears + 1));
    if (common.length - 1 >= opts.betaMinObservations) {
      const rs = dailyReturns(common.map((x) => x.adjClose));
      const rb = dailyReturns(common.map((x) => bm.get(x.date)!));
      const v = stdev(rb) ** 2;
      out.beta3y = v > 0 ? covariance(rs, rb) / v : null;
    }
  }
  return out;
}

/** average pairwise correlation of daily returns on common dates (used by portfolio construction/diagnostics) */
export function alignedReturnCorrelation(a: Bar[], b: Bar[], lastN: number): number | null {
  const bm = new Map(b.map((x) => [x.date, x.adjClose]));
  const common = a.filter((x) => bm.has(x.date)).slice(-(lastN + 1));
  if (common.length < 30) return null;
  return correlation(dailyReturns(common.map((x) => x.adjClose)), dailyReturns(common.map((x) => bm.get(x.date)!)));
}
