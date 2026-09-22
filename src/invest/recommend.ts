import { ApiError } from "@/lib/errors";
import { methodologyVersion } from "@/lib/methodology";
import { compositeScore, contributions, weightsFor, type Weights } from "@/lib/quant/composite";
import { universeConfig } from "@/lib/quant/config";
import { evaluateRiskEligibility } from "@/lib/quant/eligibility";
import { correlation, dailyReturns, covariance, mean, round, stdev } from "@/lib/quant/stats";
import { FACTORS, type Horizon, type Risk } from "@/lib/quant/types";
import { addDays, diffDays, todayIn } from "@/lib/time";
import { readLatestSnapshot, readPriceSeries, readUsdAmdRate, type Bar, type LoadedSnapshot, type SnapshotRecord } from "@/market/read";
import { allocateWholeShares, inverseVolScoreWeights, roundWeights } from "./allocation";
import { computeComparison, computeDiversification, DISCLAIMERS, universeSectorWeights } from "./benchmark";
import { investConfig, type InvestConfig } from "./config";
import { driversFor, explanationText, FACTOR_LABELS } from "./explain";
import { amdToUsdCentsFloor, centsStr, priceCents, usdCentsToAmdFloor } from "./money";
import type { RecommendationRequest } from "./schemas";

/**
 * Deterministic recommendation engine (handover 7 + Change Order 1, 17.4). No ML, no trades, no user data:
 * the ONLY inputs are the request fields, the latest universe snapshot, stored prices and the CBA USD rate.
 * Same inputs + same snapshot + same FX rate => byte-identical output.
 */
export interface Warning {
  code: string;
  message: string;
}

const SCORE_LABEL = "Match score";
const SCORE_NOTE = "How closely this selection fits your risk and horizon under Finova's scoring method. It is not a forecast of returns.";

const BASE_DISCLAIMERS = [
  "Informational only, not personal investment advice. Nothing here is an offer or a recommendation to buy or sell.",
  "Finova executes no trades and connects to no broker.",
  "Selections come from a rules-based method (see methodologyVersion) applied to public data; they are not predictions.",
  "Prices are end-of-day / delayed values from free public sources and may differ from what a broker shows.",
] as const;

interface Candidate {
  rec: SnapshotRecord;
  composite: number;
  priceCents: number;
}

export interface Context {
  input: RecommendationRequest;
  cfg: InvestConfig;
  snap: LoadedSnapshot;
  weights: Weights;
  rate: { rate: string; rateDate: string; source: string; stale: boolean };
  budgetCents: number;
  ranked: Candidate[];
  warnings: Warning[];
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

async function buildContext(input: RecommendationRequest, now: Date): Promise<Context> {
  const cfg = investConfig();
  const snap = await readLatestSnapshot();
  if (!snap) {
    throw new ApiError("NO_SNAPSHOT", 503, "Recommendation data is not available yet: the universe snapshot has not been built.");
  }
  const rate = await readUsdAmdRate();
  const weights = weightsFor(input.risk, input.horizon);
  const ucfg = universeConfig();
  const ranked: Candidate[] = [];
  for (const rec of snap.payload.records) {
    if (rec.price === null) continue;
    if (!evaluateRiskEligibility(rec, input.risk, input.horizon, ucfg).ok) continue;
    const composite = compositeScore(rec, weights);
    if (composite === null) continue;
    ranked.push({ rec, composite, priceCents: priceCents(rec.price) });
  }
  ranked.sort((a, b) => (b.composite !== a.composite ? b.composite - a.composite : a.rec.symbol < b.rec.symbol ? -1 : 1));
  const budgetCents = amdToUsdCentsFloor(input.amountAmd, rate.rate);
  const warnings: Warning[] = [];
  if (input.risk === "low" && input.horizon === "short") {
    warnings.push({
      code: "LOW_RISK_SHORT_HORIZON",
      message: "Shares can lose value over horizons under 2 years. For a short horizon with low risk tolerance, deposits or bonds are other options to consider. This result is shown for information.",
    });
  }
  if (input.risk === "high" && input.horizon === "short") {
    warnings.push({ code: "HIGH_RISK_SHORT_HORIZON", message: "High risk combined with a short horizon means large price swings can occur before the horizon ends." });
  }
  if (budgetCents / 100 < cfg.budget.tooSmallUsd) {
    warnings.push({ code: "SMALL_BUDGET", message: `With less than about $${cfg.budget.tooSmallUsd} the amount is too small to diversify meaningfully.` });
  }
  const age = diffDays(todayIn("America/New_York", now), snap.asOf);
  if (age > 3) warnings.push({ code: "STALE_SNAPSHOT", message: `The underlying data is from ${snap.asOf} (${age} days old).` });
  if (rate.stale) warnings.push({ code: "FX_STALE", message: "The USD/AMD rate could not be refreshed; the last known CBA rate is used." });
  return { input, cfg, snap, weights, rate, budgetCents, ranked, warnings };
}

function noEligible(ctx: Context, reason: string, suggestion: string, extra: Record<string, unknown> = {}): never {
  throw new ApiError("NO_ELIGIBLE_STOCK", 422, "No stock fits these inputs.", undefined, { reason, suggestion, ...extra });
}

function baseFields(ctx: Context) {
  return {
    inputs: { amountAmd: ctx.input.amountAmd, risk: ctx.input.risk, horizon: ctx.input.horizon },
    usdRate: ctx.rate.rate,
    rateDate: ctx.rate.rateDate,
    rateSource: ctx.rate.source,
    budgetUsd: centsStr(ctx.budgetCents),
    scoreLabel: SCORE_LABEL,
    scoreNote: SCORE_NOTE,
    methodologyVersion: methodologyVersion(),
    dataAsOf: ctx.snap.asOf,
    snapshotDate: ctx.snap.asOf,
    weightsUsed: Object.fromEntries(FACTORS.map((f) => [f, round(ctx.weights[f], 2)])),
    disclaimers: [...BASE_DISCLAIMERS],
  };
}

function stockCard(c: Candidate, ctx: Context) {
  const r = c.rec;
  const drivers = driversFor(r, ctx.weights);
  return {
    symbol: r.symbol,
    name: r.name,
    sector: r.sector,
    price: centsStr(c.priceCents),
    composite: c.composite,
    factorScores: r.factorScores,
    contributions: contributions(r, ctx.weights),
    drivers,
    explanation: explanationText(drivers, ctx.weights, ctx.input.risk, ctx.input.horizon),
    metrics: { vol1y: round(r.vol1y ?? 0, 4), maxDD1y: round(r.maxDD1y ?? 0, 4), beta3y: r.beta3y === null ? null : round(r.beta3y, 4), marketCap: r.marketCap === null ? null : Math.round(r.marketCap), dividendYield: round(r.metrics.divYield ?? 0, 4) },
    flags: r.flags.filter((f) => f !== "dps_assumed_zero"),
  };
}

/* ================================================================== SINGLE */

export async function recommendSingle(input: RecommendationRequest, opts: { now?: Date } = {}) {
  const ctx = await buildContext(input, opts.now ?? new Date());
  const { ranked, budgetCents, cfg } = ctx;
  if (ranked.length === 0) {
    noEligible(ctx, "No stock in the current universe passes the risk rules for this risk level and horizon.", "Try a higher risk level or a longer horizon.");
  }
  const affordable = ranked.filter((c) => c.priceCents <= budgetCents);
  if (affordable.length === 0) {
    const minPrice = Math.min(...ranked.map((c) => c.priceCents));
    noEligible(
      ctx,
      `The amount is smaller than the cheapest eligible share ($${centsStr(minPrice)}).`,
      `An amount of at least about ${Math.ceil(((minPrice / 100) * Number(ctx.rate.rate)) / 1000) * 1000} AMD is needed for one share.`,
      { minPriceUsd: centsStr(minPrice) },
    );
  }
  // stability rule: keep the snapshot's stabilised leader when it is affordable and within N points of today's best
  let pick = affordable[0];
  const leader = ctx.snap.payload.stableLeaders[`${input.risk}|${input.horizon}`];
  if (leader) {
    const l = affordable.find((c) => c.rec.symbol === leader.symbol);
    if (l && affordable[0].composite - l.composite <= universeConfig().scoring.stabilityPoints) pick = l;
  }
  const runnersUp = affordable.filter((c) => c.rec.symbol !== pick.rec.symbol).slice(0, cfg.single.runnersUp);

  const shares = Math.floor(budgetCents / pick.priceCents);
  const costCents = shares * pick.priceCents;
  const allocatedAmountAmd = usdCentsToAmdFloor(costCents, ctx.rate.rate);
  const warnings = [...ctx.warnings];
  warnings.unshift({
    code: "CONCENTRATION",
    message: `A single stock is undiversified. In the last year this stock fell as much as ${pct1(-(pick.rec.maxDD1y ?? 0))} from a peak and its volatility was ${pct1(pick.rec.vol1y ?? 0)}.`,
  });
  for (const f of pick.rec.flags.filter((x) => x.startsWith("factor_dropped:"))) {
    warnings.push({ code: "FACTOR_DROPPED", message: `Some inputs were unavailable for ${pick.rec.symbol} (${FACTOR_LABELS[f.split(":")[1] as keyof typeof FACTOR_LABELS]}); the score uses the remaining factors.` });
  }
  const card = stockCard(pick, ctx);
  return {
    mode: "single" as const,
    ...baseFields(ctx),
    pick: { ...card, shares, cost: centsStr(costCents), leftoverCash: centsStr(ctx.budgetCents - costCents) },
    runnersUp: runnersUp.map((c) => ({ ...stockCard(c, ctx), shares: Math.floor(budgetCents / c.priceCents), cost: centsStr(Math.floor(budgetCents / c.priceCents) * c.priceCents) })),
    score: Math.round(pick.composite),
    allocatedAmountUsd: centsStr(costCents),
    allocatedAmountAmd,
    unallocatedCashUsd: centsStr(ctx.budgetCents - costCents),
    unallocatedCashAmd: input.amountAmd - allocatedAmountAmd,
    warnings,
  };
}

const pct1 = (x: number) => `${(x * 100).toFixed(1)}%`;

/* ================================================================== PORTFOLIO */

function holdingsForBudget(budgetUsd: number, cfg: InvestConfig): number {
  const row = cfg.budget.holdingsByBudget.find((r) => r.maxUsd === null || budgetUsd <= r.maxUsd)!;
  const byMin = Math.max(1, Math.floor(budgetUsd / cfg.budget.minPositionUsd));
  return Math.max(1, Math.min(row.n, byMin, cfg.budget.maxHoldings));
}

/** last `n` aligned daily returns of the given symbols (common dates only) */
function alignedReturns(symbols: string[], bars: Map<string, Bar[]>, n: number): number[][] | null {
  const maps = symbols.map((s) => new Map((bars.get(s) ?? []).map((b) => [b.date, b.adjClose])));
  if (maps.some((m) => m.size < 30)) return null;
  const dates = [...maps[0].keys()].filter((d) => maps.every((m) => m.has(d))).sort().slice(-(n + 1));
  if (dates.length < 60) return null;
  return maps.map((m) => dailyReturns(dates.map((d) => m.get(d)!)));
}

function avgCorrelation(cand: string, selected: string[], bars: Map<string, Bar[]>, n: number): number | null {
  const vals: number[] = [];
  for (const s of selected) {
    const r = alignedReturns([cand, s], bars, n);
    if (r) vals.push(correlation(r[0], r[1]));
  }
  return vals.length ? mean(vals) : null;
}

function estimateVolatility(symbols: string[], weights: number[], bars: Map<string, Bar[]>, T: number): number | null {
  const rets = alignedReturns(symbols, bars, T);
  if (!rets) return null;
  let v = 0;
  for (let i = 0; i < rets.length; i++) for (let j = 0; j < rets.length; j++) v += weights[i] * weights[j] * covariance(rets[i], rets[j]) * T;
  return Math.sqrt(v);
}

interface Selection {
  chosen: Candidate[];
  skippedForPrice: number;
  relaxed: string[];
}

function selectHoldings(ctx: Context, n: number, bars: Map<string, Bar[]>, exclude: Set<string>): Selection {
  const { cfg } = ctx;
  const T = cfg.benchmark.tradingDaysPerYear;
  const targetAlloc = ctx.budgetCents / n;
  const relaxed: string[] = [];
  const passes = [
    { corr: true, sector: cfg.portfolio.maxPerSector, name: null as string | null },
    { corr: false, sector: cfg.portfolio.maxPerSector, name: "correlation filter" },
    { corr: false, sector: cfg.portfolio.maxPerSector + 1, name: "sector cap" },
  ];
  let best: Selection = { chosen: [], skippedForPrice: 0, relaxed: [] };
  for (const p of passes) {
    if (p.name) relaxed.push(p.name);
    const chosen: Candidate[] = [];
    const sectorCount = new Map<string, number>();
    let skippedForPrice = 0;
    for (const c of ctx.ranked) {
      if (chosen.length >= n) break;
      if (exclude.has(c.rec.symbol)) continue;
      if (c.priceCents > targetAlloc) {
        skippedForPrice++;
        continue;
      }
      const sec = c.rec.sector ?? "?";
      if ((sectorCount.get(sec) ?? 0) >= p.sector) continue;
      if (p.corr && chosen.length) {
        const ac = avgCorrelation(c.rec.symbol, chosen.map((x) => x.rec.symbol), bars, T);
        if (ac !== null && ac > cfg.portfolio.correlationMax) continue;
      }
      chosen.push(c);
      sectorCount.set(sec, (sectorCount.get(sec) ?? 0) + 1);
    }
    if (chosen.length > best.chosen.length) best = { chosen, skippedForPrice, relaxed: [...relaxed] };
    if (chosen.length >= n) break;
  }
  return best;
}

export async function recommendPortfolio(input: RecommendationRequest, opts: { now?: Date } = {}) {
  const now = opts.now ?? new Date();
  const ctx = await buildContext(input, now);
  const { cfg, ranked, budgetCents } = ctx;
  const budgetUsd = budgetCents / 100;
  if (ranked.length === 0) {
    noEligible(ctx, "No stock in the current universe passes the risk rules for this risk level and horizon.", "Try a higher risk level or a longer horizon.");
  }
  if (!ranked.some((c) => c.priceCents <= budgetCents)) {
    const minPrice = Math.min(...ranked.map((c) => c.priceCents));
    noEligible(ctx, `The amount is smaller than the cheapest eligible share ($${centsStr(minPrice)}).`, `An amount of at least about ${Math.ceil(((minPrice / 100) * Number(ctx.rate.rate)) / 1000) * 1000} AMD is needed for one share.`, {
      minPriceUsd: centsStr(minPrice),
    });
  }
  const targetN = holdingsForBudget(budgetUsd, cfg);
  const T = cfg.benchmark.tradingDaysPerYear;

  // price history for the top candidates (correlation filter + volatility estimate)
  const top = ranked.slice(0, 90).map((c) => c.rec.symbol);
  const from = addDays(todayIn("America/New_York", now), -Math.round(cfg.portfolio.correlationYears * 366 + 40));
  const bars = await readPriceSeries(top, from);

  const bandCap = cfg.portfolio.maxVolByRisk[input.risk];
  const posCap = cfg.portfolio.maxWeightByRisk[input.risk];
  const exclude = new Set<string>();
  let final: {
    chosen: Candidate[];
    weights: number[];
    alloc: ReturnType<typeof allocateWholeShares>;
    capRelaxed: boolean;
    relaxed: string[];
    skippedForPrice: number;
    estVol: number | null;
  } | null = null;
  let volRepairs = 0;
  let zeroShareDrops = 0;
  for (let attempt = 0; attempt < 14; attempt++) {
    const sel = selectHoldings(ctx, targetN, bars, exclude);
    if (sel.chosen.length === 0) break;
    const w = inverseVolScoreWeights(sel.chosen.map((c) => ({ composite: c.composite, vol: c.rec.vol1y ?? 0.3 })), posCap, cfg.portfolio.minWeight);
    const weights = roundWeights(w.weights, 4);
    const alloc = allocateWholeShares(budgetCents, sel.chosen.map((c, i) => ({ symbol: c.rec.symbol, priceCents: c.priceCents, weight: weights[i] })));
    // every holding needs at least one whole share: otherwise drop it and take the next-ranked feasible stock
    const zero = alloc.holdings.findIndex((h) => h.shares < 1);
    if (zero >= 0 && zeroShareDrops < 8) {
      exclude.add(sel.chosen[zero].rec.symbol);
      zeroShareDrops++;
      continue;
    }
    const held = alloc.holdings.filter((h) => h.shares >= 1);
    const keep = sel.chosen.filter((_, i) => alloc.holdings[i].shares >= 1);
    const vol = estimateVolatility(keep.map((c) => c.rec.symbol), held.map((h) => h.actualWeight), bars, T);
    final = { chosen: keep, weights: weights.filter((_, i) => alloc.holdings[i].shares >= 1), alloc: { ...alloc, holdings: held }, capRelaxed: w.capRelaxed, relaxed: sel.relaxed, skippedForPrice: sel.skippedForPrice, estVol: vol };
    if (vol !== null && vol > bandCap && volRepairs < cfg.portfolio.volRepairIterations && keep.length > 1) {
      // replace the highest-volatility holding with the next candidate and try again
      const worst = keep.reduce((a, b) => ((b.rec.vol1y ?? 0) > (a.rec.vol1y ?? 0) ? b : a));
      exclude.add(worst.rec.symbol);
      volRepairs++;
      continue;
    }
    break;
  }
  if (!final || final.chosen.length === 0) {
    noEligible(ctx, "No combination of eligible stocks fits this amount as whole shares.", "Try a larger amount.");
  }

  const f = final;
  const invested = f.alloc.investedCents;
  const warnings = [...ctx.warnings];
  const rateStr = ctx.rate.rate;
  const holdings = f.chosen.map((c, i) => {
    const h = f.alloc.holdings[i];
    const card = stockCard(c, ctx);
    const allocatedAmountAmd = usdCentsToAmdFloor(h.costCents, rateStr);
    return {
      ...card,
      shares: h.shares,
      cost: centsStr(h.costCents),
      targetWeight: h.targetWeight,
      actualWeight: round(h.actualWeight, 4),
      allocationPercent: round(h.actualWeight * 100, 1),
      allocatedAmountUsd: centsStr(h.costCents),
      allocatedAmountAmd,
    };
  });
  const sumAmd = holdings.reduce((s, h) => s + h.allocatedAmountAmd, 0);
  const unallocatedCashAmd = input.amountAmd - sumAmd;

  const w = f.alloc.holdings.map((h) => h.actualWeight);
  const sectorSplit = new Map<string, number>();
  f.chosen.forEach((c, i) => sectorSplit.set(c.rec.sector ?? "Unknown", (sectorSplit.get(c.rec.sector ?? "Unknown") ?? 0) + w[i]));
  const metrics = {
    holdingsCount: holdings.length,
    targetHoldings: targetN,
    weightedBeta: round(f.chosen.reduce((s, c, i) => s + w[i] * (c.rec.beta3y ?? 1), 0), 3),
    estimatedVolatility: f.estVol === null ? null : round(f.estVol, 4),
    volatilityBand: bandCap,
    sectorSplit: [...sectorSplit.entries()].map(([sector, weight]) => ({ sector, weight: round(weight, 4) })).sort((a, b) => b.weight - a.weight),
    weightedDividendYield: round(f.chosen.reduce((s, c, i) => s + w[i] * (c.rec.metrics.divYield ?? 0), 0), 4),
    effectiveN: round(1 / w.reduce((s, x) => s + x * x, 0), 2),
    topHoldingWeight: round(Math.max(...w), 4),
  };

  if (holdings.length < targetN) {
    warnings.push({ code: "FEWER_HOLDINGS_THAN_TARGET", message: `Only ${holdings.length} holdings were possible for this amount (target ${targetN}); the portfolio is less diversified than intended.` });
  }
  if (f.skippedForPrice > 0) {
    warnings.push({
      code: "WHOLE_SHARES_BIAS",
      message: `Because only whole shares are allocated, ${f.skippedForPrice} higher-priced candidates were skipped for this amount; small amounts favour lower-priced shares.`,
    });
  }
  if (f.capRelaxed) {
    warnings.push({ code: "POSITION_CAP_NOT_ENFORCEABLE", message: `With ${holdings.length} holdings a ${Math.round(posCap * 100)}% per-position cap cannot hold, so weights are close to equal.` });
  }
  if (f.relaxed.length) warnings.push({ code: "CONSTRAINT_RELAXED", message: `To reach ${targetN} holdings, the ${f.relaxed.join(" and ")} had to be relaxed.` });
  if (metrics.estimatedVolatility !== null && metrics.estimatedVolatility > bandCap) {
    warnings.push({ code: "VOLATILITY_ABOVE_BAND", message: `Estimated portfolio volatility (${pct1(metrics.estimatedVolatility)}) is above the ${pct1(bandCap)} guide for ${cap(input.risk)} risk.` });
  }

  const score = Math.round(f.chosen.reduce((s, c, i) => s + w[i] * c.composite, 0));
  const result = {
    mode: "portfolio" as const,
    ...baseFields(ctx),
    holdings,
    allocatedAmountUsd: centsStr(invested),
    allocatedAmountAmd: sumAmd,
    unallocatedCashUsd: centsStr(f.alloc.cashCents),
    unallocatedCashAmd,
    cash: centsStr(f.alloc.cashCents),
    metrics,
    why: {
      holdingsCount: `${holdings.length} holdings for a budget of about $${Math.round(budgetUsd).toLocaleString("en-US")} (methodology rule: ${targetN} holdings at this size, at least $${cfg.budget.minPositionUsd} per position).`,
      weighting: `Weights are proportional to each stock's match score divided by its 1-year volatility, limited to ${Math.round(posCap * 100)}% per position and at least ${Math.round(cfg.portfolio.minWeight * 100)}%, then rounded to whole shares (target and actual percentages are both shown).`,
      diversification: `At most ${cfg.portfolio.maxPerSector} holdings per sector and no pair of holdings with average return correlation above ${cfg.portfolio.correlationMax} where alternatives existed.`,
    },
    score,
    warnings,
    benchmark: null as Awaited<ReturnType<typeof portfolioBenchmark>> | null,
  };
  result.benchmark = await portfolioBenchmark(ctx, f.chosen.map((c, i) => ({ symbol: c.rec.symbol, shares: f.alloc.holdings[i].shares, sector: c.rec.sector })), bars, now);
  if (!result.benchmark) {
    result.warnings.push({ code: "BENCHMARK_UNAVAILABLE", message: "The benchmark comparison could not be computed from stored prices." });
  }
  return result;
}

/** default 1Y benchmark block embedded in the portfolio result (the comparison route serves other windows) */
async function portfolioBenchmark(ctx: Context, holdings: { symbol: string; shares: number; sector: string | null }[], bars: Map<string, Bar[]>, now: Date) {
  try {
    const cfg = ctx.cfg;
    const win = cfg.benchmark.defaultWindow;
    const months = cfg.benchmark.windows[win];
    const from = addDays(todayIn("America/New_York", now), -Math.round((Math.max(months, 14) + 1) * 31));
    const series = await readPriceSeries([...holdings.map((h) => h.symbol), cfg.benchmark.symbol, "^IRX"], from);
    const bench = series.get(cfg.benchmark.symbol) ?? [];
    if (bench.length < 30) return null;
    const cmp = computeComparison({
      window: win,
      months,
      holdings,
      bars: series,
      bench,
      rfYields: (series.get("^IRX") ?? []).map((b) => ({ date: b.date, value: b.close })),
      tradingDays: cfg.benchmark.tradingDaysPerYear,
    });
    const lastPx = (s: Bar[]) => s.filter((b) => b.date <= cmp.end).at(-1)!.adjClose;
    const vals = holdings.map((h) => h.shares * lastPx(series.get(h.symbol)!));
    const tot = vals.reduce((a, b) => a + b, 0);
    const diversification = computeDiversification({
      weights: holdings.map((h, i) => ({ symbol: h.symbol, weight: vals[i] / tot, sector: h.sector })),
      bars: series,
      benchSectorWeights: universeSectorWeights(ctx.snap.payload.records),
      universeSize: ctx.snap.payload.coverage.issuers,
      tradingDays: cfg.benchmark.tradingDaysPerYear,
    });
    return {
      window: win,
      benchmark: { symbol: cfg.benchmark.symbol, label: cfg.benchmark.label, note: "Reference only - not a recommendation." },
      start: cmp.start,
      end: cmp.end,
      truncated: cmp.truncated,
      series: cmp.series,
      metrics: cmp.metrics,
      diversification,
      disclaimers: [...DISCLAIMERS],
    };
  } catch {
    return null;
  }
}

export async function recommend(input: RecommendationRequest, opts: { now?: Date } = {}) {
  return input.mode === "single" ? recommendSingle(input, opts) : recommendPortfolio(input, opts);
}

export { stdev };
