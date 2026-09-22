import { and, asc, desc, eq, gte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { NotConfiguredError } from "@/lib/errors";
import { log } from "@/lib/log";
import { universeConfig } from "@/lib/quant/config";
import type { Bar } from "@/lib/quant/derive";
import { addDays, diffDays } from "@/lib/time";
import { twelveData, twelveDataMode } from "../providers/keyed";
import { fetchYahooChart, type YahooRange } from "../providers/yahoo";
import { priceDaily } from "../schema";

/**
 * Daily price history for the universe + benchmark. Provider chain from methodology: Twelve Data (live | fixture, unverified,
 * needs a key) then Yahoo v8/chart (prototype-only). Bars are upserted into market.price_daily; incremental runs only fetch
 * the recent window when history already exists.
 */
export interface BarsResult {
  symbol: string;
  source: string;
  fetched: number;
  error?: string;
}

export async function storedBars(symbol: string, fromDate?: string): Promise<Bar[]> {
  const db = await getDb();
  const where = fromDate ? and(eq(priceDaily.symbol, symbol), gte(priceDaily.date, fromDate)) : eq(priceDaily.symbol, symbol);
  const rows = await db.select().from(priceDaily).where(where).orderBy(asc(priceDaily.date));
  return rows.map((r) => ({ date: r.date, close: r.close, adjClose: r.adjClose }));
}

export async function lastStoredDate(symbol: string): Promise<string | null> {
  const db = await getDb();
  const [r] = await db.select({ d: priceDaily.date }).from(priceDaily).where(eq(priceDaily.symbol, symbol)).orderBy(desc(priceDaily.date)).limit(1);
  return r?.d ?? null;
}

async function upsertBars(symbol: string, bars: (Bar & { volume?: number | null })[], source: string): Promise<void> {
  const db = await getDb();
  for (let i = 0; i < bars.length; i += 500) {
    const chunk = bars.slice(i, i + 500);
    await db
      .insert(priceDaily)
      .values(chunk.map((b) => ({ symbol, date: b.date, close: b.close, adjClose: b.adjClose, volume: b.volume ?? null, source })))
      .onConflictDoUpdate({
        target: [priceDaily.symbol, priceDaily.date],
        set: {
          close: sqlEx("close"),
          adjClose: sqlEx("adj_close"),
          volume: sqlEx("volume"),
          source: sqlEx("source"),
        },
      });
  }
}
import { sql } from "drizzle-orm";
const sqlEx = (c: string) => sql.raw(`excluded."${c}"`);

const rangeFor = (years: number): YahooRange => (years <= 1 ? "1y" : years <= 2 ? "2y" : "5y");

/** Fetch (and store) bars for one symbol. Never throws: failures come back in `error` so one bad symbol cannot stop a batch. */
export async function refreshBars(symbol: string, opts: { now: Date; forceFull?: boolean }): Promise<BarsResult> {
  const cfg = universeConfig().priceHistory;
  const last = opts.forceFull ? null : await lastStoredDate(symbol);
  const today = opts.now.toISOString().slice(0, 10);
  const incremental = last !== null && diffDays(today, last) <= cfg.incrementalMaxGapDays;
  const errors: string[] = [];
  for (const provider of cfg.providers) {
    try {
      if (provider === "twelvedata") {
        if (twelveDataMode() === "notConfigured") throw new NotConfiguredError("twelvedata");
        const size = incremental ? 40 : Math.round(cfg.years * cfg.tradingDaysPerYear) + 30;
        const series = await twelveData.timeSeries(symbol, size);
        if (series.length < 5) throw new Error("too few points");
        await upsertBars(symbol, series.map((s) => ({ date: s.date, close: s.close, adjClose: s.close })), twelveDataMode() === "fixture" ? "fixture:twelvedata" : "twelvedata");
        return { symbol, source: twelveDataMode() === "fixture" ? "fixture:twelvedata" : "twelvedata", fetched: series.length };
      }
      const chart = await fetchYahooChart(symbol, incremental ? "1mo" : rangeFor(cfg.years));
      if (chart.bars.length < 5) throw new Error("too few points");
      await upsertBars(symbol, chart.bars.map((b) => ({ date: b.date, close: b.close, adjClose: b.adjClose, volume: b.volume })), "yahoo-prototype");
      return { symbol, source: "yahoo-prototype", fetched: chart.bars.length };
    } catch (e) {
      if (!(e instanceof NotConfiguredError)) errors.push(`${provider}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log.warn("price refresh failed", { symbol, errors });
  return { symbol, source: "none", fetched: 0, error: errors.join(" | ") || "no provider configured" };
}

export const windowStart = (now: Date, years: number) => addDays(now.toISOString().slice(0, 10), -Math.round(years * 366));
