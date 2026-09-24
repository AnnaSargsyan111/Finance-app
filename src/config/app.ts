/**
 * Non-methodology application policy (cache TTLs from handover section 1.4, auth policy from 2.4,
 * limits from 3 and 10.4). Methodology (weights, caps, thresholds, keyword lists, source trust)
 * lives in methodology.v1.json.
 */
const MIN = 60_000;
const HOUR = 60 * MIN;

/** The one app-name constant (emails, Better Auth appName, page title). */
export const APP_NAME = "Finova";

export const APP = {
  cacheTtl: {
    fxLatestMs: 45 * MIN,
    fxHistoryMs: 6 * HOUR,
    stockQuoteMs: 60_000,
    stockFundamentalsMs: 24 * HOUR,
    stockHistoryMs: 6 * HOUR,
    newsMs: 15 * MIN,
    /** manual news refresh only re-fetches upstream when the cache is older than this */
    newsRefreshMinAgeMs: 5 * MIN,
    /** how long a last-good value may still be served (flagged stale) when upstream is failing */
    maxStaleMs: 30 * 24 * HOUR,
  },
  lock: { leaseMs: 45_000, waitPollMs: 150, waitMaxMs: 20_000 },
  newsRefreshThrottleMs: 30_000,
  auth: {
    sessionDays: 7,
    sessionUpdateAgeHours: 24,
    resetTokenMinutes: 60,
    loginFailuresPerWindow: 5,
    loginWindowMinutes: 15,
    loginPerIpLimit: 40,
    forgotPerEmailPerWindow: 3,
    forgotPerIpPerWindow: 10,
    forgotWindowMinutes: 15,
    signUpPerIpPerHour: 20,
    maxPasswordLength: 128,
    /** Flat abuse cap on POST /api/auth/change-password (no credential is verified anymore, so this is not an
     *  anti-brute-force limit - just a ceiling on how often the endpoint can be called at all). */
    changePasswordPerUserPerWindow: 10,
    changePasswordWindowMinutes: 60,
  },
  pf: {
    defaultPageSize: 50,
    maxPageSize: 200,
    maxRangeYears: 5,
    minDate: "1990-01-01",
    maxDate: "2100-12-31",
    maxAmount: "1000000000000.00",
    /** span (days) up to which the balance series is daily, otherwise weekly */
    dailySeriesMaxDays: 92,
    noteMaxLength: 500,
    nameMax: 60,
  },
  fx: {
    currencies: ["USD", "EUR", "GBP", "RUB"] as const,
    historyPadDays: 35,
    minDays: 7,
    maxDays: 366,
    defaultDays: 30,
  },
  stocks: {
    displaySymbols: ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"] as const,
  },
  invest: {
    minAmountAmd: 1_000,
    maxAmountAmd: 1_000_000_000,
  },
} as const;

export type DisplaySymbol = (typeof APP.stocks.displaySymbols)[number];
