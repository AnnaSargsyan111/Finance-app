import { universeConfig, type UniverseConfig } from "./config";
import { FACTORS, type FactorInput, type FactorName, type SnapshotRecord } from "./types";
import { mean, percentileRanks, round, winsorize } from "./stats";

/**
 * Factor scores (handover 7.4): each factor = average of the percentile ranks (0-100, higher = better) of its inputs,
 * ranked within the hard-eligible pool; Value inputs are ranked WITHIN SECTOR (when the sector has enough members);
 * inputs are winsorised at the configured quantiles before ranking; a factor with no valid input is dropped
 * (score null, flag `factor_dropped:<name>`) and the composite renormalises its weights.
 *
 * Interpretation note: "the eligible set" = the hard-eligible universe (same for every risk level), so factor scores
 * are computed once per snapshot; per-risk caps then only filter picks.
 */
function inputValue(r: SnapshotRecord, name: string, cfg: UniverseConfig): number | null {
  const m = r.metrics;
  switch (name) {
    case "roe": return m.roe;
    case "opMargin": return m.opMargin;
    case "netMargin": return m.netMargin;
    case "fcfMargin": return m.fcfMargin;
    case "debtToEquity": return m.debtToEquity;
    case "earningsStability": return m.earningsStability;
    case "pe": return m.pe;
    case "ps": return m.ps;
    case "pb": return m.pb;
    case "fcfYield": return m.fcfYield;
    case "revGrowth": return m.revGrowth;
    case "rev3yCAGR": return m.rev3yCAGR;
    case "epsGrowth": return m.epsGrowth;
    case "mom12_1": return r.mom12_1;
    case "mom6": return r.mom6;
    case "above200dma": return r.above200dma;
    case "vol1y": return r.vol1y;
    case "beta3y": return r.beta3y;
    case "maxDDAbs": return r.maxDD1y === null ? null : Math.abs(r.maxDD1y);
    case "divYield": return m.divYield;
    case "payoutOk": return m.payout !== null && (r.dps ?? 0) > 0 && m.payout <= cfg.scoring.payoutMax ? 1 : 0;
    case "paysDividend": return (r.dps ?? 0) > 0 ? 1 : 0;
    default: return null;
  }
}

export function scoreFactors(records: SnapshotRecord[], cfg: UniverseConfig = universeConfig()): void {
  const pool = records.filter((r) => r.hardEligible);
  for (const r of records) {
    r.factorInputs = {};
    r.factorScores = { quality: null, value: null, growth: null, momentum: null, lowRisk: null, income: null };
  }
  const [lo, hi] = cfg.scoring.winsorize;
  const perRecord = new Map<SnapshotRecord, Partial<Record<FactorName, number[]>>>();
  for (const r of pool) perRecord.set(r, {});

  for (const factor of FACTORS) {
    for (const def of cfg.factors[factor]) {
      const applicable = pool.filter((r) => (def.skipFinancial ? !r.isFinancial : true) && (def.onlyFinancial ? r.isFinancial : true));
      if (def.dir === "binary") {
        for (const r of applicable) {
          const v = inputValue(r, def.name, cfg)!;
          const pct = v ? 100 : 0;
          r.factorInputs[def.name] = { factor, value: v, pct } satisfies FactorInput;
          (perRecord.get(r)![factor] ??= []).push(pct);
        }
        continue;
      }
      const withValue = applicable.map((r) => ({ r, v: inputValue(r, def.name, cfg) })).filter((x): x is { r: SnapshotRecord; v: number } => x.v !== null && Number.isFinite(x.v));
      if (withValue.length === 0) continue;
      // ranking groups: per sector (Value inputs) when the sector is large enough, else the whole pool
      const groups = new Map<string, typeof withValue>();
      if (def.sectorRelative) {
        const bySector = new Map<string, typeof withValue>();
        for (const x of withValue) (bySector.get(x.r.sector ?? "?") ?? bySector.set(x.r.sector ?? "?", []).get(x.r.sector ?? "?")!).push(x);
        for (const [sector, list] of bySector) {
          if (list.length >= cfg.scoring.sectorMinGroupSize) groups.set(`sector:${sector}`, list);
          else (groups.get("all") ?? groups.set("all", []).get("all")!).push(...list);
        }
      } else {
        groups.set("all", withValue);
      }
      for (const list of groups.values()) {
        const wins = winsorize(list.map((x) => x.v), lo, hi);
        const pcts = percentileRanks(wins);
        list.forEach((x, i) => {
          const pct = round(def.dir === "low" ? 100 - pcts[i] : pcts[i], 2);
          x.r.factorInputs[def.name] = { factor, value: x.v, pct };
          (perRecord.get(x.r)![factor] ??= []).push(pct);
        });
      }
    }
  }
  for (const r of pool) {
    const acc = perRecord.get(r)!;
    for (const f of FACTORS) {
      const list = acc[f];
      if (list && list.length) r.factorScores[f] = round(mean(list), 2);
      else r.flags.push(`factor_dropped:${f}`);
    }
  }
}
