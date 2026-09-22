import { correlation, covariance, dailyReturns, mean, round, stdev } from "@/lib/quant/stats";
import { addMonths } from "@/lib/time";
import type { Bar, SnapshotRecord } from "@/market/read";

/**
 * Benchmark comparison math (handover 8.3). Everything here is PURE and works on daily simple returns:
 *  V_t = sum(shares_i * adjClose_i,t) (buy-and-hold with the actual whole-share holdings, no cash in a comparison request);
 *  benchmark = the same initial capital in the benchmark ETF (fractional units); both series are rebased to 100.
 * Hypothetical back-test of today's selection - see DISCLAIMERS.
 */
export interface SeriesMetrics {
  totalReturn: number;
  cagr: number | null;
  annualisedVolatility: number | null;
  maxDrawdown: number;
  maxDrawdownPeak: string | null;
  maxDrawdownTrough: string | null;
  worstDay: number | null;
  worstDayDate: string | null;
  worstMonth: number | null;
  sharpe: number | null;
  sortino: number | null;
  observations: number;
}

export interface RelativeMetrics {
  beta: number | null;
  correlation: number | null;
  trackingError: number | null;
  upCapture: number | null;
  downCapture: number | null;
}

const r6 = (n: number | null) => (n === null || !Number.isFinite(n) ? null : round(n, 6));

export function seriesMetrics(values: number[], dates: string[], rfAnnual: number | null, T = 252): SeriesMetrics {
  const rets = dailyReturns(values);
  const n = rets.length;
  const total = values[values.length - 1] / values[0] - 1;
  const cagr = n > 0 && values[0] > 0 ? (values[values.length - 1] / values[0]) ** (T / n) - 1 : null;
  const vol = n > 1 ? stdev(rets) * Math.sqrt(T) : null;
  let peak = values[0];
  let peakDate = dates[0];
  let maxDD = 0;
  let ddPeak: string | null = null;
  let ddTrough: string | null = null;
  values.forEach((v, i) => {
    if (v > peak) {
      peak = v;
      peakDate = dates[i];
    }
    const dd = v / peak - 1;
    if (dd < maxDD) {
      maxDD = dd;
      ddPeak = peakDate;
      ddTrough = dates[i];
    }
  });
  let worst = Infinity;
  let worstIdx = -1;
  rets.forEach((r, i) => {
    if (r < worst) {
      worst = r;
      worstIdx = i;
    }
  });
  // month-end to month-end returns (the first bucket starts at the first value)
  const monthLast = new Map<string, number>();
  dates.forEach((d, i) => monthLast.set(d.slice(0, 7), values[i]));
  let prev = values[0];
  let worstMonth: number | null = null;
  for (const v of monthLast.values()) {
    const mr = v / prev - 1;
    worstMonth = worstMonth === null ? mr : Math.min(worstMonth, mr);
    prev = v;
  }
  let sharpe: number | null = null;
  let sortino: number | null = null;
  if (rfAnnual !== null && cagr !== null) {
    if (vol && vol > 0) sharpe = (cagr - rfAnnual) / vol;
    const rfd = rfAnnual / T;
    const dd2 = mean(rets.map((r) => Math.min(0, r - rfd) ** 2));
    const downside = Math.sqrt(dd2) * Math.sqrt(T);
    if (downside > 0) sortino = (cagr - rfAnnual) / downside;
  }
  return {
    totalReturn: r6(total)!,
    cagr: r6(cagr),
    annualisedVolatility: r6(vol),
    maxDrawdown: r6(maxDD)!,
    maxDrawdownPeak: ddPeak,
    maxDrawdownTrough: ddTrough,
    worstDay: n ? r6(worst) : null,
    worstDayDate: worstIdx >= 0 ? dates[worstIdx + 1] : null,
    worstMonth: r6(worstMonth),
    sharpe: r6(sharpe),
    sortino: r6(sortino),
    observations: n,
  };
}

export function relativeMetrics(portfolio: number[], benchmark: number[], T = 252): RelativeMetrics {
  const rp = dailyReturns(portfolio);
  const rb = dailyReturns(benchmark);
  const vb = stdev(rb) ** 2;
  const up = rb.map((b, i) => ({ p: rp[i], b })).filter((x) => x.b > 0);
  const down = rb.map((b, i) => ({ p: rp[i], b })).filter((x) => x.b < 0);
  const cap = (list: { p: number; b: number }[]) => (list.length ? mean(list.map((x) => x.p)) / mean(list.map((x) => x.b)) : null);
  return {
    beta: vb > 0 ? r6(covariance(rp, rb) / vb) : null,
    correlation: rp.length > 1 ? r6(correlation(rp, rb)) : null,
    trackingError: rp.length > 1 ? r6(stdev(rp.map((p, i) => p - rb[i])) * Math.sqrt(T)) : null,
    upCapture: r6(cap(up)),
    downCapture: r6(cap(down)),
  };
}

export interface ComparisonHolding {
  symbol: string;
  shares: number;
}

export interface ComparisonResult {
  window: string;
  requestedStart: string;
  start: string;
  end: string;
  /** the requested window was longer than the available common history */
  truncated: boolean;
  series: { date: string; portfolio: number; benchmark: number }[];
  initialValueUsd: string;
  metrics: { portfolio: SeriesMetrics & RelativeMetrics; benchmark: SeriesMetrics & RelativeMetrics };
  riskFreeRate: number | null;
  riskFreeSource: string;
}

/** Aligns everything on the trading dates ALL series share (inner join), then builds series + metrics. */
export function computeComparison(opts: {
  window: string;
  months: number;
  holdings: ComparisonHolding[];
  bars: Map<string, Bar[]>;
  bench: Bar[];
  rfYields: { date: string; value: number }[];
  tradingDays: number;
}): ComparisonResult {
  const { holdings, bars, bench, tradingDays: T } = opts;
  const bm = new Map(bench.map((b) => [b.date, b.adjClose]));
  const maps = holdings.map((h) => new Map((bars.get(h.symbol) ?? []).map((b) => [b.date, b.adjClose])));
  const common = bench.map((b) => b.date).filter((d) => maps.every((m) => m.has(d)));
  common.sort();
  if (common.length < 2) throw new Error("NOT_ENOUGH_COMMON_HISTORY");
  const end = common[common.length - 1];
  const requestedStart = addMonths(end, -opts.months);
  let startIdx = common.findIndex((d) => d >= requestedStart);
  if (startIdx < 0) startIdx = common.length - 2;
  if (startIdx > common.length - 2) startIdx = common.length - 2;
  const dates = common.slice(startIdx);
  const truncated = common[0] > requestedStart && startIdx === 0;
  const pv = dates.map((d) => holdings.reduce((s, h, i) => s + h.shares * maps[i].get(d)!, 0));
  const units = pv[0] / bm.get(dates[0])!;
  const bv = dates.map((d) => units * bm.get(d)!);
  const rebase = (v: number[]) => v.map((x) => round((x / v[0]) * 100, 4));
  const ps = rebase(pv);
  const bs = rebase(bv);
  const rfs = opts.rfYields.filter((y) => y.date >= dates[0] && y.date <= end);
  const rf = rfs.length ? mean(rfs.map((y) => y.value)) / 100 : null;
  const pm = seriesMetrics(pv, dates, rf, T);
  const bmm = seriesMetrics(bv, dates, rf, T);
  const rel = relativeMetrics(pv, bv, T);
  return {
    window: opts.window,
    requestedStart,
    start: dates[0],
    end,
    truncated,
    series: dates.map((d, i) => ({ date: d, portfolio: ps[i], benchmark: bs[i] })),
    initialValueUsd: pv[0].toFixed(2),
    metrics: {
      portfolio: { ...pm, ...rel },
      benchmark: { ...bmm, beta: 1, correlation: 1, trackingError: 0, upCapture: 1, downCapture: 1 },
    },
    riskFreeRate: rf === null ? null : r6(rf),
    riskFreeSource: rf === null ? "unavailable (Sharpe/Sortino omitted)" : "13-week T-bill yield (^IRX) mean over the window, via Yahoo prototype series",
  };
}

export interface Diversification {
  holdingsCount: number;
  universeSize: number;
  effectiveN: number;
  top1Weight: number;
  top3Weight: number;
  sectorCount: number;
  maxSectorWeight: number;
  benchmarkMaxSectorWeight: number | null;
  sectors: { sector: string; portfolioWeight: number; benchmarkWeight: number | null }[];
  averagePairwiseCorrelation: number | null;
  diversificationRatio: number | null;
}

/** benchmark sector weights: prototype = cap-weighted from the universe snapshot (approximates float-adjusted index weights) */
export function universeSectorWeights(records: SnapshotRecord[]): Map<string, number> {
  const m = new Map<string, number>();
  let total = 0;
  for (const r of records) {
    if (r.marketCap && r.sector) {
      m.set(r.sector, (m.get(r.sector) ?? 0) + r.marketCap);
      total += r.marketCap;
    }
  }
  for (const [k, v] of m) m.set(k, v / total);
  return m;
}

export function computeDiversification(opts: {
  weights: { symbol: string; weight: number; sector: string | null }[];
  bars: Map<string, Bar[]>;
  benchSectorWeights: Map<string, number>;
  universeSize: number;
  tradingDays: number;
}): Diversification {
  const w = [...opts.weights].sort((a, b) => b.weight - a.weight);
  const sectorMap = new Map<string, number>();
  for (const h of w) sectorMap.set(h.sector ?? "Unknown", (sectorMap.get(h.sector ?? "Unknown") ?? 0) + h.weight);
  const sectors = [...sectorMap.entries()]
    .map(([sector, portfolioWeight]) => ({ sector, portfolioWeight: round(portfolioWeight, 4), benchmarkWeight: opts.benchSectorWeights.has(sector) ? round(opts.benchSectorWeights.get(sector)!, 4) : null }))
    .sort((a, b) => b.portfolioWeight - a.portfolioWeight);
  // aligned daily returns over the last year for correlation / diversification ratio
  const maps = w.map((h) => new Map((opts.bars.get(h.symbol) ?? []).map((b) => [b.date, b.adjClose])));
  let dates = [...(maps[0]?.keys() ?? [])].filter((d) => maps.every((m) => m.has(d))).sort();
  dates = dates.slice(-(opts.tradingDays + 1));
  let avgCorr: number | null = null;
  let divRatio: number | null = null;
  if (w.length >= 2 && dates.length >= 60) {
    const rets = maps.map((m) => dailyReturns(dates.map((d) => m.get(d)!)));
    const pairs: number[] = [];
    for (let i = 0; i < rets.length; i++) for (let j = i + 1; j < rets.length; j++) pairs.push(correlation(rets[i], rets[j]));
    avgCorr = round(mean(pairs), 4);
    const sig = rets.map((r) => stdev(r) * Math.sqrt(opts.tradingDays));
    let varP = 0;
    for (let i = 0; i < rets.length; i++) for (let j = 0; j < rets.length; j++) varP += w[i].weight * w[j].weight * covariance(rets[i], rets[j]) * opts.tradingDays;
    const sigP = Math.sqrt(varP);
    divRatio = sigP > 0 ? round(w.reduce((s, h, i) => s + h.weight * sig[i], 0) / sigP, 4) : null;
  }
  const maxSector = sectors[0]?.portfolioWeight ?? 0;
  const benchMax = opts.benchSectorWeights.size ? Math.max(...opts.benchSectorWeights.values()) : null;
  return {
    holdingsCount: w.length,
    universeSize: opts.universeSize,
    effectiveN: round(1 / w.reduce((s, h) => s + h.weight ** 2, 0), 2),
    top1Weight: round(w[0]?.weight ?? 0, 4),
    top3Weight: round(w.slice(0, 3).reduce((s, h) => s + h.weight, 0), 4),
    sectorCount: sectors.length,
    maxSectorWeight: maxSector,
    benchmarkMaxSectorWeight: benchMax === null ? null : round(benchMax, 4),
    sectors,
    averagePairwiseCorrelation: avgCorr,
    diversificationRatio: divRatio,
  };
}

export const DISCLAIMERS = [
  "Hypothetical back-test of today's selection using historical prices. It is not a forecast; past performance does not guarantee future results.",
  "Hindsight and selection bias: today's holdings were chosen with today's data, so their past looks flattering by construction.",
  "Survivorship bias: the universe contains only the current S&P 500 members.",
  "Costs, taxes, FX spreads and dividend withholding are not modelled. Dividends are included through adjusted closing prices.",
  "The benchmark is shown for context only (reference only - not a recommendation). Risk measures such as volatility and drawdown matter as much as return.",
] as const;
