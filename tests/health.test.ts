import fs from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { resetCache } from "./helpers/db";
import { mockFetch, type FetchMock } from "./helpers/fetch-mock";
import { board, flightPage, htmlRes, rateAmHost, T } from "./helpers/bank-page";
import { cacheEntry, fxRate, jobRun } from "@/market/schema";
import { writeSnapshotAtomic } from "@/market/universe/snapshot-store";
import { LIMITS, checkBankRates, checkDailyCache, checkDatabase, checkEmail, checkFx, checkSnapshot, checkUniverseJob, formatReport, summarise } from "@/ops/health";
import { runHealthChecks } from "@/ops/health-run";
import * as healthRoute from "@/app/api/health/data/route";

const NOW = new Date("2026-09-21T12:00:00Z");
const hoursBefore = (h: number) => new Date(NOW.getTime() - h * 3_600_000);

describe("health rules (pure)", () => {
  it("database", () => {
    expect(checkDatabase(true).level).toBe("ok");
    expect(checkDatabase(false, "timeout").detail).toContain("timeout");
    expect(checkDatabase(false).level).toBe("fail");
  });

  it("recommendation snapshot: missing, too old, too small, fine", () => {
    expect(checkSnapshot(null, NOW).level).toBe("fail");
    const old = checkSnapshot({ asOf: "2026-09-01", companies: 500 }, NOW); // 20 days
    expect(old.level).toBe("fail");
    expect(old.detail).toContain("2026-09-01");
    expect(checkSnapshot({ asOf: "2026-09-18", companies: 120 }, NOW).detail).toContain("only 120 companies");
    expect(checkSnapshot({ asOf: "2026-09-18", companies: 503 }, NOW).level).toBe("ok");
    // the weekly rhythm: built Monday from Friday's prices, the oldest it normally gets is 10 days
    expect(checkSnapshot({ asOf: "2026-09-11", companies: 503 }, NOW).level).toBe("ok"); // 10 days
    expect(checkSnapshot({ asOf: "2026-09-08", companies: 503 }, NOW).level).toBe("fail"); // 13 days
  });

  it("weekly universe job: ok, failed, hung, no record", () => {
    expect(checkUniverseJob(null, NOW).level).toBe("warn");
    expect(checkUniverseJob({ status: "ok", startedAt: hoursBefore(80), finishedAt: hoursBefore(78) }, NOW).level).toBe("ok");
    const failed = checkUniverseJob({ status: "failed", startedAt: hoursBefore(5), finishedAt: hoursBefore(4) }, NOW);
    expect(failed.level).toBe("fail");
    expect(failed.detail).toContain("failed");
    expect(checkUniverseJob({ status: "running", startedAt: hoursBefore(2), finishedAt: null }, NOW).level).toBe("ok");
    expect(checkUniverseJob({ status: "running", startedAt: hoursBefore(LIMITS.universeJobMaxRunningHours + 2), finishedAt: null }, NOW).level).toBe("fail");
  });

  it("exchange rates: stale refresh, long gap, missing currency, fine", () => {
    const isos = ["USD", "EUR", "GEL", "RUB"];
    const fine = { latestRateDate: "2026-09-18", lastFetchedAt: hoursBefore(8), isosOnLatestDate: isos };
    expect(checkFx(fine, isos, NOW).level).toBe("ok"); // Friday's rate on a Monday
    expect(checkFx({ ...fine, lastFetchedAt: hoursBefore(60) }, isos, NOW).detail).toContain("daily job is not running");
    expect(checkFx({ ...fine, latestRateDate: "2026-09-05" }, isos, NOW).level).toBe("fail");
    expect(checkFx({ ...fine, isosOnLatestDate: ["USD", "EUR", "RUB"] }, isos, NOW).detail).toContain("GEL");
    expect(checkFx({ latestRateDate: null, lastFetchedAt: null, isosOnLatestDate: [] }, isos, NOW).level).toBe("fail");
  });

  it("news / stock quotes: refreshed daily", () => {
    expect(checkDailyCache("news", hoursBefore(6), NOW).level).toBe("ok");
    expect(checkDailyCache("news", hoursBefore(70), NOW).level).toBe("fail");
    expect(checkDailyCache("stock quotes", null, NOW).detail).toContain("nothing stored");
  });

  it("bank rates: read fine, page changed, refresh failed, too few banks or currencies", () => {
    const bank = (name: string, cash = 4, nonCash = 3) => ({ name, cash, nonCash });
    expect(checkBankRates({ ok: true, stale: false, banks: [bank("A"), bank("B"), bank("C")] }).level).toBe("ok");
    expect(checkBankRates({ ok: false, error: "Rate.am page has an unexpected format" }).detail).toContain("unexpected format");
    expect(checkBankRates({ ok: true, stale: true, banks: [bank("A"), bank("B"), bank("C")] }).detail).toContain("last saved values");
    expect(checkBankRates({ ok: true, stale: false, banks: [bank("A"), bank("B")] }).detail).toContain("only 2 banks");
    expect(checkBankRates({ ok: true, stale: false, banks: [bank("A"), bank("B"), bank("C", 1, 0)] }).detail).toContain("C (cash 1, non-cash 0)");
  });

  it("email is only a warning; the report is ok unless a check FAILS", () => {
    expect(checkEmail(false).level).toBe("warn");
    expect(summarise([checkEmail(false), checkDatabase(true)], NOW).ok).toBe(true);
    const bad = summarise([checkDatabase(true), checkDatabase(false)], NOW);
    expect(bad.ok).toBe(false);
    expect(formatReport(bad)).toContain("PROBLEMS FOUND");
    expect(formatReport(bad)).toContain("FAIL database");
  });
});

/* ------------------------------------------------------------------ against the database */
const GOOD_BANKS = () =>
  flightPage({
    ameriabank: { lastUpdated: T, rates: { USD: { CASH: board("360", "365"), CLEARING: board("360", "365") }, EUR: { CASH: board("401", "415"), CLEARING: board("401", "415") }, RUR: { CASH: board("4.07", "4.4"), CLEARING: board("4.2", "4.45") }, GEL: { CASH: board("134", "144"), CLEARING: board("", "") } } },
    "acba-bank": { lastUpdated: T, rates: { USD: { CASH: board("360", "364"), CLEARING: board("360", "365") }, EUR: { CASH: board("402", "412"), CLEARING: board("402", "412") }, RUR: { CASH: board("4.1", "4.4"), CLEARING: board("4.2", "4.4") }, GEL: { CASH: board("137", "147"), CLEARING: board("137", "147") } } },
    "aydi-bank": { lastUpdated: T, rates: { USD: { CASH: board("360", "364"), CLEARING: board("360", "364") }, EUR: { CASH: board("403", "413"), CLEARING: board("403", "413") }, RUR: { CASH: board("4.1", "4.3"), CLEARING: board("4.2", "4.4") }, GEL: { CASH: board("136", "143"), CLEARING: board("136", "143") } } },
  });

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);

async function wipe() {
  const db = await getDb();
  await db.execute(sql`delete from market.snapshot_pointer`);
  await db.execute(sql`delete from market.snapshot`);
  await db.execute(sql`delete from market.fx_rate`);
  await db.execute(sql`delete from market.job_run`);
  await resetCache();
}

/** a healthy production-like state, dated relative to the real clock */
async function seedHealthy(opts: { snapshotAgeDays?: number; companies?: number } = {}) {
  const db = await getDb();
  await writeSnapshotAtomic(iso(daysAgo(opts.snapshotAgeDays ?? 3)), "v1", { records: Array.from({ length: opts.companies ?? 350 }, (_, i) => ({ symbol: `S${i}` })) } as never);
  await db.insert(fxRate).values(["USD", "EUR", "GEL", "RUB"].map((c) => ({ iso: c, rateDate: iso(daysAgo(1)), rate: "100", amount: 1, diff: null, source: "CBA" })));
  const fresh = { fetchedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), value: {} };
  await db.insert(cacheEntry).values([{ key: "news:v1", ...fresh }, { key: "stocks:quote:v1:NVDA", ...fresh }]);
  await db.insert(jobRun).values({ job: "universe", status: "ok", finishedAt: new Date() });
}

let mock: FetchMock | undefined;
beforeAll(async () => {
  await useTestDb();
});
beforeEach(wipe);
afterEach(() => {
  mock?.restore();
  delete process.env.CRON_SECRET;
});

const level = (r: Awaited<ReturnType<typeof runHealthChecks>>, name: string) => r.checks.find((c) => c.name === name)?.level;

describe("runHealthChecks against the database", () => {
  it("a healthy system passes (the missing email provider is only a warning)", async () => {
    await seedHealthy();
    mock = mockFetch(rateAmHost(() => htmlRes(GOOD_BANKS())));
    const r = await runHealthChecks();
    expect(r.checks.filter((c) => c.level === "fail")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.name)).toEqual(["database", "recommendation snapshot", "weekly universe job", "exchange rates (CBA)", "news", "stock quotes", "bank rates (rate.am)", "password-reset email"]);
    expect(level(r, "bank rates (rate.am)")).toBe("ok");
  });

  it("a snapshot that stopped being rebuilt is reported", async () => {
    await seedHealthy({ snapshotAgeDays: 25 });
    mock = mockFetch(rateAmHost(() => htmlRes(GOOD_BANKS())));
    const r = await runHealthChecks();
    expect(r.ok).toBe(false);
    expect(level(r, "recommendation snapshot")).toBe("fail");
    expect(level(r, "exchange rates (CBA)")).toBe("ok"); // the other checks are not hidden by it
  });

  it("an incomplete snapshot and a failed weekly job are reported", async () => {
    await seedHealthy({ companies: 40 });
    const db = await getDb();
    await db.insert(jobRun).values({ job: "universe", status: "failed", finishedAt: new Date() });
    mock = mockFetch(rateAmHost(() => htmlRes(GOOD_BANKS())));
    const r = await runHealthChecks();
    expect(level(r, "recommendation snapshot")).toBe("fail");
    expect(level(r, "weekly universe job")).toBe("fail");
  });

  it("rate.am changing its page (or going down) is reported by the live read", async () => {
    await seedHealthy();
    mock = mockFetch(rateAmHost(() => htmlRes("<html>we redesigned</html>")));
    const changed = await runHealthChecks();
    expect(level(changed, "bank rates (rate.am)")).toBe("fail");
    expect(changed.checks.find((c) => c.name === "bank rates (rate.am)")!.detail).toContain("unexpected format");
    mock.restore();
    await resetCache();
    await seedHealthyCachesOnly();
    mock = mockFetch(rateAmHost(() => htmlRes("nope", 500)));
    expect(level(await runHealthChecks(), "bank rates (rate.am)")).toBe("fail");
  });

  it("nothing refreshed for days (the daily cron stopped) and an empty database are reported", async () => {
    const db = await getDb();
    await seedHealthy();
    await db.execute(sql`update market.cache_entry set fetched_at = now() - interval '4 days'`);
    await db.execute(sql`update market.fx_rate set fetched_at = now() - interval '4 days'`);
    mock = mockFetch(rateAmHost(() => htmlRes(GOOD_BANKS())));
    const r = await runHealthChecks();
    expect(level(r, "news")).toBe("fail");
    expect(level(r, "stock quotes")).toBe("fail");
    expect(level(r, "exchange rates (CBA)")).toBe("fail");

    await wipe();
    const empty = await runHealthChecks();
    expect(empty.ok).toBe(false);
    expect(level(empty, "recommendation snapshot")).toBe("fail");
  });
});

async function seedHealthyCachesOnly() {
  const db = await getDb();
  const fresh = { fetchedAt: new Date(), expiresAt: new Date(Date.now() + 3_600_000), value: {} };
  await db.insert(cacheEntry).values([{ key: "news:v1", ...fresh }, { key: "stocks:quote:v1:NVDA", ...fresh }]).onConflictDoNothing();
}

describe("GET /api/health/data", () => {
  const get = (headers: Record<string, string> = {}) => call(healthRoute.GET, "GET", "/api/health/data", { headers });

  it("is protected like the job endpoints: no secret configured, no header, wrong secret and a missing 'Bearer ' prefix are all 403", async () => {
    expect((await get()).status).toBe(403);
    process.env.CRON_SECRET = "monitor-secret-0123456789abcdef";
    expect((await get()).status).toBe(403);
    expect((await get({ authorization: "Bearer wrong" })).status).toBe(403);
    expect((await get({ authorization: "monitor-secret-0123456789abcdef" })).status).toBe(403);
  });

  it("answers 200 with the report when healthy and 503 with the same report when something is wrong", async () => {
    process.env.CRON_SECRET = "monitor-secret-0123456789abcdef";
    const auth = { authorization: "Bearer monitor-secret-0123456789abcdef" };
    await seedHealthy();
    mock = mockFetch(rateAmHost(() => htmlRes(GOOD_BANKS())));
    const good = await get(auth);
    expect(good.status).toBe(200);
    expect(good.body.ok).toBe(true);
    expect(good.body.checks).toHaveLength(8);

    await wipe();
    const bad = await get(auth);
    expect(bad.status).toBe(503);
    expect(bad.body.ok).toBe(false);
    expect(bad.body.checks.find((c: { name: string }) => c.name === "recommendation snapshot").level).toBe("fail");
  });
});

describe("the daily monitor workflow", () => {
  const wf = fs.readFileSync(".github/workflows/monitor.yml", "utf8");
  it("runs every day, can be started by hand, uses the CRON_SECRET secret and calls the health endpoints", () => {
    expect(wf).toMatch(/cron: "\d+ \d+ \* \* \*"/);
    expect(wf).toContain("workflow_dispatch");
    expect(wf).toContain("secrets.CRON_SECRET");
    expect(wf).toContain("/api/health/data");
    expect(wf).toContain("/api/health");
    expect(wf).toMatch(/exit 1/); // a problem fails the run, which is what makes GitHub send the email
  });
});
