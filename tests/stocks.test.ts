import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { resetCache } from "./helpers/db";
import { fixture, jsonRes, mockFetch, text, type FetchMock } from "./helpers/fetch-mock";
import { parseYahooChart } from "@/market/providers/yahoo";
import * as stocksRoute from "@/app/api/market/stocks/route";
import * as historyRoute from "@/app/api/market/stocks/[symbol]/history/route";
import * as providersRoute from "@/app/api/market/providers/route";

let user: TestUser;
let mock: FetchMock | undefined;

/** SYNTHETIC Yahoo-shaped v8/chart responses (tests/fixtures/providers, invented prices) for the five display companies */
const yahooHandler = (mode: "ok" | "500" = "ok") => (url: string) => {
  const u = new URL(url);
  if (u.host !== "query1.finance.yahoo.com") return undefined;
  if (mode === "500") return text("nope", 500);
  const sym = decodeURIComponent(u.pathname.split("/").pop()!);
  if (sym === "ZZZZ") return jsonRes(JSON.parse(fixture("providers", "yahoo_chart_invalid.json")), 404);
  return text(fixture("providers", `yahoo_chart_${sym}_1mo.json`), 200, "application/json");
};

beforeAll(async () => {
  await useTestDb();
  user = await registerUser("stocks");
});
beforeEach(async () => {
  await resetCache();
  delete process.env.KEYED_PROVIDER_MODE;
});
afterEach(() => {
  mock?.restore();
  delete process.env.KEYED_PROVIDER_MODE;
});

describe("Yahoo chart parser on synthetic data", () => {
  it("NVDA: price, previous close = bar before the latest, 52w range, adjusted closes", () => {
    const c = parseYahooChart(JSON.parse(fixture("providers", "yahoo_chart_NVDA_1mo.json")), "NVDA");
    expect(c.symbol).toBe("NVDA");
    expect(c.price).toBeGreaterThan(0);
    expect(c.bars.length).toBeGreaterThanOrEqual(15);
    expect(c.bars.at(-1)!.close).toBeCloseTo(c.price!, 1);
    expect(c.previousClose).toBe(c.bars.at(-2)!.close);
    expect(c.high52w!).toBeGreaterThanOrEqual(c.low52w!);
    expect(c.bars.every((b, i) => i === 0 || b.date > c.bars[i - 1].date)).toBe(true);
    expect(() => parseYahooChart(JSON.parse(fixture("providers", "yahoo_chart_invalid.json")), "ZZZZ")).toThrow(/Yahoo/);
  });
});

describe("GET /api/market/stocks (auto mode, no keys: Yahoo prototype fallback, honest labels)", () => {
  it("exactly the 5 display symbols with consistent change math and explicit null reasons", async () => {
    mock = mockFetch(yahooHandler());
    expect((await call(stocksRoute.GET, "GET", "/api/market/stocks")).status).toBe(401);
    const r = await call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar });
    expect(r.status).toBe(200);
    const items = r.body.data.items;
    expect(items.map((i: { symbol: string }) => i.symbol)).toEqual(["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"]);
    for (const i of items) {
      expect(i.price).toMatch(/^\d+\.\d{2,}$/);
      expect(i.previousClose).toMatch(/^\d+\.\d{2,}$/);
      const change = Number(i.price) - Number(i.previousClose);
      expect(Number(i.change)).toBeCloseTo(change, 6);
      expect(i.changePct).toBeCloseTo((change / Number(i.previousClose)) * 100, 3);
      expect(i.history1m.length).toBeGreaterThanOrEqual(15);
      expect(i.history1m.length).toBeLessThanOrEqual(23);
      expect(i.isDelayed).toBe(true);
      expect(i.isFixture).toBe(false);
      expect(i.source).toMatch(/Yahoo chart \(prototype/);
      expect(i.high52w).toBeTruthy();
      // fields we cannot fill are null WITH a reason, never invented
      expect(i.marketCap).toBeNull();
      expect(i.unavailable.marketCap).toMatch(/no Finnhub key/);
      expect(i.fieldSources.price).toMatch(/Yahoo/);
    }
    expect(r.body.meta).toMatchObject({ isDelayed: true, isFixture: false, stale: false });
    expect(r.body.meta.notConfigured).toEqual(["finnhub", "twelvedata"]);
    expect(r.body.meta.providers.find((p: { provider: string }) => p.provider === "yahoo").mode).toBe("live");
  });

  it("uses each host politely: 100 concurrent callers -> at most 2 Yahoo calls per symbol (quote + history)", async () => {
    mock = mockFetch(yahooHandler());
    const rs = await Promise.all(Array.from({ length: 100 }, () => call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar })));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(mock.countHost("query1.finance.yahoo.com")).toBeLessThanOrEqual(10);
    const before = mock.calls.length;
    await call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar });
    expect(mock.calls.length).toBe(before); // cache hit
  });

  it("outage: last good data is served with stale:true; with nothing cached it is a 503 (never fake numbers)", async () => {
    mock = mockFetch(yahooHandler());
    const ok = await call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar });
    expect(ok.body.meta.stale).toBe(false);
    mock.restore();
    const db = await getDb();
    await db.execute(sql`update market.cache_entry set expires_at = now() - interval '1 minute'`);
    mock = mockFetch(yahooHandler("500"));
    const stale = await call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar });
    expect(stale.status).toBe(200);
    expect(stale.body.meta.stale).toBe(true);
    expect(stale.body.data.items[0].price).toBe(ok.body.data.items[0].price);
    await resetCache();
    const down = await call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
  });
});

describe("fixture mode (KEYED_PROVIDER_MODE=fixture): synthetic values, ALWAYS flagged", () => {
  it("every item and the meta say isFixture:true; no upstream call is made", async () => {
    process.env.KEYED_PROVIDER_MODE = "fixture";
    mock = mockFetch(() => undefined); // any network call would throw
    const r = await call(stocksRoute.GET, "GET", "/api/market/stocks", { jar: user.jar });
    expect(r.status).toBe(200);
    expect(mock.calls).toHaveLength(0);
    expect(r.body.meta.isFixture).toBe(true);
    expect(r.body.meta.note).toMatch(/FIXTURE MODE/);
    expect(r.body.meta.source).toMatch(/fixture:finnhub/);
    const nvda = r.body.data.items[0];
    expect(nvda).toMatchObject({ symbol: "NVDA", price: "111.11", isFixture: true, name: "NVIDIA Corp", peTtm: 20, marketCap: "111110000000", beta: 1.11 });
    expect(nvda.source).toMatch(/SYNTHETIC/);
    expect(Number(nvda.change)).toBeCloseTo(111.11 - 108.89, 6);
    expect(nvda.history1m.length).toBeGreaterThan(10);
    expect(r.body.data.items.every((i: { isFixture: boolean }) => i.isFixture)).toBe(true);
    const p = await call(providersRoute.GET, "GET", "/api/market/providers", { jar: user.jar });
    expect(p.body.data.mode).toBe("fixture");
    expect(JSON.stringify(p.body)).not.toMatch(/apikey|api_key|secret/i);
  });
});

describe("GET /api/market/stocks/:symbol/history", () => {
  it("only the display list is allowed (case-insensitive); range validated; series ascending", async () => {
    mock = mockFetch(yahooHandler());
    const get = (sym: string, q = "") => call(historyRoute.GET, "GET", `/api/market/stocks/${sym}/history${q}`, { jar: user.jar, params: { symbol: sym } });
    const ok = await get("nvda", "?range=1m");
    expect(ok.status).toBe(200);
    expect(ok.body.data.symbol).toBe("NVDA");
    const dates = ok.body.data.series.map((p: { date: string }) => p.date);
    expect(dates).toEqual([...dates].sort());
    expect(ok.body.data.series.length).toBeGreaterThanOrEqual(15);
    expect(ok.body.data.series[0]).toEqual({ date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/), close: expect.stringMatching(/^\d+\.\d{2,}$/) });
    expect((await get("TSLA")).status).toBe(404);
    expect((await get("BRK.B")).status).toBe(404);
    expect((await get("NVDA", "?range=10y")).status).toBe(400);
    expect((await get("NVDA", "?range=1m&x=1")).status).toBe(400);
    expect((await call(historyRoute.GET, "GET", "/api/market/stocks/NVDA/history", { params: { symbol: "NVDA" } })).status).toBe(401);
  });
});
