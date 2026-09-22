import { desc, eq, sql } from "drizzle-orm";
import { getDb, type Db } from "@/lib/db";
import { snapshot, snapshotPointer } from "../schema";
import type { LoadedSnapshot, SnapshotPayload } from "./types";

/**
 * Atomic snapshot swap (handover 10.6): a complete snapshot row is written first, and only then the `latest`
 * pointer is flipped in one transaction, so readers never see a half-written snapshot.
 */
export async function writeSnapshotAtomic(asOf: string, methodologyVersion: string, payload: SnapshotPayload): Promise<number> {
  const db = await getDb();
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(snapshot).values({ asOf, methodologyVersion, payload: payload as never }).returning({ id: snapshot.id });
    await tx
      .insert(snapshotPointer)
      .values({ name: "latest", snapshotId: row.id })
      .onConflictDoUpdate({ target: snapshotPointer.name, set: { snapshotId: row.id, updatedAt: sql`now()` } });
    return row.id;
  });
}

async function loadById(db: Db, id: number): Promise<LoadedSnapshot | null> {
  const [row] = await db.select().from(snapshot).where(eq(snapshot.id, id)).limit(1);
  if (!row) return null;
  return {
    id: row.id,
    asOf: row.asOf,
    methodologyVersion: row.methodologyVersion,
    createdAt: new Date(row.createdAt).toISOString(),
    payload: row.payload as SnapshotPayload,
  };
}

/** The snapshot the `latest` pointer references (null before the first successful batch). */
export async function loadLatestSnapshot(): Promise<LoadedSnapshot | null> {
  const db = await getDb();
  const [ptr] = await db.select().from(snapshotPointer).where(eq(snapshotPointer.name, "latest")).limit(1);
  if (!ptr) return null;
  return loadById(db, ptr.snapshotId);
}

/** The snapshot BEFORE the current `latest` one (used by the stability rule). */
export async function loadPreviousSnapshot(): Promise<LoadedSnapshot | null> {
  const db = await getDb();
  const [ptr] = await db.select().from(snapshotPointer).where(eq(snapshotPointer.name, "latest")).limit(1);
  if (!ptr) return null;
  const [prev] = await db.select({ id: snapshot.id }).from(snapshot).where(sql`${snapshot.id} < ${ptr.snapshotId}`).orderBy(desc(snapshot.id)).limit(1);
  return prev ? loadById(db, prev.id) : null;
}

/** Keep only the newest N snapshots to bound storage on the free tier. */
export async function pruneSnapshots(keep = 5): Promise<number> {
  const db = await getDb();
  const res = await db.execute(sql`
    delete from market.snapshot where id not in (select id from market.snapshot order by id desc limit ${keep})
      and id not in (select snapshot_id from market.snapshot_pointer)`);
  return (res as unknown as { affectedRows?: number }).affectedRows ?? 0;
}

/** id the `latest` pointer references (cheap: one tiny row), or null before the first batch. */
export async function latestSnapshotPointer(): Promise<number | null> {
  const db = await getDb();
  const [ptr] = await db.select().from(snapshotPointer).where(eq(snapshotPointer.name, "latest")).limit(1);
  return ptr ? ptr.snapshotId : null;
}

export async function loadSnapshotById(id: number): Promise<LoadedSnapshot | null> {
  const db = await getDb();
  return loadById(db, id);
}
