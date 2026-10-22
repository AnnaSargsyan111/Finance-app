import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { user } from "@/auth/schema";
import { savedRecommendation } from "@/invest/schema";
import { recommendationWatch } from "./schema";

/**
 * The ONLY place in `watch` that touches the database. It writes only to watch.recommendation_watch, always scoped to the caller,
 * and only reads (never writes) the saved recommendations and the account's name and email.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** everything the check needs about one switched-on recommendation */
export interface WatchTarget {
  watchId: string;
  userId: string;
  recommendationId: string;
  /** the values reported last time (a WatchView), or null before the first email */
  baseline: unknown;
  result: Record<string, unknown>;
  snapshotDate: string;
  /** the account's own email: during the test phase every notification goes only here */
  email: string;
  firstName: string;
}

const targetColumns = {
  watchId: recommendationWatch.id,
  userId: recommendationWatch.userId,
  recommendationId: recommendationWatch.recommendationId,
  baseline: recommendationWatch.baseline,
  result: savedRecommendation.result,
  snapshotDate: savedRecommendation.snapshotDate,
  email: user.email,
  firstName: user.firstName,
};

const asTarget = (r: { [K in keyof typeof targetColumns]: unknown }): WatchTarget => r as unknown as WatchTarget;

/** the ids of the caller's saved recommendations that have the switch on */
export async function listWatchedIds(userId: string): Promise<string[]> {
  const db = await getDb();
  const rows = await db.select({ id: recommendationWatch.recommendationId }).from(recommendationWatch).where(eq(recommendationWatch.userId, userId));
  return rows.map((r) => r.id);
}

async function assertOwns(userId: string, recommendationId: string): Promise<void> {
  if (!UUID_RE.test(recommendationId)) throw notFound("Saved recommendation");
  const db = await getDb();
  const [row] = await db
    .select({ id: savedRecommendation.id })
    .from(savedRecommendation)
    .where(and(eq(savedRecommendation.id, recommendationId), eq(savedRecommendation.userId, userId)))
    .limit(1);
  if (!row) throw notFound("Saved recommendation");
}

/** switch on (idempotent) or off; 404 when the recommendation is not the caller's */
export async function setWatch(userId: string, recommendationId: string, enabled: boolean): Promise<void> {
  await assertOwns(userId, recommendationId);
  const db = await getDb();
  if (enabled) {
    await db.insert(recommendationWatch).values({ userId, recommendationId }).onConflictDoNothing();
  } else {
    await db.delete(recommendationWatch).where(and(eq(recommendationWatch.userId, userId), eq(recommendationWatch.recommendationId, recommendationId)));
  }
}

/** switch off by watch id (the "Stop these emails" link); false when there was nothing to stop */
export async function stopWatchById(watchId: string): Promise<boolean> {
  if (!UUID_RE.test(watchId)) return false;
  const db = await getDb();
  const del = await db.delete(recommendationWatch).where(eq(recommendationWatch.id, watchId)).returning({ id: recommendationWatch.id });
  return del.length > 0;
}

function joined(db: Awaited<ReturnType<typeof getDb>>) {
  return db
    .select(targetColumns)
    .from(recommendationWatch)
    .innerJoin(savedRecommendation, and(eq(savedRecommendation.id, recommendationWatch.recommendationId), eq(savedRecommendation.userId, recommendationWatch.userId)))
    .innerJoin(user, eq(user.id, recommendationWatch.userId));
}

/** one watch of the caller (the "send me a test now" button); 404 when the switch is not on */
export async function loadTarget(userId: string, recommendationId: string): Promise<WatchTarget> {
  if (!UUID_RE.test(recommendationId)) throw notFound("Saved recommendation");
  const db = await getDb();
  const [row] = await joined(db)
    .where(and(eq(recommendationWatch.userId, userId), eq(recommendationWatch.recommendationId, recommendationId)))
    .limit(1);
  if (!row) throw notFound("Notification");
  return asTarget(row);
}

/** every switched-on watch (for the scheduled check) */
export async function loadAllTargets(): Promise<WatchTarget[]> {
  const db = await getDb();
  return (await joined(db)).map(asTarget);
}

/** remember that a check happened; with `baseline` the new values become what the next comparison starts from (set only when an email went out) */
export async function recordCheck(watchId: string, opts: { baseline?: unknown; emailed: boolean }, now = new Date()): Promise<void> {
  const db = await getDb();
  await db
    .update(recommendationWatch)
    .set({
      lastCheckedAt: now,
      ...(opts.emailed ? { lastEmailedAt: now } : {}),
      ...(opts.baseline !== undefined ? { baseline: opts.baseline as never } : {}),
    })
    .where(eq(recommendationWatch.id, watchId));
}
