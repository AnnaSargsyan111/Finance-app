import { compositeScore, weightsFor } from "@/lib/quant/composite";
import { universeConfig } from "@/lib/quant/config";
import { evaluateRiskEligibility } from "@/lib/quant/eligibility";
import type { Horizon, Risk } from "@/lib/quant/types";
import { readLatestSnapshot } from "@/market/read";
import { driverByLabel } from "./explain";

/**
 * How the given stocks look in the LATEST data snapshot, scored for one risk level and horizon: the same numbers the recommendation
 * showed (price, match score, volatility, drawdown, the "why this match" inputs), without ranking anything or choosing anything new.
 * Read-only: it is what lets a saved recommendation be compared with today (src/watch). A stock missing from the snapshot is absent from the map.
 */
export interface CurrentStock {
  symbol: string;
  name: string;
  price: number | null;
  priceAsOf: string | null;
  /** the match score (0-100, 2 dp) or null when it cannot be computed */
  score: number | null;
  /** does the stock still pass the filters of the chosen risk level and horizon? */
  eligible: boolean;
  vol1y: number | null;
  maxDD1y: number | null;
  /** by display label: the value text, the raw value and the "top X%" rank; null when the stock no longer has that input */
  drivers: Record<string, { value: string; rawValue: number; topPercent: number } | null>;
}

export async function currentStocks(opts: { risk: Risk; horizon: Horizon; symbols: string[]; driverLabels: Record<string, string[]> }): Promise<{ asOf: string; stocks: Map<string, CurrentStock> } | null> {
  const snap = await readLatestSnapshot();
  if (!snap) return null;
  const weights = weightsFor(opts.risk, opts.horizon);
  const ucfg = universeConfig();
  const wanted = new Set(opts.symbols);
  const stocks = new Map<string, CurrentStock>();
  for (const rec of snap.payload.records) {
    if (!wanted.has(rec.symbol)) continue;
    stocks.set(rec.symbol, {
      symbol: rec.symbol,
      name: rec.name,
      price: rec.price,
      priceAsOf: rec.priceAsOf,
      score: compositeScore(rec, weights),
      eligible: evaluateRiskEligibility(rec, opts.risk, opts.horizon, ucfg).ok,
      vol1y: rec.vol1y,
      maxDD1y: rec.maxDD1y,
      drivers: Object.fromEntries((opts.driverLabels[rec.symbol] ?? []).map((label) => [label, driverByLabel(rec, label)])),
    });
  }
  return { asOf: snap.asOf, stocks };
}
