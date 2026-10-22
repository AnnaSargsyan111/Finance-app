import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { resetCache } from "./helpers/db";
import { jsonRes, mockFetch, text, type FetchMock } from "./helpers/fetch-mock";
import * as ipoRoute from "@/app/api/market/ipo/route";
import { dropOutdated, fromFinnhub, mergeIpos, parsePrice } from "@/market/ipo/service";
import { parseAmount, usDateToIso } from "@/market/ipo/parse";
import { parseNasdaqMonth } from "@/market/providers/nasdaq";
import { pickIpoNews, stripOutlet } from "@/market/ipo/news";
import type { IpoRaw } from "@/market/ipo/types";
import { addDays, todayIn } from "@/lib/time";

let user: TestUser;
let mock: FetchMock | undefined;
const FIX = path.resolve(import.meta.dirname, "fixtures", "providers");
const readJson = (...p: string[]) => JSON.parse(fs.readFileSync(path.join(FIX, ...p), "utf8"));

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

const raw = (over: Partial<IpoRaw> = {}): IpoRaw => ({ source: "nasdaq", symbol: "ACME", name: "Acme Inc.", exchange: "NASDAQ Global", status: "expected", date: "2026-11-05", filedDate: null, priceLow: 10, priceHigh: 12, shares: 1_000_000, dealSizeUsd: 11_000_000, ...over });

describe("readers", () => {
  it("price text, amounts and Nasdaq dates", () => {
    expect(parsePrice("16.00-18.00")).toEqual({ low: 16, high: 18 });
    expect(parsePrice("$18.00 - $16.00")).toEqual({ low: 16, high: 18 });
    expect(parsePrice("17")).toEqual({ low: 17, high: 17 });
    expect(parsePrice("")).toEqual({ low: null, high: null });
    expect(parseAmount("$199,999,998")).toBe(199_999_998);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("0")).toBeNull();
    expect(usDateToIso("10/16/2026")).toBe("2026-10-16");
    expect(usDateToIso("8/05/2021")).toBe("2021-08-05");
    expect(usDateToIso("2026-10-16")).toBeNull();
    expect(usDateToIso(null)).toBeNull();
  });
});

describe("Nasdaq's answer (recorded real sample)", () => {
  const rows = parseNasdaqMonth(readJson("nasdaq", "real_sample_2026-10.json"));
  const by = (s: string) => rows.filter((r) => r.status === s);

  it("reads the four lists", () => {
    expect(rows.length).toBe(7);
    expect(by("priced").map((r) => r.symbol)).toEqual(["CTY", "PORTU"]);
    expect(by("expected").map((r) => r.symbol)).toEqual(["LYCA", "DAVI"]);
    expect(by("filed")).toHaveLength(2);
    expect(by("withdrawn")).toHaveLength(1);
  });

  it("an expected deal has a price range, shares, size and date; one without a price keeps null", () => {
    const lyca = rows.find((r) => r.symbol === "LYCA")!;
    expect(lyca).toMatchObject({ date: "2026-10-23", priceLow: 16, priceHigh: 18, shares: 14_700_000, dealSizeUsd: 304_290_000, exchange: "NASDAQ Global Select" });
    expect(rows.find((r) => r.symbol === "DAVI")).toMatchObject({ date: "2026-10-22", priceLow: null, dealSizeUsd: null });
  });

  it("a filed company has a FILING date and no IPO date; a withdrawn one has its withdrawal date", () => {
    expect(by("filed").every((r) => r.date === null && r.filedDate === "2026-10-21")).toBe(true);
    expect(rows.find((r) => r.symbol === null && r.status === "filed")?.name).toBe("Sensing4D AI Ltd");
    expect(by("withdrawn")[0]).toMatchObject({ date: "2026-10-16", filedDate: "2025-11-10" });
  });

  it("a month with no deals is an empty list; an unexpected answer is an error", () => {
    expect(parseNasdaqMonth({ data: { priced: { rows: null }, upcoming: { upcomingTable: { rows: null } }, filed: { rows: null }, withdrawn: { rows: null } } })).toEqual([]);
    expect(() => parseNasdaqMonth({ nope: true })).toThrow();
  });
});

describe("Finnhub rows", () => {
  it("for 'filed' the date is the filing date, not an IPO date", () => {
    const f = fromFinnhub({ date: "2026-10-01", name: "Pop Global", symbol: "PGA", exchange: "", status: "filed", price: "", numberOfShares: null, totalSharesValue: 115_000_000 });
    expect(f).toMatchObject({ status: "filed", date: null, filedDate: "2026-10-01", exchange: null, dealSizeUsd: 115_000_000 });
    const e = fromFinnhub({ date: "2026-11-05", name: "Acme", symbol: "ACME", exchange: "NYSE", status: "expected", price: "10.00-12.00", numberOfShares: 5, totalSharesValue: 60 });
    expect(e).toMatchObject({ status: "expected", date: "2026-11-05", filedDate: null, priceLow: 10, priceHigh: 12 });
  });
});

describe("merging the sources", () => {
  it("one row per company; Nasdaq's words win, gaps are filled from Finnhub", () => {
    const items = mergeIpos([raw({ exchange: "NASDAQ Global Select", priceLow: null, priceHigh: null }), raw({ source: "finnhub", exchange: "NASDAQ Global", priceLow: 10, priceHigh: 12, shares: 2_000_000 })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ exchange: "NASDAQ Global Select", priceLow: 10, priceHigh: 12, shares: 1_000_000 });
  });

  it("a company moves forward: filed in September, priced in October -> priced, and it keeps its filing date", () => {
    const items = mergeIpos([raw({ status: "filed", date: null, filedDate: "2026-09-01", priceLow: null, priceHigh: null }), raw({ status: "priced", date: "2026-10-16", filedDate: null })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "priced", date: "2026-10-16", filedDate: "2026-09-01" });
  });

  it("a withdrawal after the expected date wins; companies without a ticker are matched by name", () => {
    const items = mergeIpos([raw({ symbol: null, name: "Klook Technology Ltd", date: "2026-10-01" }), raw({ symbol: null, name: "KLOOK TECHNOLOGY LIMITED", status: "withdrawn", date: "2026-10-16" })]);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ status: "withdrawn", date: "2026-10-16" });
  });

  it("drops an 'expected' deal whose date passed more than a day ago; keeps the others", () => {
    const items = mergeIpos([raw({ symbol: "OLD", name: "Old Co", date: "2026-10-10" }), raw({ symbol: "YEST", name: "Yesterday Co", date: "2026-10-22" }), raw({ symbol: "PRI", name: "Priced Co", status: "priced", date: "2026-10-01" }), raw({ symbol: "FIL", name: "Filed Co", status: "filed", date: null, filedDate: "2026-09-01" })]);
    expect(dropOutdated(items, "2026-10-23").map((i) => i.symbol).sort()).toEqual(["FIL", "PRI", "YEST"]);
  });
});

describe("IPO headlines", () => {
  const xml = fs.readFileSync(path.join(FIX, "ipo", "news.xml"), "utf8");
  const now = new Date("2026-10-23T00:00:00Z");

  it("keeps only IPO stories, counts one story once, newest first, without the outlet suffix", () => {
    const news = pickIpoNews(xml, now);
    expect(news.map((n) => n.title)).toEqual(["Synthetic Aero Holdings sets terms for $244 million IPO", "Synthetic Cloud Systems plans to go public next month"]);
    expect(news[0].outlet).toBe("Other Outlet");
    expect(stripOutlet("Anthropic files for IPO - Example Wire", "Example Wire")).toBe("Anthropic files for IPO");
  });

  it("ignores headlines older than two weeks", () => {
    expect(pickIpoNews(xml, new Date("2026-12-01T00:00:00Z"))).toEqual([]);
  });
});

describe("GET /api/market/ipo", () => {
  it("needs a session", async () => {
    expect((await get(null)).status).toBe(401);
  });

  it("fixture mode: both sources merged, filed companies have no IPO date, headlines included, flagged as test data", async () => {
    process.env.KEYED_PROVIDER_MODE = "fixture";
    const r = await get(user);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toMatchObject({ isFixture: true, sources: ["nasdaq", "finnhub"] });
    const items = r.body.data.items as { symbol: string | null; name: string; status: string; date: string | null; filedDate: string | null; exchange: string | null }[];
    const sym = (s: string) => items.find((i) => i.symbol === s)!;
    expect(items.filter((i) => i.symbol === "SAER")).toHaveLength(1);
    expect(sym("SAER").exchange).toBe("NASDAQ Global Select"); // Nasdaq's wording
    expect(sym("SQNT")).toMatchObject({ status: "expected", date: "2026-11-12" }); // only on Nasdaq
    expect(sym("SPAY")).toMatchObject({ status: "expected", date: "2026-11-19" }); // only on Finnhub
    for (const f of items.filter((i) => i.status === "filed")) {
      expect(f.date).toBeNull();
      expect(f.filedDate).toMatch(/^2026-1[01]-\d\d$/);
    }
    expect(items.some((i) => i.status === "filed")).toBe(true);
    expect(r.body.data.news.map((n: { title: string }) => n.title)).toHaveLength(2);
  });

  const monthJson = (ym: string) => {
    const today = todayIn();
    const rows = ym === today.slice(0, 7) ? [{ dealID: "1", proposedTickerSymbol: "SOON", companyName: "Soon Corp", proposedExchange: "NYSE", proposedSharePrice: "20.00-22.00", sharesOffered: "2,000,000", expectedPriceDate: `${addDays(today, 3).slice(5, 7)}/${addDays(today, 3).slice(8, 10)}/${addDays(today, 3).slice(0, 4)}`, dollarValueOfSharesOffered: "$42,000,000" }] : null;
    return { data: { priced: { rows: null }, upcoming: { upcomingTable: { rows } }, filed: { rows: null }, withdrawn: { rows: null } } };
  };
  const nasdaqOk = (calls: string[]) => (url: string) => {
    if (url.startsWith("https://api.nasdaq.com/api/ipo/calendar")) {
      calls.push(url);
      return jsonRes(monthJson(new URL(url).searchParams.get("date")!));
    }
    if (url.startsWith("https://news.google.com/")) return text("<rss><channel></channel></rss>", 200, "application/rss+xml");
    return undefined;
  };

  it("live, no Finnhub key: Nasdaq alone is enough; one call per month (at most 6), then served from the cache", async () => {
    const calls: string[] = [];
    mock = mockFetch(nasdaqOk(calls));
    const r = await get(user);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta).toMatchObject({ isFixture: false, source: "Nasdaq", sources: ["nasdaq"], notConfigured: ["finnhub"] });
    expect(r.body.data.items.map((i: { symbol: string }) => i.symbol)).toEqual(["SOON"]);
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.length).toBeLessThanOrEqual(6);
    const before = calls.length;
    expect((await get(user)).status).toBe(200);
    expect(calls.length).toBe(before);
  });

  it("Nasdaq down but Finnhub answers: the calendar still works and says it used Finnhub only", async () => {
    process.env.FINNHUB_API_KEY = "test-key";
    const today = todayIn();
    mock = mockFetch((url) => {
      if (url.startsWith("https://api.nasdaq.com/")) return jsonRes({ error: "blocked" }, 403);
      if (url.startsWith("https://finnhub.io/api/v1/calendar/ipo")) {
        return jsonRes({ ipoCalendar: [{ date: addDays(today, 10), exchange: "NYSE", name: "Soon Corp", numberOfShares: 2_000_000, price: "20.00-22.00", status: "expected", symbol: "SOON", totalSharesValue: 42_000_000 }] });
      }
      if (url.startsWith("https://news.google.com/")) return text("<rss><channel></channel></rss>", 200, "application/rss+xml");
      return undefined;
    });
    const r = await get(user);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.meta.sources).toEqual(["finnhub"]);
    expect(r.body.data.items).toHaveLength(1);
  });

  it("no source answers and nothing is cached: 503, never an invented list", async () => {
    mock = mockFetch((url) => (url.startsWith("https://api.nasdaq.com/") ? jsonRes({ error: "boom" }, 500) : undefined));
    expect((await get(user)).status).toBe(503);
  });

  it("a failing headlines feed never breaks the calendar", async () => {
    const calls: string[] = [];
    const ok = nasdaqOk(calls);
    mock = mockFetch((url) => (url.startsWith("https://news.google.com/") ? text("nope", 500) : ok(url)));
    const r = await get(user);
    expect(r.status).toBe(200);
    expect(r.body.data.news).toEqual([]);
    expect(r.body.data.items).toHaveLength(1);
  });
});
