/**
 * Whole-share allocation, exactly the algorithm of handover 7.6 (integer cents, no float money):
 *
 *   B = budget;  target_i = w_i * B;  shares_i = floor(target_i / price_i)
 *   cash = B - sum(shares_i * price_i)
 *   while some holding has price_i <= cash:                       # spend leftover
 *       choose i (among the affordable ones) with the largest (w_i - actualWeight_i);  shares_i += 1;  cash -= price_i
 *   actualWeight_i = shares_i * price_i / (B - cash)
 *
 * The caller enforces "shares_i >= 1 for all i" (drop the holding / take the next-ranked feasible stock and re-run).
 * Ties are broken by input order (= rank order), so the result is deterministic.
 */
export interface AllocItem {
  symbol: string;
  priceCents: number;
  /** target weight (fractions summing to 1) */
  weight: number;
}

export interface AllocHolding {
  symbol: string;
  priceCents: number;
  shares: number;
  costCents: number;
  targetWeight: number;
  actualWeight: number;
}

export interface AllocResult {
  holdings: AllocHolding[];
  cashCents: number;
  investedCents: number;
}

export function allocateWholeShares(budgetCents: number, items: AllocItem[]): AllocResult {
  const shares = items.map((it) => Math.floor((it.weight * budgetCents) / it.priceCents + 1e-9));
  let cash = budgetCents - shares.reduce((s, n, i) => s + n * items[i].priceCents, 0);
  // greedy top-up
  for (;;) {
    const invested = budgetCents - cash;
    let best = -1;
    let bestDeficit = -Infinity;
    for (let i = 0; i < items.length; i++) {
      if (items[i].priceCents > cash) continue;
      const actual = invested > 0 ? (shares[i] * items[i].priceCents) / invested : 0;
      const deficit = items[i].weight - actual;
      if (deficit > bestDeficit + 1e-12) {
        bestDeficit = deficit;
        best = i;
      }
    }
    if (best < 0) break;
    shares[best]++;
    cash -= items[best].priceCents;
  }
  const invested = budgetCents - cash;
  const holdings = items.map((it, i) => ({
    symbol: it.symbol,
    priceCents: it.priceCents,
    shares: shares[i],
    costCents: shares[i] * it.priceCents,
    targetWeight: it.weight,
    actualWeight: invested > 0 ? (shares[i] * it.priceCents) / invested : 0,
  }));
  return { holdings, cashCents: cash, investedCents: invested };
}

/**
 * Weights = composite_i / vol_i normalised, then water-filled between the per-position cap and minimum weight
 * (violators are fixed at their bound and the rest are re-normalised, repeated until nothing violates).
 * If n * cap < 1 the cap is infeasible: it is relaxed to 1/n (equal weight) and `capRelaxed` is reported.
 */
export function inverseVolScoreWeights(
  items: { composite: number; vol: number }[],
  cap: number,
  minWeight: number,
): { weights: number[]; capRelaxed: boolean; effectiveCap: number } {
  const n = items.length;
  if (n === 0) return { weights: [], capRelaxed: false, effectiveCap: cap };
  const raw = items.map((it) => Math.max(1e-9, it.composite) / Math.max(1e-6, it.vol));
  const effCap = n * cap < 1 ? 1 / n : cap;
  const effMin = Math.min(minWeight, 0.9 / n);
  const fixed = new Map<number, number>();
  for (let guard = 0; guard < 4 * n + 4; guard++) {
    const fixedSum = [...fixed.values()].reduce((a, b) => a + b, 0);
    const freeIdx = raw.map((_, i) => i).filter((i) => !fixed.has(i));
    const remaining = 1 - fixedSum;
    const freeRaw = freeIdx.reduce((s, i) => s + raw[i], 0);
    if (freeIdx.length === 0) break;
    const w = new Map<number, number>();
    for (const i of freeIdx) w.set(i, (raw[i] / freeRaw) * remaining);
    const over = freeIdx.filter((i) => w.get(i)! > effCap + 1e-12);
    if (over.length) {
      for (const i of over) fixed.set(i, effCap);
      continue;
    }
    const under = freeIdx.filter((i) => w.get(i)! < effMin - 1e-12);
    if (under.length) {
      for (const i of under) fixed.set(i, effMin);
      continue;
    }
    for (const i of freeIdx) fixed.set(i, w.get(i)!);
    break;
  }
  let weights = raw.map((_, i) => fixed.get(i) ?? 0);
  const sum = weights.reduce((a, b) => a + b, 0);
  weights = weights.map((x) => x / sum);
  return { weights, capRelaxed: n * cap < 1, effectiveCap: effCap };
}

/**
 * Holdings whose ACTUAL weight (after whole-share rounding) ended above the per-position cap. The TARGET weights always
 * respect the cap; rounding to whole shares (and spending the leftover cash) can push a holding past it (QA-001), so the
 * caller discloses it instead of leaving the mismatch silent.
 */
export function holdingsOverCap(holdings: { symbol: string; actualWeight: number }[], cap: number, epsilon = 1e-9): { symbol: string; actualWeight: number }[] {
  return holdings.filter((h) => h.actualWeight > cap + epsilon);
}

/** round fractions to `dp` decimals so that they sum to exactly 1 (largest remainder on 10^dp units) */
export function roundWeights(weights: number[], dp = 4): number[] {
  const unit = 10 ** dp;
  const scaled = weights.map((w) => w * unit);
  const floors = scaled.map(Math.floor);
  let left = unit - floors.reduce((a, b) => a + b, 0);
  const order = scaled.map((s, i) => ({ i, rem: s - Math.floor(s) })).sort((a, b) => (b.rem !== a.rem ? b.rem - a.rem : a.i - b.i));
  for (const o of order) {
    if (left <= 0) break;
    floors[o.i]++;
    left--;
  }
  return floors.map((f) => f / unit);
}
