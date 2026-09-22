import { universeConfig, type UniverseConfig } from "./config";
import { FACTORS, type FactorName, type Horizon, type Risk, type SnapshotRecord } from "./types";
import { round } from "./stats";

export type Weights = Record<FactorName, number>;

/**
 * risk x horizon weights (handover 7.4): base weights by risk, horizon adjustment in points, clamp at 0, renormalise to 100.
 * Everything comes from methodology.v1.json.
 */
export function weightsFor(risk: Risk, horizon: Horizon, cfg: UniverseConfig = universeConfig()): Weights {
  const base = cfg.scoring.weights[risk];
  const adj = cfg.scoring.horizonAdjust[horizon] as Partial<Record<FactorName, number>>;
  const raw = {} as Weights;
  let sum = 0;
  for (const f of FACTORS) {
    raw[f] = Math.max(0, base[f] + (adj[f] ?? 0));
    sum += raw[f];
  }
  const out = {} as Weights;
  for (const f of FACTORS) out[f] = (raw[f] / sum) * 100;
  return out;
}

/** composite = sum(weight_f * score_f) over the factors the stock HAS, weights renormalised (0-100, 2 dp); null if none. */
export function compositeScore(r: SnapshotRecord, w: Weights): number | null {
  let num = 0;
  let den = 0;
  for (const f of FACTORS) {
    const s = r.factorScores[f];
    if (s === null || s === undefined) continue;
    num += w[f] * s;
    den += w[f];
  }
  return den > 0 ? round(num / den, 2) : null;
}

/** per-factor contribution (points of the composite) for explanations */
export function contributions(r: SnapshotRecord, w: Weights): { factor: FactorName; weight: number; score: number; points: number }[] {
  let den = 0;
  for (const f of FACTORS) if (r.factorScores[f] !== null && r.factorScores[f] !== undefined) den += w[f];
  const out: { factor: FactorName; weight: number; score: number; points: number }[] = [];
  for (const f of FACTORS) {
    const s = r.factorScores[f];
    if (s === null || s === undefined || den === 0) continue;
    out.push({ factor: f, weight: round((w[f] / den) * 100, 2), score: s, points: round((w[f] * s) / den, 2) });
  }
  return out;
}
