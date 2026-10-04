/**
 * Data health checks: pure rules that turn "when did this last succeed" into ok / warn / fail. They exist so a quiet failure (a weekly job
 * that stopped, a source that changed its page, a daily refresh that no longer runs) is noticed by the monitor instead of by a user.
 * Gathering the facts from the database is in health-run.ts; nothing here touches the network or the clock except through `now`.
 */
export type Level = "ok" | "warn" | "fail";
export interface Check {
  name: string;
  level: Level;
  detail: string;
}
export interface HealthReport {
  ok: boolean;
  checkedAt: string;
  checks: Check[];
}

/** how old things may get before the monitor complains (with slack for weekends, holidays and slow runs) */
export const LIMITS = {
  /** the S&P 500 snapshot is rebuilt weekly from Friday's prices, so its price date is 3-10 days old; 12 leaves a day or two of slack */
  snapshotMaxAgeDays: 12,
  snapshotMinCompanies: 300,
  /** the weekly job may run for hours; longer than this means it hung or was killed */
  universeJobMaxRunningHours: 8,
  /** the Vercel cron refreshes exchange rates, news and stock quotes once a day */
  dailyJobMaxAgeHours: 48,
  /** the CBA publishes on working days only; the New Year holidays are the longest gap */
  fxMaxPublishedAgeDays: 8,
  minBanks: 3,
} as const;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ok = (name: string, detail: string): Check => ({ name, level: "ok", detail });
const warn = (name: string, detail: string): Check => ({ name, level: "warn", detail });
const fail = (name: string, detail: string): Check => ({ name, level: "fail", detail });

const hoursAgo = (then: Date, now: Date) => Math.max(0, Math.round((now.getTime() - then.getTime()) / HOUR));
const daysBetween = (isoDate: string, now: Date) => Math.floor((now.getTime() - new Date(`${isoDate}T00:00:00Z`).getTime()) / DAY);

export function checkDatabase(reachable: boolean, error?: string): Check {
  return reachable ? ok("database", "reachable") : fail("database", `not reachable${error ? `: ${error}` : ""}`);
}

/** the recommendation data: the latest weekly snapshot of the S&P 500 */
export function checkSnapshot(s: { asOf: string; companies: number } | null, now: Date): Check {
  if (!s) return fail("recommendation snapshot", "none exists: the weekly universe job has never completed, so the Investment page has no data");
  const age = daysBetween(s.asOf, now);
  if (age > LIMITS.snapshotMaxAgeDays) return fail("recommendation snapshot", `prices are from ${s.asOf}, ${age} days ago (limit ${LIMITS.snapshotMaxAgeDays}): the weekly job is not producing new snapshots`);
  if (s.companies < LIMITS.snapshotMinCompanies) return fail("recommendation snapshot", `only ${s.companies} companies (expected at least ${LIMITS.snapshotMinCompanies}): the last build was incomplete`);
  return ok("recommendation snapshot", `${s.companies} companies, prices from ${s.asOf} (${age} days ago)`);
}

/** the last run of the weekly job itself (a failure here is reported even while the older snapshot is still fine) */
export function checkUniverseJob(last: { status: string; startedAt: Date; finishedAt: Date | null } | null, now: Date): Check {
  const name = "weekly universe job";
  if (!last) return warn(name, "no run recorded in this database yet");
  if (last.status === "ok") return ok(name, `last run finished ${last.finishedAt ? `${hoursAgo(last.finishedAt, now)} hours ago` : "(no finish time)"}`);
  if (last.status === "running") {
    const running = hoursAgo(last.startedAt, now);
    return running > LIMITS.universeJobMaxRunningHours ? fail(name, `still marked running after ${running} hours: it hung or was stopped`) : ok(name, `running for ${running} hours`);
  }
  return fail(name, `the last run ${last.status}${last.finishedAt ? ` ${hoursAgo(last.finishedAt, now)} hours ago` : ""}`);
}

export function checkFx(
  r: { latestRateDate: string | null; lastFetchedAt: Date | null; isosOnLatestDate: string[] },
  expectedIsos: readonly string[],
  now: Date,
): Check {
  const name = "exchange rates (CBA)";
  if (!r.latestRateDate || !r.lastFetchedAt) return fail(name, "no rates stored");
  const fetched = hoursAgo(r.lastFetchedAt, now);
  if (fetched > LIMITS.dailyJobMaxAgeHours) return fail(name, `last refreshed ${fetched} hours ago: the daily job is not running`);
  const published = daysBetween(r.latestRateDate, now);
  if (published > LIMITS.fxMaxPublishedAgeDays) return fail(name, `latest published rate is from ${r.latestRateDate} (${published} days ago)`);
  const missing = expectedIsos.filter((i) => !r.isosOnLatestDate.includes(i));
  if (missing.length) return fail(name, `missing currencies on ${r.latestRateDate}: ${missing.join(", ")}`);
  return ok(name, `${r.latestRateDate}, refreshed ${fetched} hours ago`);
}

/** news and stock quotes are refreshed by the daily cron and kept in the cache table */
export function checkDailyCache(name: string, fetchedAt: Date | null, now: Date): Check {
  if (!fetchedAt) return fail(name, "nothing stored: the daily job has not run, or its source is not configured");
  const h = hoursAgo(fetchedAt, now);
  return h > LIMITS.dailyJobMaxAgeHours ? fail(name, `last refreshed ${h} hours ago: the daily job is not running`) : ok(name, `refreshed ${h} hours ago`);
}

/** a LIVE test of the rate.am reader: it is the one source with no official API, so it is the likeliest to change under us */
export function checkBankRates(r: { ok: true; banks: { name: string; cash: number; nonCash: number }[]; stale: boolean } | { ok: false; error: string }): Check {
  const name = "bank rates (rate.am)";
  if (!r.ok) return fail(name, `could not read the page: ${r.error}`);
  if (r.stale) return fail(name, "the refresh failed and the last saved values are being shown (rate.am changed, is down, or blocks the server)");
  if (r.banks.length < LIMITS.minBanks) return fail(name, `only ${r.banks.length} banks found (expected ${LIMITS.minBanks}): ${r.banks.map((b) => b.name).join(", ")}`);
  const thin = r.banks.filter((b) => b.cash < 3 || b.nonCash < 2);
  if (thin.length) return fail(name, `too few currencies for: ${thin.map((b) => `${b.name} (cash ${b.cash}, non-cash ${b.nonCash})`).join(", ")}`);
  return ok(name, `${r.banks.length} banks, cash and non-cash rates read`);
}

export function checkEmail(configured: boolean): Check {
  return configured ? ok("password-reset email", "provider configured") : warn("password-reset email", "no email provider configured: reset emails are not sent");
}

export function summarise(checks: Check[], now: Date): HealthReport {
  return { ok: checks.every((c) => c.level !== "fail"), checkedAt: now.toISOString(), checks };
}

/** a short text for logs and the workflow summary */
export function formatReport(r: HealthReport): string {
  const icon = { ok: "OK  ", warn: "WARN", fail: "FAIL" } as const;
  return [`${r.ok ? "HEALTHY" : "PROBLEMS FOUND"} at ${r.checkedAt}`, ...r.checks.map((c) => `${icon[c.level]} ${c.name}: ${c.detail}`)].join("\n");
}
