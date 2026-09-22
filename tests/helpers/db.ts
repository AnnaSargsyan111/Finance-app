import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

/** Empty the shared market cache/lock tables between tests. */
export async function resetCache() {
  const db = await getDb();
  await db.execute(sql`delete from market.cache_entry`);
  await db.execute(sql`delete from market.cache_lock`);
}

export async function tableCounts(): Promise<Record<string, number>> {
  const db = await getDb();
  const res = await db.execute(sql`
    select schemaname || '.' || relname as t
    from pg_stat_user_tables where schemaname in ('auth','pf','market','invest') order by 1`);
  const out: Record<string, number> = {};
  for (const r of res.rows as { t: string }[]) {
    const c = await db.execute(sql.raw(`select count(*)::int as n from ${r.t}`));
    out[r.t] = Number((c.rows[0] as { n: number }).n);
  }
  return out;
}
