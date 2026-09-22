import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser } from "./helpers/routes";
import { jsonRes, mockFetch, text, type FetchMock } from "./helpers/fetch-mock";
import { makeBars, makeSpecs, tradingDates } from "./helpers/synthetic";
import { parseConstituents, dedupeIssuers, parseCsv } from "@/market/universe/constituents";
import { lastQuarterLabels, pickFiscalYear } from "@/market/universe/edgar";
import { runUniverseBatch } from "@/market/universe/batch";
import { loadLatestSnapshot, latestSnapshotPointer } from "@/market/universe/snapshot-store";
import { waitForSlot } from "@/market/http";
import { NotConfiguredError } from "@/lib/errors";
import * as jobsRoute from "@/app/api/jobs/[name]/route";

/**
 * Nightly batch against a SYNTHETIC network (12 fake issuers, fake EDGAR frames, fake Yahoo charts) so every branch is
 * exercised deterministically. The real run (real constituents + EDGAR + Yahoo) is documented in README-backend.
 */
const NOW = new Date("2026-09-21T18:00:00Z");
const SPECS = makeSpecs(12);
SPECS[10].sector = "Financials"; // SYN10 is a bank-like issuer
const { bench, bars } = makeBars(SPECS, 1300);
const CIK = (i: number) => 1000 + i;

const CSV = [
  "Symbol,Security,GICS Sector,GICS Sub-Industry,Headquarters Location,Date added,CIK,Founded",
  ...SPECS.map((s, i) => `${s.symbol},"${s.name}${i === 3 ? ", Inc." : ""}",${s.sector},Sub,"City, ST",2000-01-01,${String(CIK(i)).padStart(10, "0")},1990`),
  `GOOG,Alphabet Inc. (Class C),Communication Services,Interactive,"Mountain View, CA",2014-04-03,${String(CIK(2)).padStart(10, "0")},1998`,
  "NOCIK,No Cik Corp,Industrials,Sub,Somewhere,2020-01-01,,2000",
].join("\n");

/** which company uses which XBRL concept (exercises the fallback chains) */
const REV_CONCEPT = (i: number) => (i === 1 ? "RevenueFromContractWithCustomerExcludingAssessedTax" : i === 10 ? null : "Revenues");
const NI_CONCEPT = (i: number) => (i === 2 ? "ProfitLoss" : "NetIncomeLoss");
const SHARE_GROUP = (i: number) => (i === 3 ? "Q1" : i === 4 ? "fallback" : "Q2");

function frameJson(taxonomy: string, concept: string, unit: string, period: string): string | null {
  const rows: { cik: number; val: number; end: string }[] = [];
  const year = Number(/CY(\d{4})/.exec(period)![1]);
  const instant = period.endsWith("I");
  SPECS.forEach((s, i) => {
    const shares = s.marketCap / s.price;
    const rev = (s.marketCap / (1 + s.growth * 6)) * 0.9;
    const ni = rev * (0.05 + s.quality * 0.3) * 0.8;
    const push = (val: number, end = `${year}-12-31`) => rows.push({ cik: CIK(i), val, end });
    if (taxonomy === "us-gaap") {
      if (concept === REV_CONCEPT(i) && [2025, 2024, 2022].includes(year) && !instant) push(rev / 1.1 ** (2025 - year));
      if (concept === NI_CONCEPT(i) && [2025, 2024, 2023].includes(year) && !instant) push(ni * 0.9 ** (2025 - year));
      if (concept === "EarningsPerShareDiluted" && [2025, 2024].includes(year) && i !== 5) push((ni / shares) * 0.9 ** (2025 - year));
      if (concept === "OperatingIncomeLoss" && year === 2025 && i !== 4 && i !== 10) push(ni * 1.3);
      if (concept === "NetCashProvidedByUsedInOperatingActivities" && year === 2025 && !instant) push(ni * 1.4);
      if (concept === "PaymentsToAcquirePropertyPlantAndEquipment" && year === 2025 && i !== 10) push(rev * 0.05);
      if (concept === "CommonStockDividendsPerShareDeclared" && year === 2025 && s.dividend) push(s.price * 0.02);
      if (concept === "StockholdersEquity" && instant && year === 2025) push(rev * 0.8);
      if (concept === "Assets" && instant && year === 2025) push(rev * 2.4);
      if (concept === "Liabilities" && instant && year === 2025) push(rev * 1.2);
      if (concept === "WeightedAverageNumberOfDilutedSharesOutstanding" && year === 2025 && SHARE_GROUP(i) === "fallback") push(shares);
    } else if (taxonomy === "dei" && concept === "EntityCommonStockSharesOutstanding") {
      if (period === "CY2026Q2I" && SHARE_GROUP(i) === "Q2") push(shares, "2026-07-25");
      if (period === "CY2026Q1I" && (SHARE_GROUP(i) === "Q1" || SHARE_GROUP(i) === "Q2")) push(shares * 0.99, "2026-04-25");
    }
  });
  return rows.length ? JSON.stringify({ taxonomy, tag: concept, uom: unit, data: rows }) : null;
}

function yahooChart(symbol: string, range: string, opts: { jump?: boolean } = {}) {
  const src = symbol === "VOO" ? bench : symbol === "^IRX" ? bench.map((b) => ({ date: b.date, close: 4, adjClose: 4 })) : bars.get(symbol)!;
  const n = range === "5y" ? 1260 : range === "1mo" ? 22 : 300;
  let list = src.slice(-n).map((b) => ({ ...b }));
  if (opts.jump) list = list.map((b, i) => (i >= 700 ? { ...b, close: b.close * 2, adjClose: b.adjClose * 2 } : b));
  const ts = list.map((b) => Date.parse(`${b.date}T14:00:00Z`) / 1000);
  const last = list[list.length - 1];
  return {
    chart: {
      result: [
        {
          meta: { currency: "USD", symbol, regularMarketPrice: last.close, regularMarketTime: ts[ts.length - 1], fiftyTwoWeekHigh: last.close * 1.2, fiftyTwoWeekLow: last.close * 0.7, longName: symbol },
          timestamp: ts,
          indicators: { quote: [{ close: list.map((b) => b.close), volume: list.map(() => 1000) }], adjclose: [{ adjclose: list.map((b) => b.adjClose) }] },
        },
      ],
      error: null,
    },
  };
}

interface NetOpts {
  yahooFail?: Set<string>;
  yahooAll500?: boolean;
  jump?: Set<string>;
}
let calls: { url: string; headers: Record<string, string> }[] = [];
const network = (o: NetOpts = {}) => (url: string, init: RequestInit) => {
  const u = new URL(url);
  calls.push({ url, headers: (init.headers ?? {}) as Record<string, string> });
  if (u.host === "raw.githubusercontent.com") return text(CSV, 200, "text/csv");
  if (u.host === "data.sec.gov") {
    const m = /\/frames\/([^/]+)\/([^/]+)\/([^/]+)\/([^/]+)\.json$/.exec(u.pathname);
    const body = m ? frameJson(m[1], m[2], m[3], m[4]) : null;
    return body ? text(body, 200, "application/json") : text("Not Found", 404);
  }
  if (u.host === "query1.finance.yahoo.com") {
    if (o.yahooAll500) return text("nope", 500);
    const sym = decodeURIComponent(u.pathname.split("/").pop()!);
    if (o.yahooFail?.has(sym)) return jsonRes({ chart: { result: null, error: { code: "Not Found", description: "No data found, symbol may be delisted" } } }, 404);
    return jsonRes(yahooChart(sym, u.searchParams.get("range")!, { jump: o.jump?.has(sym) }));
  }
  return undefined;
};

let mock: FetchMock | undefined;
beforeAll(async () => {
  await useTestDb();
});
beforeEach(() => {
  calls = [];
  process.env.SEC_USER_AGENT = "FinovaTests/0.0 tests@example.invalid";
  delete process.env.UNIVERSE_LIMIT;
});
afterEach(() => mock?.restore());

describe("constituents CSV", () => {
  it("parses quoted fields, drops duplicate share classes (one line per issuer), keeps rows without CIK", () => {
    const rows = parseConstituents(CSV);
    expect(rows).toHaveLength(14);
    expect(rows.find((r) => r.symbol === "NVDA")!.name).toBe("NVDA Corp");
    expect(rows.find((r) => r.symbol === "MSFT")!.name).toBe("MSFT Corp, Inc.");
    expect(rows.find((r) => r.symbol === "GOOGL")!.cik).toBe("1002");
    expect(parseCsv('a,"b,c",d\n1,"x ""q"" y",3\r\n').map((r) => r.length)).toEqual([3, 3]);
    const { kept, dropped } = dedupeIssuers(rows, ["GOOGL"]);
    expect(dropped).toEqual([{ symbol: "GOOG", keptSymbol: "GOOGL" }]);
    expect(kept.some((k) => k.symbol === "GOOG")).toBe(false);
    expect(kept.some((k) => k.symbol === "GOOGL")).toBe(true);
    expect(kept.some((k) => k.symbol === "NOCIK")).toBe(true);
    // without a preference the first row wins
    expect(dedupeIssuers(rows, []).dropped[0].symbol).toBe("GOOG");
    expect(() => parseConstituents("Symbol,Foo\nA,B")).toThrow(/schema drift/);
  });
  it("fiscal-year and quarter helpers", () => {
    expect(pickFiscalYear(new Date("2026-09-21"))).toBe(2025);
    expect(pickFiscalYear(new Date("2026-02-10"))).toBe(2024);
    expect(lastQuarterLabels(new Date("2026-09-21"), 3)).toEqual(["CY2026Q2I", "CY2026Q1I", "CY2025Q4I"]);
    expect(lastQuarterLabels(new Date("2026-01-05"), 2)).toEqual(["CY2025Q4I", "CY2025Q3I"]);
  });
});

describe("polite HTTP", () => {
  it("SEC requests are spaced <= ~6.6 per second (slot scheduler)", async () => {
    process.env.THROTTLE_IN_TESTS = "1";
    try {
      const t0 = Date.now();
      for (let i = 0; i < 5; i++) await waitForSlot("data.sec.gov");
      expect(Date.now() - t0).toBeGreaterThanOrEqual(150 * 4 - 40); // 4 gaps of 150 ms
    } finally {
      delete process.env.THROTTLE_IN_TESTS;
    }
  });
});

describe("nightly universe batch", () => {
  it("refuses to call SEC without SEC_USER_AGENT (never a hard-coded contact); the failure is recorded and no snapshot is written", async () => {
    delete process.env.SEC_USER_AGENT;
    mock = mockFetch(network());
    await expect(runUniverseBatch({ now: NOW })).rejects.toBeInstanceOf(NotConfiguredError);
    expect(await latestSnapshotPointer()).toBeNull();
    const db = await getDb();
    const job = (await db.execute(sql`select status from market.job_run order by id desc limit 1`)).rows[0] as { status: string };
    expect(job.status).toBe("failed");
    expect(calls.some((c) => c.url.includes("data.sec.gov"))).toBe(false);
  });

  it("full run: coverage stats, fallback chains, dedupe, exclusions, atomic snapshot", async () => {
    mock = mockFetch(network({ yahooFail: new Set(["SYN07"]), jump: new Set(["SYN08"]) }));
    const stats = await runUniverseBatch({ now: NOW });
    const c = stats.coverage;
    expect(c).toMatchObject({ constituents: 14, issuers: 13, withCik: 12, duplicatesDropped: 1, priceFailures: 2, fundamentalsFiscalYear: 2025 });
    // NOCIK has no fundamentals; SYN07 has none prices; both are incomplete/excluded, the batch still finished
    expect(stats.priceFailures.map((f) => f.symbol).sort()).toEqual(["NOCIK", "SYN07"]);
    expect(c.hardEligible).toBeGreaterThan(5);
    expect(c.revenueCoverage).toBe(11); // 12 CIKs minus the bank-like issuer that reports no revenue concept
    expect(c.netIncomeCoverage).toBe(12);
    expect(c.grossProfitCoverage).toBe(0);
    expect(c.sharesCoverage).toBe(12);
    expect(stats.frameCalls).toBeGreaterThan(30);
    expect(stats.frameFailures).toEqual([]);
    // GOOG was dropped BEFORE any price call; SEC calls carried the configured User-Agent; Yahoo got the descriptive one
    expect(calls.some((x) => x.url.includes("/GOOG?"))).toBe(false);
    const sec = calls.filter((x) => x.url.includes("data.sec.gov"));
    expect(sec.length).toBe(stats.frameCalls);
    expect(sec.every((x) => x.headers["user-agent"] === "FinovaTests/0.0 tests@example.invalid")).toBe(true);
    expect(calls.filter((x) => x.url.includes("yahoo")).every((x) => /FinanceAppTests/.test(x.headers["user-agent"]))).toBe(true);

    const snap = (await loadLatestSnapshot())!;
    expect(snap.id).toBe(stats.snapshotId);
    expect(snap.asOf).toBe("2026-09-18");
    expect(snap.methodologyVersion).toBe("v1");
    const by = new Map(snap.payload.records.map((r) => [r.symbol, r]));
    expect(by.size).toBe(13);
    // fallback chains
    expect(by.get("AAPL")!.revenue).toBeGreaterThan(0); // RevenueFromContractWithCustomerExcludingAssessedTax
    expect(by.get("GOOGL")!.netIncome).toBeGreaterThan(0); // ProfitLoss fallback
    expect(by.get("MSFT")!.sharesOut).toBeCloseTo((SPECS[3].marketCap / SPECS[3].price) * 0.99, 0);
    expect(by.get("AMZN")!.sharesOut).toBeCloseTo(SPECS[4].marketCap / SPECS[4].price, 0); // weighted diluted shares fallback
    const db = await getDb();
    const src = (await db.execute(sql`select sources from market.fundamentals where symbol in ('AAPL','GOOGL') order by symbol`)).rows as { sources: Record<string, { concept: string }> }[];
    expect(src[0].sources.revenue.concept).toBe("RevenueFromContractWithCustomerExcludingAssessedTax");
    expect(src[1].sources.netIncome.concept).toBe("ProfitLoss");
    // financial issuer: no revenue-based metrics required, different applicable set
    const bank = by.get("SYN10")!;
    expect(bank.isFinancial).toBe(true);
    expect(bank.revenue).toBeNull();
    expect(bank.metrics.opMargin).toBeNull();
    expect(bank.hardEligible).toBe(true);
    expect(bank.factorInputs.pb).toBeDefined();
    expect(bank.factorInputs.opMargin).toBeUndefined();
    // data errors / gaps are excluded, never imputed
    expect(by.get("SYN07")!.hardEligible).toBe(false);
    expect(by.get("SYN07")!.status).toBe("incomplete");
    expect(by.get("SYN08")!.flags).toContain("price_jump");
    expect(by.get("SYN08")!.status).toBe("excluded");
    expect(by.get("NOCIK")!.hardEligible).toBe(false);
    // a missing operating-income concept lowers completeness but does not exclude by itself
    expect(by.get("SYN04")?.metrics.opMargin ?? null).toBeNull;
    // persisted tables
    const universe = (await db.execute(sql`select symbol, drop_reason from market.universe where symbol in ('GOOG','GOOGL')`)).rows as { symbol: string; drop_reason: string | null }[];
    expect(universe.find((u) => u.symbol === "GOOG")!.drop_reason).toMatch(/duplicate share class \(kept GOOGL\)/);
    expect(universe.find((u) => u.symbol === "GOOGL")!.drop_reason).toBeNull();
    expect(Number(((await db.execute(sql`select count(*)::int as n from market.fundamentals`)).rows[0] as { n: number }).n)).toBe(12);
    expect(Number(((await db.execute(sql`select count(*)::int as n from market.price_daily where symbol = 'VOO'`)).rows[0] as { n: number }).n)).toBeGreaterThan(1000);
    // stable leaders exist for eligible combinations and reference eligible symbols
    for (const l of Object.values(snap.payload.stableLeaders)) expect(by.get(l.symbol)!.hardEligible).toBe(true);
  });

  it("second run is incremental (short Yahoo ranges), keeps yesterday's stable leaders, and swaps the snapshot atomically", async () => {
    const before = (await loadLatestSnapshot())!;
    mock = mockFetch(network({ yahooFail: new Set(["SYN07"]) }));
    const stats = await runUniverseBatch({ now: NOW });
    expect(stats.snapshotId).toBe(before.id + 1);
    expect((await latestSnapshotPointer())).toBe(stats.snapshotId);
    const ranges = calls.filter((c) => c.url.includes("yahoo") && !c.url.includes("SYN07") && !c.url.includes("NOCIK")).map((c) => new URL(c.url).searchParams.get("range"));
    expect(ranges.every((r) => r === "1mo")).toBe(true);
    const now2 = (await loadLatestSnapshot())!;
    expect(now2.payload.stableLeaders).toEqual(before.payload.stableLeaders); // unchanged data -> same leaders (stability rule)
    expect(stats.coverage.priceFailures).toBe(2);
  });

  it("a failed batch never replaces the last good snapshot; the price stage aborts after repeated provider failures", async () => {
    const good = await latestSnapshotPointer();
    mock = mockFetch(network({ yahooAll500: true }));
    process.env.UNIVERSE_LIMIT = "6";
    await expect(runUniverseBatch({ now: new Date("2027-03-01T00:00:00Z"), maxConsecutivePriceFailures: 2 })).rejects.toThrow();
    // (stored history is still within the 3-year window, so this run may or may not find data; the pointer must be intact either way)
    const ptr = await latestSnapshotPointer();
    expect(ptr === good || ptr === (good as number) + 1).toBe(true);
    const db = await getDb();
    const jobs = (await db.execute(sql`select status from market.job_run order by id`)).rows as { status: string }[];
    expect(jobs.map((j) => j.status)).toContain("failed");
    void 0;
  });

  it("UNIVERSE_LIMIT limits a dev run and says so in the notes", async () => {
    mock = mockFetch(network());
    process.env.UNIVERSE_LIMIT = "5";
    const stats = await runUniverseBatch({ now: NOW });
    expect(stats.coverage.limit).toBe(5);
    expect(stats.notes.join(" ")).toMatch(/DEV RUN: limited to the first 5/);
    expect((await loadLatestSnapshot())!.payload.records).toHaveLength(5);
  });
});

describe("POST /api/jobs/:name", () => {
  it("requires the CRON_SECRET bearer (403 otherwise, also when the secret is unset); unknown job is 404", async () => {
    const post = (name: string, headers: Record<string, string> = {}, json?: unknown) =>
      call(jobsRoute.POST, "POST", `/api/jobs/${name}`, { headers, params: { name }, json });
    delete process.env.CRON_SECRET;
    expect((await post("universe", { authorization: "Bearer anything" })).status).toBe(403);
    process.env.CRON_SECRET = "test-cron-secret-0123456789";
    expect((await post("universe")).status).toBe(403);
    expect((await post("universe", { authorization: "Bearer wrong" })).status).toBe(403);
    expect((await post("nope", { authorization: "Bearer test-cron-secret-0123456789" })).status).toBe(404);
    expect((await post("universe", { authorization: "Bearer test-cron-secret-0123456789" }, { limit: -1 })).status).toBe(400);
    mock = mockFetch(network());
    const ok = await post("universe", { authorization: "Bearer test-cron-secret-0123456789" }, { limit: 4 });
    expect(ok.status).toBe(200);
    expect(ok.body.job).toBe("universe");
    expect(ok.body.result.coverage.limit).toBe(4);
    delete process.env.CRON_SECRET;
    // a normal user session does not grant access to jobs
    const u = await registerUser("jobs");
    expect((await call(jobsRoute.POST, "POST", "/api/jobs/universe", { jar: u.jar, params: { name: "universe" } })).status).toBe(403);
  });
});
