import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { APP } from "@/config/app";
import { log } from "@/lib/log";
import { ApiError, upstreamUnavailable } from "@/lib/errors";
import { normaliseDecimal, parseScaled } from "@/lib/money";
import { addDays, APP_TZ, todayIn } from "@/lib/time";
import { cached } from "../cache";
import { fxRate } from "../schema";
import { cbaProvider } from "./cba";
import { fawazahmedProvider, frankfurterProvider } from "./fallbacks";
import { forwardFill, type FxSeriesPoint } from "./forward-fill";
import type { FxLatestResult, FxObservation, FxProvider } from "./types";

/**
 * FX service (handover section 4): CBA is primary; fallback chain Frankfurter(providers=CBA) -> fawazahmed0
 * (latest only) -> last stored values (stale:true). Every value carries its source and source date.
 */
const ISOS = APP.fx.currencies;

export interface FxMeta {
  asOf: string;
  source: string;
  stale: boolean;
  isFixture: false;
  /** providers that failed before the one that answered, with the reason (for the runbook / QA) */
  fallbacks?: { provider: string; error: string }[];
  note?: string;
}

export interface Providers {
  primary: FxProvider;
  fallbacks: FxProvider[];
}
const defaultProviders: Providers = { primary: cbaProvider, fallbacks: [frankfurterProvider, fawazahmedProvider] };
let providers: Providers = defaultProviders;
/** tests inject mock providers */
export function setFxProviders(p: Providers | null): void {
  providers = p ?? defaultProviders;
}

const sourceLabel = (name: string) =>
  name === "CBA" ? "CBA" : name === "Frankfurter" ? "Frankfurter (CBA data)" : "fawazahmed0 (market rate, not the CBA reference rate)";

export function subtractDecimal(a: string, b: string): string {
  const x = parseScaled(a);
  const y = parseScaled(b);
  const scale = Math.max(x.scale, y.scale);
  const xi = x.int * 10n ** BigInt(scale - x.scale);
  const yi = y.int * 10n ** BigInt(scale - y.scale);
  const d = xi - yi;
  const neg = d < 0n;
  const s = (neg ? -d : d).toString().padStart(scale + 1, "0");
  const txt = scale > 0 ? `${s.slice(0, -scale)}.${s.slice(-scale)}` : s;
  return normaliseDecimal(neg && d !== 0n ? `-${txt}` : txt, 2);
}

/* ------------------------------------------------------------------ persistence */

/** Persist working-day rows (handover 4.4 step 5). A CBA row is never overwritten by a fallback row. */
export async function persistObservations(obs: FxObservation[], source: string): Promise<void> {
  if (obs.length === 0) return;
  const db = await getDb();
  await db
    .insert(fxRate)
    .values(obs.map((o) => ({ iso: o.iso, rateDate: o.date, rate: o.rate, amount: 1, diff: o.diff, source })))
    .onConflictDoUpdate({
      target: [fxRate.iso, fxRate.rateDate],
      set: { rate: sql`excluded.rate`, diff: sql`excluded.diff`, source: sql`excluded.source`, fetchedAt: sql`now()` },
      setWhere: sql`${fxRate.source} <> 'CBA' or excluded.source = 'CBA'`,
    });
}

async function storedObservations(from: string, to: string): Promise<FxObservation[]> {
  const db = await getDb();
  const rows = await db
    .select()
    .from(fxRate)
    .where(and(inArray(fxRate.iso, [...ISOS]), sql`${fxRate.rateDate} >= ${from} and ${fxRate.rateDate} <= ${to}`))
    .orderBy(fxRate.rateDate);
  return rows.map((r) => ({
    iso: r.iso,
    date: r.rateDate,
    rate: normaliseDecimal(String(r.rate), 2),
    diff: r.diff == null ? null : normaliseDecimal(String(r.diff), 2),
  }));
}

async function previousRates(iso: string, before: string): Promise<string | null> {
  const db = await getDb();
  const [row] = await db
    .select({ rate: fxRate.rate })
    .from(fxRate)
    .where(and(eq(fxRate.iso, iso), lt(fxRate.rateDate, before)))
    .orderBy(desc(fxRate.rateDate))
    .limit(1);
  return row ? normaliseDecimal(String(row.rate), 2) : null;
}

/* ------------------------------------------------------------------ chains */

interface LatestBlob {
  provider: string;
  currentDate: string;
  observations: FxObservation[];
  fallbacks: { provider: string; error: string }[];
}

async function fetchLatestChain(): Promise<LatestBlob> {
  const failures: { provider: string; error: string }[] = [];
  for (const p of [providers.primary, ...providers.fallbacks]) {
    try {
      const r: FxLatestResult = await p.latest(ISOS);
      // fill `diff` from stored history when the provider does not publish it
      const observations: FxObservation[] = [];
      for (const o of r.observations) {
        let diff = o.diff;
        if (diff == null) {
          const prev = await previousRates(o.iso, o.date).catch(() => null);
          if (prev) diff = subtractDecimal(o.rate, prev);
        }
        observations.push({ ...o, diff });
      }
      if (p.name !== "fawazahmed0") await persistObservations(observations, p.name).catch((e) => log.warn("fx persist failed", { message: String(e) }));
      if (failures.length) log.warn("fx latest served by fallback", { provider: p.name, failures });
      return { provider: p.name, currentDate: r.currentDate, observations, fallbacks: failures };
    } catch (e) {
      failures.push({ provider: p.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  throw new Error(`All FX providers failed: ${failures.map((f) => `${f.provider}: ${f.error}`).join(" | ")}`);
}

function latestFromBlob(blob: LatestBlob) {
  return {
    rates: ISOS.map((iso) => {
      const o = blob.observations.find((x) => x.iso === iso);
      if (!o) throw upstreamUnavailable(`No ${iso}/AMD rate available`);
      return { pair: `${iso}/AMD`, rate: o.rate, diff: o.diff, sourceDate: o.date };
    }),
  };
}

export async function getFxLatest(opts: { forceRefresh?: boolean } = {}) {
  try {
    const r = await cached<LatestBlob>("fx:latest:v1", { ttlMs: APP.cacheTtl.fxLatestMs, fetch: fetchLatestChain, forceRefresh: opts.forceRefresh });
    const meta: FxMeta = {
      asOf: r.fetchedAt.toISOString(),
      source: sourceLabel(r.value.provider),
      stale: r.stale,
      isFixture: false,
      ...(r.value.fallbacks.length ? { fallbacks: r.value.fallbacks } : {}),
      ...(r.value.provider === "fawazahmed0" ? { note: "Fallback market rate: differs slightly from the CBA official rate." } : {}),
      ...(r.stale ? { note: `Upstream refresh failed; showing the last good value. ${r.refreshError ?? ""}`.trim() } : {}),
    };
    return { data: latestFromBlob(r.value), meta };
  } catch (e) {
    // cache empty AND every provider failing: last resort = the rates we persisted earlier
    if (e instanceof ApiError && e.code === "UPSTREAM_UNAVAILABLE") {
      const today = todayIn(APP_TZ);
      const rows = await storedObservations(addDays(today, -60), today);
      const latestDate = rows.reduce((m, r) => (r.date > m ? r.date : m), "");
      if (latestDate) {
        const observations = rows.filter((r) => r.date === latestDate);
        if (ISOS.every((iso) => observations.some((o) => o.iso === iso))) {
          return {
            data: latestFromBlob({ provider: "stored", currentDate: latestDate, observations, fallbacks: [] }),
            meta: { asOf: new Date().toISOString(), source: "stored CBA history (all live providers unavailable)", stale: true, isFixture: false } as FxMeta,
          };
        }
      }
    }
    throw e;
  }
}

interface RangeBlob {
  provider: string;
  from: string;
  to: string;
  observations: FxObservation[];
  fallbacks: { provider: string; error: string }[];
}

async function fetchRangeChain(from: string, to: string): Promise<RangeBlob> {
  const failures: { provider: string; error: string }[] = [];
  for (const p of [providers.primary, ...providers.fallbacks]) {
    if (!p.range) continue;
    try {
      const observations = await p.range(from, to, ISOS);
      if (observations.length === 0) throw new Error("provider returned no rows");
      await persistObservations(observations, p.name).catch((e) => log.warn("fx persist failed", { message: String(e) }));
      return { provider: p.name, from, to, observations, fallbacks: failures };
    } catch (e) {
      failures.push({ provider: p.name, error: e instanceof Error ? e.message : String(e) });
    }
  }
  throw new Error(`All FX range providers failed: ${failures.map((f) => `${f.provider}: ${f.error}`).join(" | ")}`);
}

export const FX_PAIRS = ISOS.map((i) => `${i}/AMD`);

/** `days` calendar days ending today (Asia/Yerevan): exactly `days` points, weekends/holidays forward-filled. */
export async function getFxHistory(opts: { pair: string; days: number; today?: string; forceRefresh?: boolean }) {
  const iso = opts.pair.split("/")[0];
  const today = opts.today ?? todayIn(APP_TZ);
  const start = addDays(today, -(opts.days - 1));
  // One cached window covers every pair and every `days` <= maxDays (1 upstream call per TTL).
  const windowFrom = addDays(today, -(APP.fx.maxDays - 1) - APP.fx.historyPadDays);
  const key = `fx:range:v1:${today}`;
  let observations: FxObservation[];
  let meta: FxMeta;
  try {
    const r = await cached<RangeBlob>(key, {
      ttlMs: APP.cacheTtl.fxHistoryMs,
      fetch: () => fetchRangeChain(windowFrom, today),
      forceRefresh: opts.forceRefresh,
    });
    observations = r.value.observations;
    meta = {
      asOf: r.fetchedAt.toISOString(),
      source: sourceLabel(r.value.provider),
      stale: r.stale,
      isFixture: false,
      ...(r.value.fallbacks.length ? { fallbacks: r.value.fallbacks } : {}),
      ...(r.stale ? { note: `Upstream refresh failed; showing the last good value. ${r.refreshError ?? ""}`.trim() } : {}),
    };
  } catch (e) {
    if (!(e instanceof ApiError) || e.code !== "UPSTREAM_UNAVAILABLE") throw e;
    observations = await storedObservations(windowFrom, today);
    if (observations.length === 0) throw e;
    meta = { asOf: new Date().toISOString(), source: "stored CBA history (all live providers unavailable)", stale: true, isFixture: false };
  }
  const series: FxSeriesPoint[] = forwardFill(observations, iso, start, today);
  if (series.length !== opts.days) {
    throw upstreamUnavailable(`FX history for ${opts.pair} is incomplete (${series.length}/${opts.days} days available).`);
  }
  return { data: { pair: opts.pair, series }, meta };
}

/** Exact AMD -> USD conversion at the latest CBA USD rate (handover 4.4). */
export async function convertAmdToUsd(amountAmd: string) {
  const { data, meta } = await getFxLatest();
  const usd = data.rates.find((r) => r.pair === "USD/AMD")!;
  return { rate: usd.rate, rateDate: usd.sourceDate, meta, amountAmd };
}
