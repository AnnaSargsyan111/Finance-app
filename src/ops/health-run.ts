import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { APP } from "@/config/app";
import { emailStatus } from "@/auth/email";
import { fetchBankRates } from "@/market/fx/bank-rates";
import { checkBankRates, checkDailyCache, checkDatabase, checkEmail, checkFx, checkSnapshot, checkUniverseJob, summarise, type Check, type HealthReport } from "./health";

/**
 * Collects the facts the health rules need (from the database, plus one live read of the bank-rate page) and applies the rules. Every
 * gathering step is guarded on its own, so one broken check is reported as a failure and never hides the others.
 */
const toDate = (v: unknown): Date | null => {
  if (v instanceof Date) return v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
};
const message = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 200);

async function guarded(name: string, run: () => Promise<Check>): Promise<Check> {
  try {
    return await run();
  } catch (e) {
    return { name, level: "fail", detail: `the check itself failed: ${message(e)}` };
  }
}

export async function runHealthChecks(now: Date = new Date()): Promise<HealthReport> {
  const checks: Check[] = [];

  let db: Awaited<ReturnType<typeof getDb>> | null = null;
  try {
    db = await getDb();
    await db.execute(sql`select 1`);
    checks.push(checkDatabase(true));
  } catch (e) {
    checks.push(checkDatabase(false, message(e)));
  }

  if (db) {
    const d = db;
    checks.push(
      await guarded("recommendation snapshot", async () => {
        const res = await d.execute(sql`
          select s.as_of::text as as_of, jsonb_array_length(s.payload->'records') as companies
          from market.snapshot s join market.snapshot_pointer p on p.snapshot_id = s.id
          where p.name = 'latest'`);
        const row = res.rows[0] as { as_of?: string; companies?: number | string } | undefined;
        return checkSnapshot(row?.as_of ? { asOf: row.as_of, companies: Number(row.companies ?? 0) } : null, now);
      }),
      await guarded("weekly universe job", async () => {
        const res = await d.execute(sql`select status, started_at, finished_at from market.job_run where job = 'universe' order by id desc limit 1`);
        const row = res.rows[0] as { status?: string; started_at?: unknown; finished_at?: unknown } | undefined;
        const started = toDate(row?.started_at);
        return checkUniverseJob(row?.status && started ? { status: row.status, startedAt: started, finishedAt: toDate(row.finished_at) } : null, now);
      }),
      await guarded("exchange rates (CBA)", async () => {
        const res = await d.execute(sql`
          select (select max(rate_date)::text from market.fx_rate) as latest,
                 (select max(fetched_at) from market.fx_rate) as fetched`);
        const row = res.rows[0] as { latest?: string | null; fetched?: unknown };
        let isos: string[] = [];
        if (row.latest) {
          const r2 = await d.execute(sql`select iso from market.fx_rate where rate_date = ${row.latest}`);
          isos = (r2.rows as { iso: string }[]).map((x) => x.iso);
        }
        return checkFx({ latestRateDate: row.latest ?? null, lastFetchedAt: toDate(row.fetched), isosOnLatestDate: isos }, APP.fx.currencies, now);
      }),
      await guarded("news", async () => {
        const res = await d.execute(sql`select max(fetched_at) as f from market.cache_entry where key = 'news:v1'`);
        return checkDailyCache("news", toDate((res.rows[0] as { f?: unknown } | undefined)?.f), now);
      }),
      await guarded("stock quotes", async () => {
        const res = await d.execute(sql`select max(fetched_at) as f from market.cache_entry where key like 'stocks:quote:v1:%'`);
        return checkDailyCache("stock quotes", toDate((res.rows[0] as { f?: unknown } | undefined)?.f), now);
      }),
    );
  }

  // a live read of the rate.am page, bypassing the cache, so a cached copy cannot hide a broken reader and a failure names its real cause
  checks.push(
    await guarded("bank rates (rate.am)", async () => {
      try {
        const banks = await fetchBankRates();
        return checkBankRates({ ok: true, stale: false, banks: banks.map((b) => ({ name: b.name, cash: b.cash.length, nonCash: b.nonCash.length })) });
      } catch (e) {
        return checkBankRates({ ok: false, error: message(e) });
      }
    }),
  );

  checks.push(checkEmail(emailStatus().configured));
  return summarise(checks, now);
}
