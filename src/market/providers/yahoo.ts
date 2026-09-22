import { getEnv } from "@/lib/env";
import { NotConfiguredError, UpstreamError } from "@/lib/errors";
import { epochToDate } from "@/lib/time";
import { fetchText } from "../http";

/**
 * Yahoo Finance `v8/chart` (keyless, UNOFFICIAL). PROTOTYPE-ONLY fallback (handover 5.2/8.2):
 * Yahoo's terms forbid automated access and substitute services, so this must be replaced by a licensed feed
 * before any real launch. It is disabled with ALLOW_YAHOO_PROTOTYPE=false and every value it produces is
 * labelled "Yahoo chart (prototype)".
 */
export const YAHOO_LABEL = "Yahoo chart (prototype only, unofficial)";

export interface YahooBar {
  date: string;
  close: number;
  adjClose: number;
  volume: number | null;
}

export interface YahooChart {
  symbol: string;
  currency: string | null;
  name: string | null;
  price: number | null;
  /** ISO timestamp of the last trade Yahoo reports */
  priceTime: string | null;
  previousClose: number | null;
  high52w: number | null;
  low52w: number | null;
  bars: YahooBar[];
}

export type YahooRange = "5d" | "1mo" | "3mo" | "6mo" | "1y" | "2y" | "5y";

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Pure parser (exported for tests against recorded responses). */
export function parseYahooChart(json: unknown, symbol: string): YahooChart {
  const root = json as { chart?: { result?: unknown[]; error?: { description?: string } | null } };
  if (root?.chart?.error) throw new UpstreamError("yahoo", `Yahoo error for ${symbol}: ${root.chart.error.description ?? "unknown"}`, undefined, false);
  const r = root?.chart?.result?.[0] as
    | {
        meta?: Record<string, unknown>;
        timestamp?: number[];
        indicators?: { quote?: { close?: (number | null)[]; volume?: (number | null)[] }[]; adjclose?: { adjclose?: (number | null)[] }[] };
      }
    | undefined;
  if (!r?.meta) throw new UpstreamError("yahoo", `Yahoo returned no data for ${symbol}`);
  const ts = r.timestamp ?? [];
  const closes = r.indicators?.quote?.[0]?.close ?? [];
  const vols = r.indicators?.quote?.[0]?.volume ?? [];
  const adj = r.indicators?.adjclose?.[0]?.adjclose ?? [];
  const bars: YahooBar[] = [];
  for (let i = 0; i < ts.length; i++) {
    const c = num(closes[i]);
    if (c === null) continue;
    bars.push({ date: epochToDate(ts[i], "America/New_York"), close: c, adjClose: num(adj[i]) ?? c, volume: num(vols[i]) });
  }
  // de-duplicate same-date bars (Yahoo can append a live bar for "today"): keep the last one
  const byDate = new Map<string, YahooBar>();
  for (const b of bars) byDate.set(b.date, b);
  const clean = [...byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const m = r.meta;
  const price = num(m.regularMarketPrice);
  const priceTime = num(m.regularMarketTime);
  // previous close = the bar BEFORE the latest one (chartPreviousClose is the close before the whole range, not yesterday)
  let previousClose: number | null = clean.length >= 2 ? clean[clean.length - 2].close : null;
  if (previousClose === null && price !== null && num(m.fulldayChange) !== null) previousClose = Math.round((price - (m.fulldayChange as number)) * 1e4) / 1e4;
  return {
    symbol,
    currency: typeof m.currency === "string" ? m.currency : null,
    name: typeof m.longName === "string" ? m.longName : typeof m.shortName === "string" ? m.shortName : null,
    price,
    priceTime: priceTime !== null ? new Date(priceTime * 1000).toISOString() : null,
    previousClose,
    high52w: num(m.fiftyTwoWeekHigh),
    low52w: num(m.fiftyTwoWeekLow),
    bars: clean,
  };
}

const yahooSymbol = (s: string) => s.replace(/\./g, "-");

export async function fetchYahooChart(symbol: string, range: YahooRange): Promise<YahooChart> {
  const env = getEnv();
  if (!env.ALLOW_YAHOO_PROTOTYPE) throw new NotConfiguredError("yahoo", "Yahoo prototype fallback is disabled (ALLOW_YAHOO_PROTOTYPE=false)");
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol(symbol))}?range=${range}&interval=1d&includeAdjustedClose=true`;
  const text = await fetchText(url, { provider: "yahoo", timeoutMs: 15_000, retries: 1 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new UpstreamError("yahoo", "Yahoo returned invalid JSON");
  }
  return parseYahooChart(json, symbol);
}
