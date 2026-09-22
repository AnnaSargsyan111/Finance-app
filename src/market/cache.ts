import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { APP } from "@/config/app";
import { upstreamUnavailable } from "@/lib/errors";
import { log } from "@/lib/log";
import { cacheEntry, cacheLock } from "./schema";

/**
 * Postgres-backed cache with stale-while-revalidate semantics and lock-guarded refresh (handover 1.4).
 *
 *  fresh entry             -> returned as is (stale:false), no upstream call
 *  expired / missing entry -> ONE caller refreshes: in-process single-flight + a DB lease lock (market.cache_lock),
 *                             everybody else waits for the refreshed value (so N concurrent users = 1 upstream call per TTL)
 *  refresh fails           -> last good value is served with stale:true (up to maxStaleMs); the failure is remembered
 *                             for `failBackoffMs` so a broken upstream is not hammered by every request.
 * Works on serverless: state lives in the database, not in process memory. (The lock is a lease row, not a
 * session advisory lock, so it is also safe behind Neon's pooled/transaction-mode connections.)
 */
export interface CacheResult<T> {
  value: T;
  fetchedAt: Date;
  expiresAt: Date;
  /** true = upstream refresh failed and this is the last good value */
  stale: boolean;
  /** what happened on this call */
  source: "cache" | "refreshed" | "waited" | "stale-fallback";
  refreshError?: string;
}

export interface CachedOptions<T> {
  ttlMs: number;
  fetch: () => Promise<T>;
  /** ignore a fresh entry (still respects `minAgeMs`) */
  forceRefresh?: boolean;
  /** with forceRefresh: keep the entry if it is younger than this */
  minAgeMs?: number;
  maxStaleMs?: number;
  failBackoffMs?: number;
  /** tests: bypass the in-process single-flight to exercise the DB lock path */
  singleflight?: boolean;
  now?: () => Date;
}

const inflight = new Map<string, Promise<CacheResult<unknown>>>();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Entry = { value: unknown; fetchedAt: Date; expiresAt: Date };

async function readEntry(key: string): Promise<Entry | null> {
  const db = await getDb();
  const [row] = await db.select().from(cacheEntry).where(eq(cacheEntry.key, key)).limit(1);
  return row ? { value: row.value, fetchedAt: new Date(row.fetchedAt), expiresAt: new Date(row.expiresAt) } : null;
}

export async function writeEntry(key: string, value: unknown, ttlMs: number, now = new Date()): Promise<void> {
  const db = await getDb();
  const expiresAt = new Date(now.getTime() + ttlMs);
  await db
    .insert(cacheEntry)
    .values({ key, value: value as never, fetchedAt: now, expiresAt })
    .onConflictDoUpdate({ target: cacheEntry.key, set: { value: value as never, fetchedAt: now, expiresAt } });
}

export async function peek<T>(key: string): Promise<{ value: T; fetchedAt: Date; expiresAt: Date } | null> {
  const e = await readEntry(key);
  return e ? { value: e.value as T, fetchedAt: e.fetchedAt, expiresAt: e.expiresAt } : null;
}

export async function deleteEntry(key: string): Promise<void> {
  const db = await getDb();
  await db.delete(cacheEntry).where(eq(cacheEntry.key, key));
}

async function tryAcquire(key: string, owner: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.execute(sql`
    insert into market.cache_lock (key, locked_until, owner)
    values (${key}, now() + (${APP.lock.leaseMs} * interval '1 millisecond'), ${owner})
    on conflict (key) do update
      set locked_until = excluded.locked_until, owner = excluded.owner
      where market.cache_lock.locked_until < now()
    returning owner`);
  return (res.rows as { owner: string }[]).some((r) => r.owner === owner);
}

async function release(key: string, owner: string): Promise<void> {
  const db = await getDb();
  await db.execute(sql`delete from market.cache_lock where key = ${key} and owner = ${owner}`);
}

export async function cached<T>(key: string, opts: CachedOptions<T>): Promise<CacheResult<T>> {
  const now = opts.now ?? (() => new Date());
  const maxStaleMs = opts.maxStaleMs ?? APP.cacheTtl.maxStaleMs;

  const isFresh = (e: Entry | null) => {
    if (!e) return false;
    if (opts.forceRefresh) return opts.minAgeMs !== undefined && now().getTime() - e.fetchedAt.getTime() < opts.minAgeMs;
    return now() < e.expiresAt;
  };

  const first = await readEntry(key);
  if (first && isFresh(first)) {
    return { value: first.value as T, fetchedAt: first.fetchedAt, expiresAt: first.expiresAt, stale: false, source: "cache" };
  }

  const useSingleflight = opts.singleflight !== false;
  if (useSingleflight) {
    const existing = inflight.get(key);
    if (existing) return (await existing) as CacheResult<T>;
  }
  const work = refresh<T>(key, opts, now, maxStaleMs, isFresh).finally(() => {
    if (inflight.get(key) === work) inflight.delete(key);
  });
  if (useSingleflight) inflight.set(key, work as Promise<CacheResult<unknown>>);
  return work;
}

async function refresh<T>(
  key: string,
  opts: CachedOptions<T>,
  now: () => Date,
  maxStaleMs: number,
  isFresh: (e: Entry | null) => boolean,
): Promise<CacheResult<T>> {
  const owner = randomUUID();
  const backoffKey = `${key}#fail`;
  const backoffMs = opts.failBackoffMs ?? 30_000;

  const fallback = (e: Entry | null, err: string): CacheResult<T> => {
    if (e && now().getTime() - e.fetchedAt.getTime() <= maxStaleMs) {
      return { value: e.value as T, fetchedAt: e.fetchedAt, expiresAt: e.expiresAt, stale: true, source: "stale-fallback", refreshError: err };
    }
    throw upstreamUnavailable("The data source is temporarily unavailable.", { reason: err });
  };

  const deadline = Date.now() + APP.lock.waitMaxMs;
  // acquire the lease, or wait for whoever holds it to publish a value
  for (;;) {
    const before = await readEntry(key);
    // someone else may have refreshed while we were queued
    if (before && isFresh(before)) {
      return { value: before.value as T, fetchedAt: before.fetchedAt, expiresAt: before.expiresAt, stale: false, source: "waited" };
    }
    if (await tryAcquire(key, owner)) {
      try {
        const again = await readEntry(key);
        if (again && isFresh(again)) {
          return { value: again.value as T, fetchedAt: again.fetchedAt, expiresAt: again.expiresAt, stale: false, source: "waited" };
        }
        // recent failure: do not hammer a broken upstream
        const failed = await readEntry(backoffKey);
        if (failed && now() < failed.expiresAt) {
          return fallback(again, String((failed.value as { message?: string })?.message ?? "recent upstream failure"));
        }
        try {
          const value = await opts.fetch();
          const at = now();
          await writeEntry(key, value, opts.ttlMs, at);
          return { value, fetchedAt: at, expiresAt: new Date(at.getTime() + opts.ttlMs), stale: false, source: "refreshed" };
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          log.warn("cache refresh failed; serving last good value if any", { key, message: msg });
          await writeEntry(backoffKey, { message: msg }, backoffMs, now());
          return fallback(again, msg);
        }
      } finally {
        await release(key, owner);
      }
    }
    if (Date.now() >= deadline) {
      return fallback(await readEntry(key), "timed out waiting for another refresh");
    }
    await sleep(APP.lock.waitPollMs);
  }
}

/**
 * Atomic "at most one per window" gate stored in market.cache_entry (used for the per-user news refresh throttle).
 * Returns { allowed: true } and starts a new window, or { allowed: false, retryAfterSeconds }.
 */
export async function throttle(key: string, windowMs: number): Promise<{ allowed: boolean; retryAfterSeconds: number }> {
  const db = await getDb();
  const res = await db.execute(sql`
    insert into market.cache_entry (key, value, fetched_at, expires_at)
    values (${key}, '{}'::jsonb, now(), now() + (${windowMs} * interval '1 millisecond'))
    on conflict (key) do update
      set fetched_at = now(), expires_at = now() + (${windowMs} * interval '1 millisecond')
      where market.cache_entry.expires_at <= now()
    returning key`);
  if (res.rows.length > 0) return { allowed: true, retryAfterSeconds: 0 };
  const e = await readEntry(key);
  const retry = e ? Math.max(1, Math.ceil((e.expiresAt.getTime() - Date.now()) / 1000)) : Math.ceil(windowMs / 1000);
  return { allowed: false, retryAfterSeconds: retry };
}
