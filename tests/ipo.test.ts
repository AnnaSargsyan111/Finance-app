import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { resetCache } from "./helpers/db";
import { jsonRes, mockFetch, type FetchMock } from "./helpers/fetch-mock";
import * as ipoRoute from "@/app/api/market/ipo/route";
import { normaliseIpos, parsePrice } from "@/market/ipo/service";
import { addDays } from "@/lib/time";

let user: TestUser;
let mock: FetchMock | undefined;

beforeAll(async () => {
  await useTestDb();
  user = await registerUser("ipo");
});
beforeEach(async () => {
  await resetCache();
  delete process.env.KEYED_PROVIDER_MODE;
  delete process.env.FINNHUB_API_KEY;
});
afterEach(() => {
  mock?.restore();
  mock = undefined;
  delete process.env.KEYED_PROVIDER_MODE;
  delete process.env.FINNHUB_API_KEY;
});

const get = (u: TestUser | null) => call(ipoRoute.GET, "GET", "/api/market/ipo", { jar: u?.jar });

describe("price text", () => {
  it("reads a range, a single price and nothing", () => {
    expect(parsePrice("16.00-18.00")).toEqual({ low: 16, high: 18 });
    expect(parsePrice("$18.00 - $16.00")).toEqual({ low: 16, high: 18 });
    expect(parsePrice("17")).toEqual({ low: 17, high: 17 });
    expect(parsePrice("")).toEqual({ low: null, high: null });
    expect(parsePrice("TBD")).toEqual({ low: null, high: null });
  });
});

describe("normalising the provider's rows", () => {
  const row = (over: Record<string, unknown> = {}) => ({ date: "2026-11-05", name: "Acme Inc.", symbol: "ACME", exchange: "NASDAQ", status: "expected", price: "10.00-12.00", numberOfShares: 1_000_000, totalSharesValue: 11_000_000, ...over });

  it("sorts by date, drops duplicates, keeps unknown statuses as 'other', links to the SEC filings", () => {
    const items = normaliseIpos([row({ date: "2026-12-01", name: "Zed", symbol: "ZED" }), row(), row(), row({ symbol: null, name: "No Ticker Co", status: "mystery", price: "", numberOfShares: 0, totalSharesValue: null })] as never);
    expect(items.map((i) => i.name)).toEqual(["Acme Inc.", "No Ticker Co", "Zed"]);
    expect(items[1]).toMatchObject({ symbol: null, status: "other", priceLow: null, priceHigh: null, shares: null, dealSizeUsd: null });
    expect(items[0]).toMatchObject({ priceLow: 10, priceHigh: 12, shares: 1_000_000, dealSizeUsd: 11_000_000 });
    expect(items[0].filingsUrl).toBe("https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=Acme%20Inc.&type=424B&dateb=&owner=include&count=40");
  });
});

describe("GET /api/market/ipo", () => {
  it("needs a session", async () => {
    expect((await get(null)).status).toBe(401);
  });

  it("without a Finnhub key: an empty list that says the source is not configured (not an error)", async () => {
    const r = await get(user);
    expect(r.status).toBe(200);
    expect(r.body.data.items).toEqual([]);
    expect(r.body.meta.notConfigured).toEqual(["finnhub"]);
  });

  it("fixture mode: the synthetic calendar, soonest first, flagged as fixture, duplicates removed", async () => {
    process.env.KEYED_PROVIDER_MODE = "fixture";
    const r = await get(user);
    expect(r.status).toBe(200);
    expect(r.body.meta.isFixture).toBe(true);
    const items = r.body.data.items as { date: string; symbol: string; status: string }[];
    expect(items.length).toBe(7);
    expect(items.map((i) => i.date)).toEqual([...items.map((i) => i.date)].sort());
    expect(items.filter((i) => i.symbol === "SAER")).toHaveLength(1);
    expect(new Set(items.map((i) => i.status))).toEqual(new Set(["expected", "filed", "priced", "withdrawn"]));
  });

  it("live: one Finnhub call for the whole window, the key in a header, rows outside the window dropped, then served from the cache", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const today = new Date().toISOString().slice(0, 10);
    const calls: string[] = [];
    mock = mockFetch((url, init) => {
      if (!url.startsWith("https://finnhub.io/api/v1/calendar/ipo")) return undefined;
      calls.push(url);
      expect(new Headers(init.headers).get("x-finnhub-token")).toBe("test-key");
      return jsonRes({
        ipoCalendar: [
          { date: addDays(today, 10), exchange: "NYSE", name: "Soon Corp", numberOfShares: 2_000_000, price: "20.00-22.00", status: "expected", symbol: "SOON", totalSharesValue: 42_000_000 },
          { date: addDays(today, -400), exchange: "NYSE", name: "Ancient Corp", price: "5", status: "priced", symbol: "OLD" },
          { date: addDays(today, 400), exchange: "NYSE", name: "Far Corp", price: "5", status: "filed", symbol: "FAR" },
        ],
      });
    });
    const r = await get(user);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toMatchObject({ isFixture: false, source: "Finnhub", notConfigured: [] });
    expect(r.body.data.items.map((i: { symbol: string }) => i.symbol)).toEqual(["SOON"]);
    expect(calls).toHaveLength(1);
    const again = await get(user);
    expect(again.status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("when Finnhub fails and nothing is cached: 503, never an invented list", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    mock = mockFetch((url) => (url.startsWith("https://finnhub.io/") ? jsonRes({ error: "boom" }, 500) : undefined));
    const r = await get(user);
    expect(r.status).toBe(503);
  });
});
