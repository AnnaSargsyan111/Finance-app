import { universeConfig, type UniverseConfig } from "./config";
import { computePriceMetrics, deriveMetrics, type Bar, type RawFundamentals } from "./derive";
import { evaluateHardEligibility, evaluateRiskEligibility } from "./eligibility";
import { compositeScore, weightsFor } from "./composite";
import { scoreFactors } from "./factors";
import type { Horizon, Risk, SnapshotRecord, StableLeader } from "./types";

export interface RecordInput {
  symbol: string;
  cik: string | null;
  name: string;
  sector: string | null;
  industry: string | null;
  fundamentals: RawFundamentals & { fiscalYear: number | null; fiscalPeriodEnd: string | null; grossProfit: number | null; assets: number | null };
  bars: Bar[] | null;
  bench: Bar[] | null;
}

function metricValue(r: SnapshotRecord, name: string): number | null {
  switch (name) {
    case "marketCap": return r.marketCap;
    case "mom12_1": return r.mom12_1;
    case "mom6": return r.mom6;
    case "above200dma": return r.above200dma;
    case "vol1y": return r.vol1y;
    case "beta3y": return r.beta3y;
    case "maxDD1y": return r.maxDD1y;
    default: return (r.metrics as unknown as Record<string, number | null>)[name] ?? null;
  }
}

export function buildRecord(input: RecordInput, cfg: UniverseConfig = universeConfig()): SnapshotRecord {
  const f = input.fundamentals;
  const ph = cfg.priceHistory;
  const pm = input.bars && input.bars.length
    ? computePriceMetrics(input.bars, input.bench, { tradingDays: ph.tradingDaysPerYear, betaMinObservations: ph.betaMinObservations, betaYears: ph.betaYears })
    : null;
  const price = pm?.lastClose ?? null;
  const marketCap = price !== null && f.sharesOut !== null && f.sharesOut > 0 ? price * f.sharesOut : null;
  const isFinancial = input.sector !== null && cfg.financialSectors.includes(input.sector);
  const metrics = deriveMetrics({ ...f, price }, marketCap);
  const flags: string[] = [];
  if (f.dps === null) flags.push("dps_assumed_zero");
  if (!pm) flags.push("no_prices");
  if (pm && pm.maxAbsJump > ph.maxAdjustedJump) flags.push("price_jump");
  const rec: SnapshotRecord = {
    symbol: input.symbol,
    cik: input.cik,
    name: input.name,
    sector: input.sector,
    industry: input.industry,
    isFinancial,
    price,
    priceAsOf: pm?.lastDate ?? null,
    sharesOut: f.sharesOut,
    marketCap,
    fiscalYear: f.fiscalYear,
    fiscalPeriodEnd: f.fiscalPeriodEnd,
    revenue: f.revenue,
    revenuePrev: f.revenuePrev,
    revenue3yAgo: f.revenue3yAgo,
    netIncome: f.netIncome,
    netIncomePrev: f.netIncomePrev,
    netIncome2yAgo: f.netIncome2yAgo,
    eps: f.eps,
    epsPrev: f.epsPrev,
    grossProfit: f.grossProfit,
    opIncome: f.opIncome,
    equity: f.equity,
    assets: f.assets,
    liabilities: f.liabilities,
    opCashFlow: f.opCashFlow,
    capex: f.capex,
    dps: f.dps,
    vol1y: pm?.vol1y ?? null,
    beta3y: pm?.beta3y ?? null,
    maxDD1y: pm?.maxDD1y ?? null,
    mom12_1: pm?.mom12_1 ?? null,
    mom6: pm?.mom6 ?? null,
    above200dma: pm?.above200dma ?? null,
    historyDays: pm?.historyDays ?? 0,
    historyStart: pm?.historyStart ?? null,
    metrics,
    factorScores: { quality: null, value: null, growth: null, momentum: null, lowRisk: null, income: null },
    factorInputs: {},
    dataCompleteness: 0,
    flags,
    eligibleByRisk: { low: false, medium: false, high: false },
    hardEligible: false,
    exclusionReasons: [],
    status: "incomplete",
  };
  const applicable = isFinancial ? cfg.applicableMetrics.financial : cfg.applicableMetrics.default;
  const have = applicable.filter((m) => {
    const v = metricValue(rec, m);
    return v !== null && Number.isFinite(v);
  }).length;
  rec.dataCompleteness = Math.round((have / applicable.length) * 1000) / 1000;
  const why = evaluateHardEligibility(rec, cfg);
  rec.exclusionReasons = why;
  rec.hardEligible = why.length === 0;
  rec.status = rec.hardEligible ? "ok" : why.some((w) => /jump|not positive/.test(w)) ? "excluded" : "incomplete";
  return rec;
}

/** Scores factors over the whole set and fills eligibleByRisk (standard horizon). Mutates and returns the records. */
export function finaliseRecords(records: SnapshotRecord[], cfg: UniverseConfig = universeConfig()): SnapshotRecord[] {
  scoreFactors(records, cfg);
  for (const r of records) {
    for (const risk of ["low", "medium", "high"] as Risk[]) {
      r.eligibleByRisk[risk] = r.hardEligible && evaluateRiskEligibility(r, risk, "medium", cfg).ok;
    }
  }
  return records;
}

/**
 * Stability rule (handover 7.5): per (risk, horizon) the leader is yesterday's leader if it is still eligible and within
 * `stabilityPoints` of today's top composite; otherwise today's top composite. Deterministic (ties by symbol).
 */
export function computeStableLeaders(
  records: SnapshotRecord[],
  previous: Record<string, StableLeader> | null,
  cfg: UniverseConfig = universeConfig(),
): Record<string, StableLeader> {
  const out: Record<string, StableLeader> = {};
  for (const risk of ["low", "medium", "high"] as Risk[]) {
    for (const horizon of ["short", "medium", "long"] as Horizon[]) {
      const w = weightsFor(risk, horizon, cfg);
      const ranked = records
        .filter((r) => evaluateRiskEligibility(r, risk, horizon, cfg).ok)
        .map((r) => ({ symbol: r.symbol, composite: compositeScore(r, w) ?? -1 }))
        .filter((x) => x.composite >= 0)
        .sort((a, b) => (b.composite !== a.composite ? b.composite - a.composite : a.symbol < b.symbol ? -1 : 1));
      if (!ranked.length) continue;
      const key = `${risk}|${horizon}`;
      const prev = previous?.[key];
      const prevNow = prev ? ranked.find((x) => x.symbol === prev.symbol) : undefined;
      out[key] = prevNow && ranked[0].composite - prevNow.composite <= cfg.scoring.stabilityPoints ? prevNow : ranked[0];
    }
  }
  return out;
}
