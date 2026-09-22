import { APP, type DisplaySymbol } from "@/config/app";
import { getEnv, isFixtureMode } from "@/lib/env";
import { ApiError, NotConfiguredError, upstreamUnavailable } from "@/lib/errors";
import { log } from "@/lib/log";
import { normaliseDecimal } from "@/lib/money";
import { cached } from "../cache";
import { finnhub, keyedProviderStatus, twelveData, type DailyClose, type FinnhubMetrics, type FinnhubProfile } from "../providers/keyed";
import { fetchYahooChart, YAHOO_LABEL, type YahooRange } from "../providers/yahoo";
import { loadLatestSnapshot } from "../universe/snapshot-store";
import type { SnapshotRecord } from "../universe/types";
import { subtractDecimal } from "../fx/service";

/**
 * Stocks display service (handover 5.3): NVDA, AAPL, GOOGL, MSFT, AMZN.
 *  quote:    Finnhub (live | fixture)  ->  Yahoo chart (prototype-only, real but unofficial)
 *  metrics:  Finnhub profile+metric    ->  SEC EDGAR annual values from the universe snapshot (labelled "annual, not TTM")
 *  history:  Twelve Data (live | fixture) -> Yahoo chart (prototype-only)
 * Missing values are `null` with a reason in `unavailable`; fixture data is ALWAYS flagged isFixture:true.
 */
export const DISPLAY_SYMBOLS: readonly string[] = APP.stocks.displaySymbols;
export const HISTORY_RANGES = ["1m", "3m", "6m", "1y"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];
const RANGE_TO_YAHOO: Record<HistoryRange, YahooRange> = { "1m": "1mo", "3m": "3mo", "6m": "6mo", "1y": "1y" };
const RANGE_TO_OUTPUT: Record<HistoryRange, number> = { "1m": 22, "3m": 66, "6m": 132, "1y": 252 };

interface QuoteBlob {
  source: string;
  isFixture: boolean;
  name: string | null;
  price: number;
  previousClose: number | null;
  currency: string | null;
  time: string | null;
  high52w: number | null;
  low52w: number | null;
  failures: { provider: string; error: string; notConfigured?: boolean }[];
}

interface MetricsBlob {
  source: string | null;
  isFixture: boolean;
  profile: FinnhubProfile | null;
  metrics: FinnhubMetrics | null;
  failures: { provider: string; error: string; notConfigured?: boolean }[];
}

interface HistoryBlob {
  source: string;
  isFixture: boolean;
  series: DailyClose[];
  failures: { provider: string; error: string; notConfigured?: boolean }[];
}

const fail = (provider: string, e: unknown) => ({
  provider,
  error: e instanceof Error ? e.message : String(e),
  ...(e instanceof NotConfiguredError ? { notConfigured: true } : {}),
});

/* ------------------------------------------------------------------ fetchers (chains) */

async function fetchQuote(symbol: string): Promise<QuoteBlob> {
  const failures: QuoteBlob["failures"] = [];
  const fixture = isFixtureMode();
  try {
    const q = await finnhub.quote(symbol);
    const profile = await finnhub.profile(symbol).catch(() => null);
    const m = await finnhub.metrics(symbol).catch(() => null);
    return {
      source: fixture ? "fixture:finnhub (SYNTHETIC test data)" : "Finnhub",
      isFixture: fixture,
      name: profile?.name ?? null,
      price: q.price,
      previousClose: q.previousClose,
      currency: profile?.currency ?? "USD",
      time: q.time,
      high52w: m?.high52w ?? null,
      low52w: m?.low52w ?? null,
      failures,
    };
  } catch (e) {
    failures.push(fail("finnhub", e));
  }
  if (!fixture) {
    try {
      const c = await fetchYahooChart(symbol, "5d");
      if (c.price === null) throw new Error("Yahoo returned no price");
      return { source: YAHOO_LABEL, isFixture: false, name: c.name, price: c.price, previousClose: c.previousClose, currency: c.currency, time: c.priceTime, high52w: c.high52w, low52w: c.low52w, failures };
    } catch (e) {
      failures.push(fail("yahoo", e));
    }
  }
  throw Object.assign(new Error(`No quote provider answered for ${symbol}`), { failures });
}

async function fetchMetrics(symbol: string): Promise<MetricsBlob> {
  const failures: MetricsBlob["failures"] = [];
  try {
    const [profile, metrics] = await Promise.all([finnhub.profile(symbol), finnhub.metrics(symbol)]);
    return { source: isFixtureMode() ? "fixture:finnhub (SYNTHETIC test data)" : "Finnhub", isFixture: isFixtureMode(), profile, metrics, failures };
  } catch (e) {
    failures.push(fail("finnhub", e));
    return { source: null, isFixture: false, profile: null, metrics: null, failures };
  }
}

async function fetchHistory(symbol: string, range: HistoryRange): Promise<HistoryBlob> {
  const failures: HistoryBlob["failures"] = [];
  const fixture = isFixtureMode();
  try {
    const series = await twelveData.timeSeries(symbol, RANGE_TO_OUTPUT[range]);
    if (series.length < 5) throw new Error("too few points");
    return { source: fixture ? "fixture:twelvedata (SYNTHETIC test data)" : "Twelve Data", isFixture: fixture, series, failures };
  } catch (e) {
    failures.push(fail("twelvedata", e));
  }
  if (!fixture) {
    try {
      const c = await fetchYahooChart(symbol, RANGE_TO_YAHOO[range]);
      if (c.bars.length < 5) throw new Error("too few points");
      return { source: YAHOO_LABEL, isFixture: false, series: c.bars.map((b) => ({ date: b.date, close: b.close })), failures };
    } catch (e) {
      failures.push(fail("yahoo", e));
    }
  }
  throw Object.assign(new Error(`No history provider answered for ${symbol}`), { failures });
}

/* ------------------------------------------------------------------ formatting helpers */

const dec = (n: number | null | undefined, minDp = 2): string | null => {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  // provider floats carry binary noise (222.27000427246094): round to 4 decimals before printing decimal text
  const r = Math.abs(n) < 1e9 ? Math.round(n * 1e4) / 1e4 : n;
  const s = Math.abs(r) >= 1e21 ? r.toFixed(0) : /e/i.test(String(r)) ? r.toFixed(8) : String(r);
  return normaliseDecimal(s, minDp);
};
const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;

export interface StockItem {
  symbol: string;
  name: string | null;
  price: string | null;
  previousClose: string | null;
  change: string | null;
  /** percent, e.g. 2.12 = +2.12 % */
  changePct: number | null;
  currency: string | null;
  marketCap: string | null;
  peTtm: number | null;
  epsTtm: string | null;
  /** percent */
  dividendYield: number | null;
  dividendPerShare: string | null;
  revenueTtm: string | null;
  netIncomeTtm: string | null;
  /** percent */
  profitMargin: number | null;
  /** percent */
  revenueGrowthYoy: number | null;
  beta: number | null;
  high52w: string | null;
  low52w: string | null;
  history1m: { date: string; close: string }[];
  asOf: string | null;
  source: string;
  isDelayed: true;
  isFixture: boolean;
  /** which provider/basis produced each populated field */
  fieldSources: Record<string, string>;
  /** field -> why it is null */
  unavailable: Record<string, string>;
}

const SEC_BASIS = (r: SnapshotRecord) => `SEC EDGAR FY${r.fiscalYear ?? "?"} annual (not TTM)`;

async function secRecord(symbol: string): Promise<SnapshotRecord | null> {
  try {
    const snap = await loadLatestSnapshot();
    return snap?.payload.records.find((r) => r.symbol === symbol) ?? null;
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ public API */

export interface StocksMeta {
  asOf: string;
  stale: boolean;
  isDelayed: true;
  isFixture: boolean;
  source: string;
  notConfigured: string[];
  providers: { provider: string; mode: string; role: string }[];
  note?: string;
}

async function buildItem(symbol: string, acc: { asOf: Date[]; stale: boolean; notConfigured: Set<string>; sources: Set<string>; fixture: boolean }) {
  const fieldSources: Record<string, string> = {};
  const unavailable: Record<string, string> = {};
  const noteFailures = (fs: { provider: string; error: string; notConfigured?: boolean }[]) => {
    for (const f of fs) if (f.notConfigured) acc.notConfigured.add(f.provider);
  };

  // --- quote
  let q: Awaited<ReturnType<typeof cached<QuoteBlob>>> | null = null;
  try {
    q = await cached<QuoteBlob>(`stocks:quote:v1:${symbol}`, { ttlMs: APP.cacheTtl.stockQuoteMs, fetch: () => fetchQuote(symbol) });
    noteFailures(q.value.failures);
    acc.asOf.push(q.fetchedAt);
    if (q.stale) acc.stale = true;
    acc.sources.add(q.value.source);
    if (q.value.isFixture) acc.fixture = true;
  } catch (e) {
    const failures = (e as { failures?: QuoteBlob["failures"]; cause?: unknown })?.failures;
    if (failures) noteFailures(failures);
    else if (e instanceof ApiError) {
      // cache layer wraps provider failures: recover the reason text
      const reason = String((e.extra as { reason?: string } | undefined)?.reason ?? "");
      if (/not configured|FINNHUB_API_KEY/i.test(reason)) acc.notConfigured.add("finnhub");
    }
    log.warn("stock quote unavailable", { symbol, message: e instanceof Error ? e.message : String(e) });
  }

  // --- metrics (Finnhub) + SEC-derived fill
  let m: MetricsBlob | null = null;
  try {
    const r = await cached<MetricsBlob>(`stocks:metrics:v1:${symbol}`, { ttlMs: APP.cacheTtl.stockFundamentalsMs, fetch: () => fetchMetrics(symbol) });
    m = r.value;
    noteFailures(m.failures);
    acc.asOf.push(r.fetchedAt);
    if (r.stale) acc.stale = true;
    if (m.source) acc.sources.add(m.source);
    if (m.isFixture) acc.fixture = true;
  } catch {
    /* metrics are optional */
  }
  const sec = await secRecord(symbol);
  if (sec) acc.sources.add(SEC_BASIS(sec));

  // --- history
  let h: HistoryBlob | null = null;
  try {
    const r = await cached<HistoryBlob>(`stocks:hist:v1:${symbol}:1m`, { ttlMs: APP.cacheTtl.stockHistoryMs, fetch: () => fetchHistory(symbol, "1m") });
    h = r.value;
    noteFailures(h.failures);
    acc.asOf.push(r.fetchedAt);
    if (r.stale) acc.stale = true;
    acc.sources.add(h.source);
    if (h.isFixture) acc.fixture = true;
  } catch (e) {
    const failures = (e as { failures?: HistoryBlob["failures"] })?.failures;
    if (failures) noteFailures(failures);
  }

  const qv = q?.value ?? null;
  const price = qv?.price ?? null;
  const prev = qv?.previousClose ?? null;
  const item: StockItem = {
    symbol,
    name: qv?.name ?? m?.profile?.name ?? sec?.name ?? null,
    price: dec(price),
    previousClose: dec(prev),
    change: null,
    changePct: null,
    currency: qv?.currency ?? m?.profile?.currency ?? (price !== null ? "USD" : null),
    marketCap: null,
    peTtm: null,
    epsTtm: null,
    dividendYield: null,
    dividendPerShare: null,
    revenueTtm: null,
    netIncomeTtm: null,
    profitMargin: null,
    revenueGrowthYoy: null,
    beta: null,
    high52w: dec(qv?.high52w),
    low52w: dec(qv?.low52w),
    history1m: (h?.series ?? []).map((p) => ({ date: p.date, close: dec(p.close)! })),
    asOf: q ? q.fetchedAt.toISOString() : null,
    source: qv?.source ?? "unavailable",
    isDelayed: true,
    isFixture: Boolean(qv?.isFixture),
    fieldSources,
    unavailable,
  };

  if (price !== null) {
    fieldSources.price = qv!.source;
    if (prev !== null) {
      // change = price - previousClose ; changePct = change / previousClose (QA D)
      item.change = subtractDecimal(item.price!, item.previousClose!);
      item.changePct = round((Number(item.change) / Number(item.previousClose)) * 100, 4);
      fieldSources.previousClose = qv!.source;
    } else {
      unavailable.previousClose = "provider did not return a previous close";
      unavailable.change = unavailable.changePct = "needs previous close";
    }
  } else {
    unavailable.price = "no quote provider answered";
  }
  if (item.high52w) fieldSources.high52w = qv!.source;
  else unavailable.high52w = "not provided by the quote source";
  if (item.low52w) fieldSources.low52w = qv!.source;
  else unavailable.low52w = "not provided by the quote source";
  if (item.history1m.length) fieldSources.history1m = h!.source;
  else unavailable.history1m = "no history provider answered";

  // Finnhub metrics first ...
  const fm = m?.metrics ?? null;
  if (fm && m?.source) {
    const src = m.source;
    if (m.profile?.marketCap != null) { item.marketCap = dec(Math.round(m.profile.marketCap), 0); fieldSources.marketCap = src; }
    if (fm.peTtm !== null) { item.peTtm = round(fm.peTtm, 4); fieldSources.peTtm = src; }
    if (fm.epsTtm !== null) { item.epsTtm = dec(fm.epsTtm); fieldSources.epsTtm = src; }
    if (fm.dividendYieldPct !== null) { item.dividendYield = round(fm.dividendYieldPct, 4); fieldSources.dividendYield = src; }
    if (fm.dividendPerShare !== null) { item.dividendPerShare = dec(fm.dividendPerShare); fieldSources.dividendPerShare = src; }
    if (fm.beta !== null) { item.beta = round(fm.beta, 4); fieldSources.beta = src; }
    if (fm.revenueGrowthYoyPct !== null) { item.revenueGrowthYoy = round(fm.revenueGrowthYoyPct, 4); fieldSources.revenueGrowthYoy = src; }
    if (fm.profitMarginPct !== null) { item.profitMargin = round(fm.profitMarginPct, 4); fieldSources.profitMargin = src; }
    if (item.high52w === null && fm.high52w !== null) { item.high52w = dec(fm.high52w); fieldSources.high52w = src; delete unavailable.high52w; }
    if (item.low52w === null && fm.low52w !== null) { item.low52w = dec(fm.low52w); fieldSources.low52w = src; delete unavailable.low52w; }
  }
  // ... then SEC EDGAR annual values (honestly labelled) for whatever is still empty
  if (sec) {
    const basis = SEC_BASIS(sec);
    const fill = <K extends keyof StockItem>(key: K, value: StockItem[K] | null) => {
      if (item[key] === null && value !== null) {
        item[key] = value as StockItem[K];
        fieldSources[key as string] = basis;
      }
    };
    if (item.marketCap === null && price !== null && sec.sharesOut) { item.marketCap = dec(Math.round(price * sec.sharesOut), 0); fieldSources.marketCap = `live price x shares outstanding (${basis})`; }
    fill("epsTtm", dec(sec.eps));
    if (item.peTtm === null && price !== null && sec.eps && sec.eps > 0) { item.peTtm = round(price / sec.eps, 4); fieldSources.peTtm = `live price / ${basis} diluted EPS`; }
    fill("dividendPerShare", sec.dps !== null ? dec(sec.dps) : null);
    if (item.dividendYield === null && price !== null && sec.dps !== null) { item.dividendYield = round((sec.dps / price) * 100, 4); fieldSources.dividendYield = `${basis} dividends / live price`; }
    fill("revenueTtm", sec.revenue !== null ? dec(Math.round(sec.revenue), 0) : null);
    fill("netIncomeTtm", sec.netIncome !== null ? dec(Math.round(sec.netIncome), 0) : null);
    if (item.profitMargin === null && sec.revenue && sec.netIncome !== null) { item.profitMargin = round((sec.netIncome / sec.revenue) * 100, 4); fieldSources.profitMargin = basis; }
    if (item.revenueGrowthYoy === null && sec.revenue && sec.revenuePrev) { item.revenueGrowthYoy = round((sec.revenue / sec.revenuePrev - 1) * 100, 4); fieldSources.revenueGrowthYoy = basis; }
    fill("beta", sec.beta3y !== null ? round(sec.beta3y, 4) : null);
  }
  const why = (has: boolean) =>
    has ? "not available from any configured source" : "no Finnhub key and the SEC universe snapshot has not been built yet (run the nightly batch)";
  for (const f of ["marketCap", "peTtm", "epsTtm", "dividendYield", "dividendPerShare", "revenueTtm", "netIncomeTtm", "profitMargin", "revenueGrowthYoy", "beta"] as const) {
    if (item[f] === null && !unavailable[f]) unavailable[f] = why(Boolean(sec || m?.metrics));
  }
  return item;
}

export async function getStocks(): Promise<{ data: { items: StockItem[] }; meta: StocksMeta }> {
  const acc = { asOf: [] as Date[], stale: false, notConfigured: new Set<string>(), sources: new Set<string>(), fixture: false };
  const items: StockItem[] = [];
  for (const symbol of DISPLAY_SYMBOLS) items.push(await buildItem(symbol, acc));
  if (items.every((i) => i.price === null)) {
    throw upstreamUnavailable("No stock quote provider is available right now.", { notConfigured: [...acc.notConfigured] });
  }
  // honest configuration report: computed from the provider modes, not inferred from failures
  for (const p of keyedProviderStatus()) if (p.mode === "notConfigured") acc.notConfigured.add(p.provider);
  const oldest = acc.asOf.length ? new Date(Math.min(...acc.asOf.map((d) => d.getTime()))) : new Date();
  const env = getEnv();
  const meta: StocksMeta = {
    asOf: oldest.toISOString(),
    stale: acc.stale,
    isDelayed: true,
    isFixture: acc.fixture,
    source: [...acc.sources].join(" + "),
    notConfigured: [...acc.notConfigured].sort(),
    providers: [
      { provider: "finnhub", role: "quote, profile, metrics", mode: isFixtureMode() ? "fixture" : env.FINNHUB_API_KEY ? "live" : "notConfigured" },
      { provider: "twelvedata", role: "history", mode: isFixtureMode() ? "fixture" : env.TWELVE_DATA_API_KEY ? "live" : "notConfigured" },
      { provider: "yahoo", role: "prototype-only fallback (unofficial)", mode: isFixtureMode() ? "disabled-in-fixture-mode" : env.ALLOW_YAHOO_PROTOTYPE ? "live" : "disabled" },
      { provider: "sec-edgar", role: "annual fundamentals (universe snapshot)", mode: items.some((i) => Object.values(i.fieldSources).some((s) => s.includes("SEC EDGAR"))) ? "live" : "not built yet" },
    ],
    ...(acc.fixture ? { note: "FIXTURE MODE: values are synthetic test data, not market data." } : {}),
  };
  return { data: { items }, meta };
}

export function normaliseSymbol(s: string): DisplaySymbol | null {
  const up = s.trim().toUpperCase();
  return (DISPLAY_SYMBOLS as readonly string[]).includes(up) ? (up as DisplaySymbol) : null;
}

export async function getStockHistory(symbol: DisplaySymbol, range: HistoryRange) {
  const r = await cached<HistoryBlob>(`stocks:hist:v1:${symbol}:${range}`, {
    ttlMs: APP.cacheTtl.stockHistoryMs,
    fetch: () => fetchHistory(symbol, range),
  });
  const notConfigured = keyedProviderStatus().filter((p) => p.provider === "twelvedata" && p.mode === "notConfigured").map((p) => p.provider);
  return {
    data: { symbol, range, series: r.value.series.map((p) => ({ date: p.date, close: dec(p.close)! })) },
    meta: {
      asOf: r.fetchedAt.toISOString(),
      stale: r.stale,
      isDelayed: true as const,
      isFixture: r.value.isFixture,
      source: r.value.source,
      notConfigured,
      ...(r.value.isFixture ? { note: "FIXTURE MODE: values are synthetic test data, not market data." } : {}),
    },
  };
}
