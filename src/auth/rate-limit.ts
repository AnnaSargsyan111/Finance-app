import { and, count, eq, gt, lt, min, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ApiError } from "@/lib/errors";
import { rateEvent } from "./schema";

/**
 * Sliding-window abuse control backed by Postgres (works on serverless: no in-memory state).
 * Events are recorded explicitly (e.g. only FAILED logins), then `enforce` compares the count in the window.
 */
export async function windowState(scope: string, key: string, windowMs: number, now = new Date()) {
  const db = await getDb();
  const since = new Date(now.getTime() - windowMs);
  const [row] = await db
    .select({ n: count(), oldest: min(rateEvent.occurredAt) })
    .from(rateEvent)
    .where(and(eq(rateEvent.scope, scope), eq(rateEvent.key, key), gt(rateEvent.occurredAt, since)));
  const oldest = row?.oldest ? new Date(row.oldest) : null;
  return { count: Number(row?.n ?? 0), oldest };
}

export async function recordEvent(scope: string, key: string, now = new Date()): Promise<void> {
  const db = await getDb();
  await db.insert(rateEvent).values({ scope, key, occurredAt: now });
  // opportunistic housekeeping (keeps the table small on serverless without a cron)
  if (Math.random() < 0.02) {
    await db.delete(rateEvent).where(lt(rateEvent.occurredAt, new Date(now.getTime() - 24 * 3600_000)));
  }
}

export async function enforceLimit(opts: {
  scope: string;
  key: string;
  limit: number;
  windowMs: number;
  now?: Date;
}): Promise<void> {
  const now = opts.now ?? new Date();
  const st = await windowState(opts.scope, opts.key, opts.windowMs, now);
  if (st.count >= opts.limit) {
    const retryAfterSeconds = st.oldest
      ? Math.max(1, Math.ceil((st.oldest.getTime() + opts.windowMs - now.getTime()) / 1000))
      : Math.ceil(opts.windowMs / 1000);
    throw new ApiError("RATE_LIMITED", 429, "Too many attempts. Please try again later.", undefined, { retryAfterSeconds });
  }
}

/** Test/admin helper. */
export async function clearRateEvents(scope?: string): Promise<void> {
  const db = await getDb();
  if (scope) await db.delete(rateEvent).where(eq(rateEvent.scope, scope));
  else await db.execute(sql`delete from auth.rate_event`);
}
