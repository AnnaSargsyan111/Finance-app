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
    /** commercial-bank cash buy/sell boards (they move through the day) */
    fxBanksMs: 30 * MIN,
    /** quotes are delayed and indicative anyway; 5 minutes keeps the Stocks tab fast (every refresh of 6 symbols waits for the provider's rate limit) */
    stockQuoteMs: 5 * MIN,
    stockFundamentalsMs: 24 * HOUR,
    /** one month of daily closes: the daily cron job keeps it warm (Twelve Data's free plan allows 8 calls a minute, so 6 symbols take about 48 s cold) */
    stockHistoryMs: 24 * HOUR,
    /** the IPO calendar: dates and price ranges move through the day, but the list is small and one call serves everyone */
    ipoCalendarMs: 6 * HOUR,
    newsMs: 15 * MIN,
    /** a saved news list younger than this is shown at once while it refreshes in the background (nobody waits for the 10 feeds) */
    newsSwrMs: 12 * HOUR,
    /** same for the six stock quotes (they are labelled delayed and show their age anyway) */
    stockQuoteSwrMs: 30 * MIN,
    /** fundamentals and the one-month history change slowly: a copy up to this old is shown while it refreshes */
    stockSlowSwrMs: 3 * 24 * HOUR,
    /** the official pages the AI assistant may quote (src/assistant/sources.ts) */
    assistantSourcesMs: 24 * HOUR,
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
  assistant: {
    questionMaxChars: 400,
    /** abuse and cost caps, counted per question asked (not per success) */
    perUserPerHour: 15,
    perUserPerDay: 40,
    globalPerDay: 300,
    modelTimeoutMs: 25_000,
    /** the web lookup (Gemini + Google Search) is slower than a plain model call */
    webTimeoutMs: 40_000,
    /** an answer counts as backed by online sources when search results support at least this share of its text */
    webMinCoverage: 0.6,
    maxAnswerChars: 1200,
    maxSourceChars: 12_000,
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
    currencies: ["USD", "EUR", "GEL", "RUB"] as const,
    historyPadDays: 35,
    minDays: 7,
    maxDays: 366,
    defaultDays: 30,
  },
  stocks: {
    displaySymbols: ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN", "TSLA"] as const,
  },
  invest: {
    minAmountAmd: 1_000,
    maxAmountAmd: 1_000_000_000,
  },
} as const;

export type DisplaySymbol = (typeof APP.stocks.displaySymbols)[number];
