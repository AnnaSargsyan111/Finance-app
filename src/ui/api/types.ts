/** Wire types for Finova's own API (handover 10.4 + Change Order 17). Money is a decimal STRING unless noted. */

export interface Meta {
  asOf?: string;
  source?: string;
  stale?: boolean;
  isFixture?: boolean;
  isDelayed?: boolean;
  note?: string;
  staleReason?: string;
  [key: string]: unknown;
}

/** Market + invest endpoints answer `{data, meta}`; `demo` is set by the client for MOCKED endpoints only. */
export interface Enveloped<T> {
  data: T;
  meta: Meta;
  demo?: boolean;
}

/* ------------------------------------------------------------------ auth */
export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}
export interface SignUpBody {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}
export interface PasswordPolicy {
  minLength: number;
  maxLength: number;
  rules: { id: string; label: string }[];
}

/* ------------------------------------------------------------------ personal finance */
export type PeriodKind = "month" | "custom";
export interface PeriodRef {
  kind: PeriodKind;
  /** YYYY-MM when kind = month */
  month?: string;
  start?: string;
  end?: string;
}
export interface PeriodListItem {
  kind: PeriodKind;
  start: string;
  end: string;
  hasData: boolean;
  updatedAt: string | null;
}
export interface ExpenseRow {
  key: string | null;
  label: string;
  isCustom: boolean;
  amount: string | null;
}
export interface PeriodView {
  period: { kind: PeriodKind; start: string; end: string };
  exists: boolean;
  income: string | null;
  expenses: ExpenseRow[];
  totals: { income: string; expensesTotal: string; available: string };
  expenseBreakdown: { label: string; amount: string; percent: number }[];
  cashFlow: { income: string; expenses: string; available: string };
  isEmpty: boolean;
  incomeMissing: boolean;
  updatedAt: string | null;
}
export interface PutPeriodBody extends PeriodRef {
  income: string | null;
  expenses: { key?: string; label?: string; amount: string | null }[];
}

/* ------------------------------------------------------------------ market */
export interface FxRate {
  pair: string;
  rate: string;
  diff: string | null;
  sourceDate: string;
}
export interface FxPoint {
  date: string;
  rate: string;
  isCarriedForward: boolean;
  sourceDate: string;
}
export interface FxHistory {
  pair: string;
  series: FxPoint[];
}

export interface StockItem {
  symbol: string;
  name: string | null;
  price: string | null;
  previousClose: string | null;
  change: string | null;
  changePct: number | null;
  currency: string | null;
  marketCap: string | null;
  peTtm: number | null;
  epsTtm: string | null;
  dividendYield: number | null;
  high52w: string | null;
  low52w: string | null;
  history1m: { date: string; close: string }[];
  asOf: string | null;
  source: string;
  isDelayed: boolean;
  isFixture: boolean;
  unavailable?: Record<string, string>;
}
export type StockRange = "1m" | "3m" | "6m" | "1y";
export interface StockHistory {
  symbol: string;
  series: { date: string; close: string }[];
}

export interface NewsItem {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  region?: "global" | "armenia";
  topic?: string;
  category: string;
  summary: string | null;
  imageUrl: string | null;
}
export interface NewsDetail extends NewsItem {
  readFullUrl: string;
}

/* ------------------------------------------------------------------ investment */
export interface ConvertResult {
  amountAmd: string;
  usd: string;
  rate: string;
  rateDate: string;
  source: string;
}
export type Risk = "low" | "medium" | "high";
export type Horizon = "short" | "medium" | "long";
export type RecMode = "single" | "portfolio";

/** The ONLY fields the recommendation request may contain (AC-F6). */
export interface RecommendationRequest {
  amountAmd: number;
  risk: Risk;
  horizon: Horizon;
  mode: RecMode;
  notNeededForEmergencies: true;
}

export interface Driver {
  label: string;
  /** already formatted by the backend, e.g. "103.0%" */
  value: string;
  percentile?: number | null;
  /** "top N%" of the eligible set */
  topPercent?: number | null;
}
export interface PickMetrics {
  vol1y?: number | null;
  maxDD1y?: number | null;
  beta3y?: number | null;
  marketCap?: number | null;
  dividendYield?: number | null;
}
export interface StockPick {
  symbol: string;
  name: string;
  sector?: string | null;
  price: string;
  composite?: number;
  drivers?: Driver[];
  explanation?: string;
  metrics?: PickMetrics;
  flags?: string[];
  shares: number;
  cost: string;
  leftoverCash?: string;
}
export interface Holding extends StockPick {
  /** fractions (0.25 = 25%) */
  targetWeight?: number;
  actualWeight?: number;
  /** actual allocation in percent, 1 decimal */
  allocationPercent: number;
  allocatedAmountUsd: string;
  allocatedAmountAmd: number;
}
export interface Warning {
  code: string;
  message: string;
}

interface ResultBase {
  inputs: { amountAmd: number; risk: Risk; horizon: Horizon };
  usdRate: string;
  rateDate: string;
  rateSource?: string;
  budgetUsd?: string;
  score: number;
  scoreLabel: string;
  scoreNote: string;
  methodologyVersion: string;
  dataAsOf: string;
  snapshotDate?: string;
  disclaimers: string[];
  warnings: Warning[];
  allocatedAmountUsd: string;
  allocatedAmountAmd: number;
  unallocatedCashUsd: string;
  unallocatedCashAmd: number;
  saveToken?: string;
  saveTokenExpiresAt?: string;
}
export interface SingleResult extends ResultBase {
  mode: "single";
  pick: StockPick;
  runnersUp?: StockPick[];
}
export interface PortfolioMetrics {
  holdingsCount?: number;
  targetHoldings?: number;
  weightedBeta?: number | null;
  estimatedVolatility?: number | null;
  volatilityBand?: number | null;
  sectorSplit?: { sector: string; weight: number }[];
  weightedDividendYield?: number | null;
  effectiveN?: number | null;
  topHoldingWeight?: number | null;
}
export interface PortfolioResult extends ResultBase {
  mode: "portfolio";
  holdings: Holding[];
  cash?: string;
  metrics?: PortfolioMetrics;
  why?: { holdingsCount?: string; weighting?: string; diversification?: string };
  /** default 1Y comparison block shipped with the portfolio response */
  benchmark?: ComparisonResult | null;
}
export type RecommendationResult = SingleResult | PortfolioResult;

export type ComparisonWindow = "1M" | "3M" | "6M" | "1Y" | "3Y" | "5Y";
export interface ComparisonSeriesPoint {
  date: string;
  portfolio: number;
  benchmark: number;
}
export type MetricSet = Record<string, number | string | null | undefined>;
export interface ComparisonResult {
  window: ComparisonWindow;
  benchmark: { symbol: string; label: string; note?: string };
  start: string;
  end: string;
  requestedStart?: string;
  truncated?: boolean;
  notes?: string[];
  series: ComparisonSeriesPoint[];
  metrics: { portfolio: MetricSet; benchmark: MetricSet };
  diversification?: {
    holdingsCount?: number;
    universeSize?: number;
    effectiveN?: number;
    top1Weight?: number;
    top3Weight?: number;
    sectorCount?: number;
    maxSectorWeight?: number;
    benchmarkMaxSectorWeight?: number;
    sectors?: { sector: string; portfolioWeight: number; benchmarkWeight: number }[];
    averagePairwiseCorrelation?: number;
    diversificationRatio?: number;
  };
  disclaimers: string[];
  riskFreeRate?: number;
  riskFreeSource?: string;
}
export interface ComparisonRequest {
  holdings: { symbol: string; shares: number }[];
  window: ComparisonWindow;
}

/** list item of GET /api/invest/history (summary only) */
export interface SavedSummary {
  id: string;
  createdAt: string;
  mode: RecMode;
  inputs: { amountAmd: number; risk: Risk; horizon: Horizon };
  usdRate?: string;
  score: number | null;
  headline: string;
  holdings: { symbol: string | null; name: string | null; allocationPercent: number | null }[];
  methodologyVersion?: string;
  snapshotDate?: string;
}
/** GET /api/invest/history/:id: the summary plus the full saved result */
export interface SavedRecommendation extends SavedSummary {
  result: RecommendationResult;
  benchmarkSummary?: unknown;
}
export interface HistoryGroup {
  /** Asia/Yerevan calendar day, YYYY-MM-DD */
  date: string;
  /** e.g. "September 21, 2026" */
  label: string;
  items: SavedSummary[];
}
export interface HistoryList {
  groups: HistoryGroup[];
  page?: number;
  pageSize?: number;
  total?: number;
}
