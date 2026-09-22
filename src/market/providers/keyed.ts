import fs from "node:fs";
import path from "node:path";
import { getEnv, isFixtureMode } from "@/lib/env";
import { NotConfiguredError, UpstreamError } from "@/lib/errors";
import { fetchJson } from "../http";

/**
 * Keyed provider adapters (Finnhub, Twelve Data). NO API KEYS EXIST YET, so each adapter has three states:
 *   live           - key present, real HTTP calls
 *   fixture        - KEYED_PROVIDER_MODE=fixture: answers from tests/fixtures/providers (SYNTHETIC values, always
 *                    reported with isFixture:true; dev/test only - never mixed silently with live data)
 *   notConfigured  - no key and not in fixture mode: adapter throws NotConfiguredError and callers report it in meta
 * The adapters were written from the vendors' documentation and are UNVERIFIED against the real APIs (no key).
 */
export type ProviderMode = "live" | "fixture" | "notConfigured";

export function finnhubMode(): ProviderMode {
  if (isFixtureMode()) return "fixture";
  return getEnv().FINNHUB_API_KEY ? "live" : "notConfigured";
}
export function twelveDataMode(): ProviderMode {
  if (isFixtureMode()) return "fixture";
  return getEnv().TWELVE_DATA_API_KEY ? "live" : "notConfigured";
}

function fixtureFile(...p: string[]): unknown {
  const file = path.join(process.cwd(), "tests", "fixtures", "providers", ...p);
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    throw new UpstreamError("fixture", `missing fixture file ${p.join("/")}`, undefined, false);
  }
}

/* ------------------------------------------------------------------ Finnhub */

export interface FinnhubQuote {
  price: number;
  change: number | null;
  changePct: number | null;
  previousClose: number | null;
  time: string | null;
}
export interface FinnhubProfile {
  name: string | null;
  /** USD, full units (Finnhub reports millions) */
  marketCap: number | null;
  currency: string | null;
}
export interface FinnhubMetrics {
  peTtm: number | null;
  epsTtm: number | null;
  /** percent, e.g. 0.5 = 0.5 % */
  dividendYieldPct: number | null;
  dividendPerShare: number | null;
  high52w: number | null;
  low52w: number | null;
  beta: number | null;
  revenueGrowthYoyPct: number | null;
  profitMarginPct: number | null;
}

const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

async function finnhubGet<T>(pathAndQuery: string, fixture: string): Promise<T> {
  const mode = finnhubMode();
  if (mode === "notConfigured") throw new NotConfiguredError("finnhub", "FINNHUB_API_KEY is not set");
  if (mode === "fixture") return fixtureFile("finnhub", fixture) as T;
  const key = getEnv().FINNHUB_API_KEY!;
  // the key travels in a header (never in a URL that could be logged)
  return fetchJson<T>(`https://finnhub.io/api/v1${pathAndQuery}`, { provider: "finnhub", headers: { "x-finnhub-token": key }, timeoutMs: 10_000 });
}

export const finnhub = {
  name: "finnhub" as const,
  mode: finnhubMode,
  async quote(symbol: string): Promise<FinnhubQuote> {
    const j = await finnhubGet<Record<string, unknown>>(`/quote?symbol=${encodeURIComponent(symbol)}`, `quote_${symbol}.json`);
    const price = n(j.c);
    // Finnhub answers {c:0,...} for unknown symbols
    if (price === null || price <= 0) throw new UpstreamError("finnhub", `Finnhub returned no quote for ${symbol}`, undefined, false);
    const t = n(j.t);
    return { price, change: n(j.d), changePct: n(j.dp), previousClose: n(j.pc), time: t ? new Date(t * 1000).toISOString() : null };
  },
  async profile(symbol: string): Promise<FinnhubProfile> {
    const j = await finnhubGet<Record<string, unknown>>(`/stock/profile2?symbol=${encodeURIComponent(symbol)}`, `profile_${symbol}.json`);
    const mc = n(j.marketCapitalization);
    return { name: typeof j.name === "string" ? j.name : null, marketCap: mc !== null ? mc * 1_000_000 : null, currency: typeof j.currency === "string" ? j.currency : null };
  },
  async metrics(symbol: string): Promise<FinnhubMetrics> {
    const j = await finnhubGet<{ metric?: Record<string, unknown> }>(`/stock/metric?symbol=${encodeURIComponent(symbol)}&metric=all`, `metric_${symbol}.json`);
    const m = j.metric ?? {};
    return {
      peTtm: n(m.peTTM),
      epsTtm: n(m.epsTTM),
      dividendYieldPct: n(m.dividendYieldIndicatedAnnual),
      dividendPerShare: n(m.dividendPerShareAnnual),
      high52w: n(m["52WeekHigh"]),
      low52w: n(m["52WeekLow"]),
      beta: n(m.beta),
      revenueGrowthYoyPct: n(m.revenueGrowthTTMYoy),
      profitMarginPct: n(m.netProfitMarginTTM),
    };
  },
};

/* ------------------------------------------------------------------ Twelve Data */

export interface DailyClose {
  date: string;
  close: number;
}

export const twelveData = {
  name: "twelvedata" as const,
  mode: twelveDataMode,
  /** most recent `outputsize` daily closes, oldest first */
  async timeSeries(symbol: string, outputsize: number): Promise<DailyClose[]> {
    const mode = twelveDataMode();
    if (mode === "notConfigured") throw new NotConfiguredError("twelvedata", "TWELVE_DATA_API_KEY is not set");
    let j: { status?: string; message?: string; values?: { datetime: string; close: string }[] };
    if (mode === "fixture") {
      j = fixtureFile("twelvedata", `time_series_${symbol}.json`) as typeof j;
    } else {
      const key = getEnv().TWELVE_DATA_API_KEY!;
      j = await fetchJson(`https://api.twelvedata.com/time_series?symbol=${encodeURIComponent(symbol)}&interval=1day&outputsize=${outputsize}`, {
        provider: "twelvedata",
        headers: { authorization: `apikey ${key}` },
        timeoutMs: 15_000,
      });
    }
    if (j.status === "error" || !Array.isArray(j.values)) {
      throw new UpstreamError("twelvedata", `Twelve Data: ${j.message ?? "unexpected response"}`, undefined, false);
    }
    const out: DailyClose[] = [];
    for (const v of j.values) {
      const close = Number(v.close);
      if (/^\d{4}-\d{2}-\d{2}/.test(v.datetime) && Number.isFinite(close)) out.push({ date: v.datetime.slice(0, 10), close });
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : 1)).slice(-outputsize);
  },
};

export function keyedProviderStatus() {
  return [
    { provider: "finnhub", role: "display quote/profile/metrics", mode: finnhubMode() },
    { provider: "twelvedata", role: "display + universe price history", mode: twelveDataMode() },
  ] as const;
}
