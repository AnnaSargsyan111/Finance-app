/**
 * READ-ONLY interface of the `market` module for the `invest` module (handover 1.1: invest -> market is read-only).
 * `invest` may import ONLY this file from `market` (enforced by tests/module-separation.test.ts).
 * Nothing here writes rows. Heavy upstream work only happens in the batch jobs; the FX read is the cached CBA read.
 */
import { and, asc, gte, inArray } from "drizzle-orm";
import { getDb } from "@/lib/db";
import type { Bar } from "@/lib/quant/derive";
import type { LoadedSnapshot } from "@/lib/quant/types";
import { getFxLatest } from "./fx/service";
import { priceDaily } from "./schema";
import { latestSnapshotPointer, loadSnapshotById } from "./universe/snapshot-store";

export type { LoadedSnapshot, SnapshotRecord, SnapshotPayload, Risk, Horizon, FactorName } from "@/lib/quant/types";
export type { Bar } from "@/lib/quant/derive";

export interface UsdAmdRate {
  /** AMD per 1 USD as decimal string */
  rate: string;
  rateDate: string;
  source: string;
  stale: boolean;
  asOf: string;
}

export async function readUsdAmdRate(): Promise<UsdAmdRate> {
  const { data, meta } = await getFxLatest();
  const usd = data.rates.find((r) => r.pair === "USD/AMD")!;
  return { rate: usd.rate, rateDate: usd.sourceDate, source: meta.source, stale: meta.stale, asOf: meta.asOf };
}

let memo: LoadedSnapshot | null = null;

/** The latest complete universe snapshot (null before the first successful nightly batch). Parsed copy is memoised per snapshot id. */
export async function readLatestSnapshot(): Promise<LoadedSnapshot | null> {
  const id = await latestSnapshotPointer();
  if (id === null) return null;
  if (memo && memo.id === id) return memo;
  memo = await loadSnapshotById(id);
  return memo;
}

/** Adjusted daily closes for several symbols from `fromDate` (inclusive), oldest first. */
export async function readPriceSeries(symbols: string[], fromDate: string): Promise<Map<string, Bar[]>> {
  const out = new Map<string, Bar[]>();
  if (symbols.length === 0) return out;
  const db = await getDb();
  const rows = await db
    .select()
    .from(priceDaily)
    .where(and(inArray(priceDaily.symbol, symbols), gte(priceDaily.date, fromDate)))
    .orderBy(asc(priceDaily.symbol), asc(priceDaily.date));
  for (const r of rows) {
    const list = out.get(r.symbol) ?? out.set(r.symbol, []).get(r.symbol)!;
    list.push({ date: r.date, close: r.close, adjClose: r.adjClose });
  }
  return out;
}
