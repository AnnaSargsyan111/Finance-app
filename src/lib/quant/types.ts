/** Snapshot record shapes (handover 10.5). Written by the nightly batch (market), read by invest via market/read. */
export type Risk = "low" | "medium" | "high";
export type Horizon = "short" | "medium" | "long";
export type FactorName = "quality" | "value" | "growth" | "momentum" | "lowRisk" | "income";
export const FACTORS: readonly FactorName[] = ["quality", "value", "growth", "momentum", "lowRisk", "income"];

export interface DerivedMetrics {
  roe: number | null;
  opMargin: number | null;
  netMargin: number | null;
  fcfMargin: number | null;
  debtToEquity: number | null;
  earningsStability: number | null;
  pe: number | null;
  ps: number | null;
  pb: number | null;
  fcfYield: number | null;
  divYield: number | null;
  payout: number | null;
  revGrowth: number | null;
  rev3yCAGR: number | null;
  epsGrowth: number | null;
}

/** one scored input: raw value, direction-adjusted percentile (0-100, higher = better) and its factor */
export interface FactorInput {
  factor: FactorName;
  value: number;
  pct: number;
}

export interface SnapshotRecord {
  symbol: string;
  cik: string | null;
  name: string;
  sector: string | null;
  industry: string | null;
  /** banks / insurers / real estate: different XBRL tags, revenue-based metrics skipped (handover 5.4) */
  isFinancial: boolean;

  price: number | null;
  priceAsOf: string | null;
  sharesOut: number | null;
  marketCap: number | null;

  fiscalYear: number | null;
  /** period end date of the annual value actually used (frames are calendar-aligned) */
  fiscalPeriodEnd: string | null;

  revenue: number | null;
  revenuePrev: number | null;
  revenue3yAgo: number | null;
  netIncome: number | null;
  netIncomePrev: number | null;
  netIncome2yAgo: number | null;
  eps: number | null;
  epsPrev: number | null;
  grossProfit: number | null;
  opIncome: number | null;
  equity: number | null;
  assets: number | null;
  liabilities: number | null;
  opCashFlow: number | null;
  capex: number | null;
  dps: number | null;

  vol1y: number | null;
  beta3y: number | null;
  maxDD1y: number | null;
  mom12_1: number | null;
  mom6: number | null;
  above200dma: number | null;
  historyDays: number;
  historyStart: string | null;

  metrics: DerivedMetrics;
  /** factor scores 0-100 (null = dropped for lack of inputs) */
  factorScores: Record<FactorName, number | null>;
  factorInputs: Record<string, FactorInput>;
  dataCompleteness: number;
  flags: string[];
  /** eligibility for the standard (non-short) horizon; invest re-evaluates for short horizons from the raw metrics */
  eligibleByRisk: Record<Risk, boolean>;
  /** hard eligibility (all risk levels) - false = never recommended */
  hardEligible: boolean;
  exclusionReasons: string[];
  status: "ok" | "incomplete" | "excluded";
}

export interface SnapshotCoverage {
  constituents: number;
  issuers: number;
  withCik: number;
  duplicatesDropped: number;
  withFundamentals: number;
  withPrices: number;
  priceFailures: number;
  hardEligible: number;
  eligibleByRisk: Record<Risk, number>;
  revenueCoverage: number;
  netIncomeCoverage: number;
  epsCoverage: number;
  opIncomeCoverage: number;
  grossProfitCoverage: number;
  equityCoverage: number;
  assetsCoverage: number;
  opCashFlowCoverage: number;
  dividendCoverage: number;
  sharesCoverage: number;
  incomplete: number;
  fundamentalsFiscalYear: number;
  limit: number | null;
}

export interface StableLeader {
  symbol: string;
  composite: number;
}

export interface SnapshotPayload {
  records: SnapshotRecord[];
  /** key "risk|horizon" -> stabilised leader (handover 7.5 stability rule) */
  stableLeaders: Record<string, StableLeader>;
  coverage: SnapshotCoverage;
  benchmark: { symbol: string; lastDate: string | null; bars: number };
  notes: string[];
}

export interface SnapshotMeta {
  id: number;
  asOf: string;
  methodologyVersion: string;
  createdAt: string;
}

export interface LoadedSnapshot extends SnapshotMeta {
  payload: SnapshotPayload;
}
