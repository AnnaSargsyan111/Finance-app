import { universeConfig, type UniverseConfig } from "./config";
import type { Horizon, Risk, SnapshotRecord } from "./types";

/**
 * Hard eligibility (all risk levels, handover 7.2) - applied by the batch; failures are EXCLUDED, never imputed.
 */
export function evaluateHardEligibility(r: SnapshotRecord, cfg: UniverseConfig = universeConfig()): string[] {
  const why: string[] = [];
  const ph = cfg.priceHistory;
  if (r.price === null || r.price <= 0) why.push("no price");
  if (r.historyDays < ph.minHistoryYears * 365 - ph.historyToleranceDays) why.push(`price history shorter than ${ph.minHistoryYears} years`);
  if (r.vol1y === null) why.push("not enough recent prices for volatility");
  if (r.flags.includes("price_jump")) why.push("adjusted price series has a single-day jump beyond the data-error threshold");
  if (r.marketCap === null) why.push("market cap unavailable (shares or price missing)");
  if (r.isFinancial) {
    if (r.netIncome === null || r.netIncome <= 0) why.push("net income not positive/available (financials)");
  } else if (r.revenue === null || r.revenue <= 0) {
    why.push("latest-year revenue not positive/available");
  }
  if (r.dataCompleteness < cfg.eligibility.minCompleteness) {
    why.push(`data completeness ${(r.dataCompleteness * 100).toFixed(0)}% < ${(cfg.eligibility.minCompleteness * 100).toFixed(0)}%`);
  }
  return why;
}

/** Per-risk caps (handover 7.2 table); the short-horizon modifier tightens the volatility cap. */
export function evaluateRiskEligibility(
  r: SnapshotRecord,
  risk: Risk,
  horizon: Horizon,
  cfg: UniverseConfig = universeConfig(),
): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  if (!r.hardEligible) return { ok: false, reasons: ["not hard-eligible", ...r.exclusionReasons] };
  const caps = cfg.eligibility.caps[risk];
  if (r.marketCap === null || r.marketCap < caps.minMarketCap) reasons.push("market cap below the cap for this risk level");
  const volCap = caps.maxVol1y * (horizon === "short" ? cfg.eligibility.shortHorizonVolMultiplier : 1);
  if (r.vol1y === null || r.vol1y > volCap) reasons.push("1-year volatility above the cap for this risk level and horizon");
  if (caps.maxBeta !== null && (r.beta3y === null || r.beta3y > caps.maxBeta)) reasons.push("beta above the cap (or unavailable)");
  if (caps.minMaxDD1y !== null && (r.maxDD1y === null || r.maxDD1y < caps.minMaxDD1y)) reasons.push("1-year maximum drawdown deeper than the cap");
  if (caps.profitability === "netIncomePositive") {
    if (r.netIncome === null || r.netIncome <= 0) reasons.push("net income not positive in the last fiscal year");
  } else {
    const g = r.isFinancial ? r.metrics.epsGrowth : r.metrics.revGrowth;
    if (g === null || g <= 0) reasons.push("growth not positive (revenue growth; EPS growth for financials)");
  }
  return { ok: reasons.length === 0, reasons };
}
