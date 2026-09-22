import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDb, getDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { fixture, fxHandler, mockFetch, text, type FetchMock } from "./helpers/fetch-mock";
import { resetCache } from "./helpers/db";
import { parseLatest, parseRange } from "@/market/fx/cba";
import { forwardFill } from "@/market/fx/forward-fill";
import { getFxHistory, getFxLatest, setFxProviders } from "@/market/fx/service";
import { divideDecimal, perUnit } from "@/lib/money";
import * as latestRoute from "@/app/api/market/fx/latest/route";
import * as historyRoute from "@/app/api/market/fx/history/route";
import * as convertRoute from "@/app/api/invest/convert/route";

let user: TestUser;
let mock: FetchMock | undefined;

beforeAll(async () => {
  await useTestDb();
  user = await registerUser("fx");
});
beforeEach(async () => {
  await resetCache();
  setFxProviders(null);
});
afterEach(() => mock?.restore());

const cbaXml = (name: string) => fixture("cba", name);

describe("CBA SOAP parsing against RECORDED real responses (2026-09-21)", () => {
  it("latest: USD 363.44, EUR 417.05, GBP 485.52, RUB 4.3123, CurrentDate 2026-09-18", () => {
    const r = parseLatest(cbaXml("latest_2026-09-21.xml"), ["USD", "EUR", "GBP", "RUB"]);
    expect(r.currentDate).toBe("2026-09-18");
    const by = Object.fromEntries(r.observations.map((o) => [o.iso, o]));
    expect(by.USD).toMatchObject({ rate: "363.44", diff: "-0.06", date: "2026-09-18" });
    expect(by.EUR.rate).toBe("417.05");
    expect(by.GBP.rate).toBe("485.52");
    expect(by.RUB.rate).toBe("4.3123");
  });

  it("range 2026-08-20..2026-09-20: 22 working-day rows per currency, dates exactly as the handover lists", () => {
    const rows = parseRange(cbaXml("range_2026-08-20_2026-09-20.xml"));
    const expectedDates = [
      "2026-08-20", "2026-08-21", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-31",
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
      "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
    ];
    for (const iso of ["USD", "EUR", "GBP", "RUB"]) {
      const dates = rows.filter((r) => r.iso === iso).map((r) => r.date).sort();
      expect(dates, iso).toEqual(expectedDates);
    }
    expect(rows).toHaveLength(88);
    expect(rows.find((r) => r.iso === "USD" && r.date === "2026-09-11")!.rate).toBe("363.28");
    expect(rows.find((r) => r.iso === "USD" && r.date === "2026-08-20")!.rate).toBe("365.26");
  });

  it("Amount != 1: rates are divided by Amount (IRR per 100, JPY per 10, RUB-like 1000)", () => {
    const xml = `<?xml version="1.0"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>
      <ExchangeRatesLatestResponse xmlns="http://www.cba.am/"><ExchangeRatesLatestResult><CurrentDate>2026-09-18T00:00:00</CurrentDate>
      <Rates>
        <ExchangeRate><ISO>IRR</ISO><Amount>100</Amount><Rate>0.026447</Rate><Difference>0.00001</Difference></ExchangeRate>
        <ExchangeRate><ISO>JPY</ISO><Amount>10</Amount><Rate>23.033</Rate><Difference>-0.324</Difference></ExchangeRate>
        <ExchangeRate><ISO>RUB</ISO><Amount>1000</Amount><Rate>4312.3</Rate><Difference>10</Difference></ExchangeRate>
      </Rates></ExchangeRatesLatestResult></ExchangeRatesLatestResponse></soap:Body></soap:Envelope>`;
    const r = parseLatest(xml);
    const by = Object.fromEntries(r.observations.map((o) => [o.iso, o]));
    expect(by.IRR.rate).toBe("0.00026447");
    expect(by.JPY.rate).toBe("2.3033");
    expect(by.RUB.rate).toBe("4.3123");
    expect(by.RUB.diff).toBe("0.01");
    expect(perUnit("4312.3", 1000)).toBe("4.3123");
  });

  it("robustness: malformed XML, SOAP fault, schema drift, empty range, missing currency", () => {
    expect(() => parseLatest("<html><body>oops")).toThrow(/CBA/);
    expect(() => parseLatest("not xml at all")).toThrow(/CBA/);
    const fault = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><soap:Fault><faultstring>Server was unable to process request</faultstring></soap:Fault></soap:Body></soap:Envelope>`;
    expect(() => parseLatest(fault)).toThrow(/SOAP fault/);
    const drift = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><SomethingElse/></soap:Body></soap:Envelope>`;
    expect(() => parseLatest(drift)).toThrow(/unexpected shape/);
    expect(() => parseRange(drift)).toThrow(/unexpected shape/);
    const empty = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ExchangeRatesByDateRangeByISOResponse xmlns="http://www.cba.am/"><ExchangeRatesByDateRangeByISOResult><xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/><diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1"/></ExchangeRatesByDateRangeByISOResult></ExchangeRatesByDateRangeByISOResponse></soap:Body></soap:Envelope>`;
    expect(parseRange(empty)).toEqual([]);
    expect(() => parseLatest(cbaXml("latest_2026-09-21.xml"), ["USD", "XXX"])).toThrow(/missing XXX/);
    const badRate = cbaXml("latest_2026-09-21.xml").replace("<Rate>363.44</Rate>", "<Rate>abc</Rate>");
    expect(() => parseLatest(badRate, ["USD"])).toThrow(/invalid Rate/);
  });

  it("a single row in the DiffGram (object, not array) is handled", () => {
    const one = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><ExchangeRatesByDateRangeByISOResponse xmlns="http://www.cba.am/"><ExchangeRatesByDateRangeByISOResult><diffgr:diffgram xmlns:diffgr="urn:schemas-microsoft-com:xml-diffgram-v1"><DocumentElement xmlns=""><ExchangeRatesByRange><Rate>363.28</Rate><Amount>1</Amount><ISO>USD</ISO><Diff>0</Diff><RateDate>2026-09-14T00:00:00+04:00</RateDate></ExchangeRatesByRange></DocumentElement></diffgr:diffgram></ExchangeRatesByDateRangeByISOResult></ExchangeRatesByDateRangeByISOResponse></soap:Body></soap:Envelope>`;
    expect(parseRange(one)).toEqual([{ iso: "USD", date: "2026-09-14", rate: "363.28", diff: "0.00" }]);
  });
});

describe("forward fill (pure)", () => {
  const obs = [
    { iso: "USD", date: "2026-09-11", rate: "363.28", diff: null },
    { iso: "USD", date: "2026-09-14", rate: "363.28", diff: null },
    { iso: "USD", date: "2026-09-15", rate: "360.00", diff: null },
    { iso: "EUR", date: "2026-09-11", rate: "417.00", diff: null },
  ];
  it("weekend days carry the previous working-day rate and are flagged", () => {
    const s = forwardFill(obs, "USD", "2026-09-11", "2026-09-15");
    expect(s.map((p) => [p.date, p.isCarriedForward, p.sourceDate])).toEqual([
      ["2026-09-11", false, "2026-09-11"],
      ["2026-09-12", true, "2026-09-11"],
      ["2026-09-13", true, "2026-09-11"],
      ["2026-09-14", false, "2026-09-14"],
      ["2026-09-15", false, "2026-09-15"],
    ]);
  });
  it("a leading non-working day is filled from the padded observation before it; one currency missing a date is filled from its own history", () => {
    const s = forwardFill(obs, "USD", "2026-09-13", "2026-09-14");
    expect(s[0]).toMatchObject({ date: "2026-09-13", isCarriedForward: true, sourceDate: "2026-09-11" });
    const e = forwardFill(obs, "EUR", "2026-09-14", "2026-09-15");
    expect(e.every((p) => p.isCarriedForward && p.sourceDate === "2026-09-11" && p.rate === "417.00")).toBe(true);
  });
});

describe("AC-B4 FX service on recorded data", () => {
  it("latest: 4 pairs with sourceDate 2026-09-18, meta.source CBA, cached (2nd call = no upstream)", async () => {
    mock = mockFetch(fxHandler());
    const a = await getFxLatest();
    expect(a.data.rates).toEqual([
      { pair: "USD/AMD", rate: "363.44", diff: "-0.06", sourceDate: "2026-09-18" },
      { pair: "EUR/AMD", rate: "417.05", diff: "-0.18", sourceDate: "2026-09-18" },
      { pair: "GBP/AMD", rate: "485.52", diff: "-1.02", sourceDate: "2026-09-18" },
      { pair: "RUB/AMD", rate: "4.3123", diff: expect.any(String), sourceDate: "2026-09-18" },
    ]);
    expect(a.meta).toMatchObject({ source: "CBA", stale: false, isFixture: false });
    expect(new Date(a.meta.asOf).getTime()).toBeGreaterThan(0);
    const before = mock.calls.length;
    const b = await getFxLatest();
    expect(mock.calls.length).toBe(before);
    expect(b.data).toEqual(a.data);
  });

  it("history: exactly 30 points ending 2026-09-21; Sat 09-12 & Sun 09-13 carried from Fri 09-11 (363.28); holiday Mon 09-21 from 09-18", async () => {
    mock = mockFetch(fxHandler());
    const { data, meta } = await getFxHistory({ pair: "USD/AMD", days: 30, today: "2026-09-21" });
    expect(data.pair).toBe("USD/AMD");
    expect(data.series).toHaveLength(30);
    expect(data.series[0].date).toBe("2026-08-23");
    expect(data.series.at(-1)!.date).toBe("2026-09-21");
    const at = (d: string) => data.series.find((p) => p.date === d)!;
    expect(at("2026-09-12")).toEqual({ date: "2026-09-12", rate: "363.28", isCarriedForward: true, sourceDate: "2026-09-11" });
    expect(at("2026-09-13")).toEqual({ date: "2026-09-13", rate: "363.28", isCarriedForward: true, sourceDate: "2026-09-11" });
    expect(at("2026-09-21")).toMatchObject({ rate: "363.44", isCarriedForward: true, sourceDate: "2026-09-18" });
    expect(at("2026-09-11")).toMatchObject({ isCarriedForward: false, sourceDate: "2026-09-11", rate: "363.28" });
    expect(at("2026-09-14")).toMatchObject({ isCarriedForward: false });
    // contiguous calendar days
    for (let i = 1; i < data.series.length; i++) {
      expect(new Date(data.series[i].date).getTime() - new Date(data.series[i - 1].date).getTime()).toBe(86_400_000);
    }
    // carried flag <=> the calendar day had no CBA publication
    const carried = data.series.filter((p) => p.isCarriedForward).map((p) => p.date);
    expect(carried).toContain("2026-08-29"); // Saturday
    expect(carried).toContain("2026-08-30"); // Sunday
    expect(meta).toMatchObject({ source: "CBA", stale: false });
    // one upstream range call serves ALL pairs and day counts
    const calls = mock.calls.length;
    const rub = await getFxHistory({ pair: "RUB/AMD", days: 7, today: "2026-09-21" });
    expect(mock.calls.length).toBe(calls);
    expect(rub.data.series).toHaveLength(7);
    expect(rub.data.series.find((p) => p.date === "2026-09-18")!.rate).toBe("4.3123"); // RUB per 1 unit, 4 decimals
  });

  it("AC-B13: days = 7 / 30 / 90 / 180 / 365 / 366 return exactly that many points with correct carried-forward flags (independent check against the recorded CBA XML)", async () => {
    mock = mockFetch(fxHandler());
    const all = parseRange(cbaXml("range_2025-07-01_2026-09-21.xml"));
    for (const iso of ["USD", "RUB"]) {
      const working = all.filter((r) => r.iso === iso).map((r) => r.date).sort();
      const rateOn = new Map(all.filter((r) => r.iso === iso).map((r) => [r.date, r.rate]));
      for (const days of [7, 30, 90, 180, 365, 366]) {
        const { data } = await getFxHistory({ pair: `${iso}/AMD`, days, today: "2026-09-21" });
        expect(data.series, `${iso} ${days}`).toHaveLength(days);
        expect(data.series.at(-1)!.date).toBe("2026-09-21");
        let carried = 0;
        for (const p of data.series) {
          const src = [...working].reverse().find((d) => d <= p.date)!;
          expect(p.sourceDate, `${iso} ${p.date}`).toBe(src);
          expect(p.isCarriedForward, `${iso} ${p.date}`).toBe(src !== p.date);
          expect(p.rate, `${iso} ${p.date}`).toBe(rateOn.get(src));
          if (p.isCarriedForward) carried++;
        }
        if (days >= 30) expect(carried).toBeGreaterThan(days / 4); // weekends + holidays
      }
    }
    // a single CBA range call served every request above
    expect(mock.calls.filter((c) => c.method === "POST").length).toBe(1);
  });

  it("rows are persisted to market.fx_rate (working days only) so history survives outages", async () => {
    mock = mockFetch(fxHandler());
    await getFxHistory({ pair: "USD/AMD", days: 30, today: "2026-09-21" });
    const db = await getDb();
    const r = await db.execute(sql`select count(*)::int as n from market.fx_rate where iso = 'USD' and rate_date between '2026-08-20' and '2026-09-20'`);
    expect((r.rows[0] as { n: number }).n).toBe(22);
    const sat = await db.execute(sql`select count(*)::int as n from market.fx_rate where rate_date = '2026-09-12'`);
    expect((sat.rows[0] as { n: number }).n).toBe(0);
    const row = await db.execute(sql`select rate, source from market.fx_rate where iso='USD' and rate_date='2026-09-11'`);
    expect(String((row.rows[0] as { rate: string }).rate)).toMatch(/^363\.28/);
    expect((row.rows[0] as { source: string }).source).toBe("CBA");
  });

  it("fallback: CBA 500 / malformed XML / timeout -> Frankfurter(providers=CBA) answers, series identical, meta says so", async () => {
    for (const mode of ["500", "malformed", "timeout"] as const) {
      await resetCache();
      mock = mockFetch(fxHandler({ cba: mode }));
      const { data, meta } = await getFxHistory({ pair: "USD/AMD", days: 30, today: "2026-09-21" });
      expect(data.series, mode).toHaveLength(30);
      expect(data.series.find((p) => p.date === "2026-09-12"), mode).toMatchObject({ rate: "363.28", isCarriedForward: true, sourceDate: "2026-09-11" });
      expect(meta.source).toBe("Frankfurter (CBA data)");
      expect(meta.fallbacks![0].provider).toBe("CBA");
      expect(meta.stale).toBe(false);
      mock.restore();
    }
  });

  it("fallback for latest: CBA+Frankfurter down -> fawazahmed0 (clearly labelled NOT CBA); everything down -> stored CBA rows with stale:true", async () => {
    mock = mockFetch(fxHandler({ cba: "500", frankfurter: "500" }));
    const f = await getFxLatest();
    expect(f.meta.source).toMatch(/fawazahmed0/);
    expect(f.meta.source).toMatch(/not the CBA/);
    expect(f.data.rates[0].rate).toBe("362.7638");
    mock.restore();

    // all providers failing, cache empty -> falls back to the rows persisted earlier in this file
    await resetCache();
    mock = mockFetch(fxHandler({ cba: "500", frankfurter: "500", fawaz: "500" }));
    const s = await getFxLatest();
    expect(s.meta.stale).toBe(true);
    expect(s.meta.source).toMatch(/stored CBA history/);
    expect(s.data.rates.find((r) => r.pair === "USD/AMD")!.sourceDate).toBe("2026-09-18");
    expect(s.data.rates.find((r) => r.pair === "USD/AMD")!.rate).toBe("363.44");
  });

  it("stale-while-revalidate: cached value is served (stale:true) when a later refresh fails", async () => {
    mock = mockFetch(fxHandler());
    const first = await getFxLatest();
    expect(first.meta.stale).toBe(false);
    mock.restore();
    mock = mockFetch(fxHandler({ cba: "500", frankfurter: "500", fawaz: "500" }));
    const forced = await getFxLatest({ forceRefresh: true });
    expect(forced.meta.stale).toBe(true);
    expect(forced.data.rates[0].rate).toBe("363.44");
    expect(forced.meta.note).toMatch(/last good value/);
  });

  it("everything down and nothing stored -> 503 UPSTREAM_UNAVAILABLE (never invented numbers)", async () => {
    const db = await getDb();
    await db.execute(sql`delete from market.fx_rate`);
    mock = mockFetch(fxHandler({ cba: "500", frankfurter: "500", fawaz: "500" }));
    const res = await call(latestRoute.GET, "GET", "/api/market/fx/latest", { jar: user.jar });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
  });

  it("a fallback row never overwrites a CBA row for the same date", async () => {
    mock = mockFetch(fxHandler());
    await getFxHistory({ pair: "USD/AMD", days: 30, today: "2026-09-21" });
    mock.restore();
    await resetCache();
    mock = mockFetch(fxHandler({ cba: "500" }));
    await getFxHistory({ pair: "USD/AMD", days: 30, today: "2026-09-21" });
    const db = await getDb();
    const r = await db.execute(sql`select count(*)::int as n from market.fx_rate where source <> 'CBA' and rate_date between '2026-08-20' and '2026-09-18'`);
    expect((r.rows[0] as { n: number }).n).toBe(0);
  });
});

describe("FX + convert HTTP routes", () => {
  it("require a session (401), validate query strictly, envelope shape", async () => {
    mock = mockFetch(fxHandler());
    expect((await call(latestRoute.GET, "GET", "/api/market/fx/latest")).status).toBe(401);
    expect((await call(historyRoute.GET, "GET", "/api/market/fx/history")).status).toBe(401);
    expect((await call(convertRoute.GET, "GET", "/api/invest/convert?amountAmd=500000")).status).toBe(401);

    const latest = await call(latestRoute.GET, "GET", "/api/market/fx/latest", { jar: user.jar });
    expect(latest.status).toBe(200);
    expect(latest.body.data.rates).toHaveLength(4);
    expect(latest.body.meta).toMatchObject({ source: "CBA", stale: false });

    const hist = await call(historyRoute.GET, "GET", "/api/market/fx/history?pair=EUR/AMD&days=14", { jar: user.jar });
    expect(hist.status).toBe(200);
    expect(hist.body.data.series).toHaveLength(14);
    expect(hist.body.data.pair).toBe("EUR/AMD");
    const def = await call(historyRoute.GET, "GET", "/api/market/fx/history", { jar: user.jar });
    expect(def.body.data.pair).toBe("USD/AMD");
    expect(def.body.data.series).toHaveLength(30);

    for (const q of ["days=6", "days=367", "days=abc", "pair=CHF/AMD", "pair=USD", "extra=1", "days=10.5"]) {
      const r = await call(historyRoute.GET, "GET", `/api/market/fx/history?${q}`, { jar: user.jar });
      expect(r.status, q).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
    }
  });

  it("convert: 500,000 AMD at 363.44 = 1375.74 (exact decimal maths); validation limits", async () => {
    mock = mockFetch(fxHandler());
    const r = await call(convertRoute.GET, "GET", "/api/invest/convert?amountAmd=500000", { jar: user.jar });
    expect(r.status).toBe(200);
    expect(r.body.data).toEqual({ amountAmd: "500000", usd: "1375.74", rate: "363.44", rateDate: "2026-09-18", source: "CBA" });
    expect(r.body.meta).toMatchObject({ source: "CBA", stale: false });
    expect(divideDecimal("1000", "363.44", 2)).toBe("2.75");
    expect(divideDecimal("1000000000", "363.44", 2)).toBe("2751485.80");
    for (const q of ["amountAmd=999", "amountAmd=1000000001", "amountAmd=500000.5", "amountAmd=500,000", "amountAmd=abc", "amountAmd=-5", "", "amountAmd=1&foo=2"]) {
      const bad = await call(convertRoute.GET, "GET", `/api/invest/convert?${q}`, { jar: user.jar });
      expect(bad.status, q).toBe(400);
    }
    expect((await call(convertRoute.GET, "GET", "/api/invest/convert?amountAmd=1000", { jar: user.jar })).status).toBe(200);
    expect((await call(convertRoute.GET, "GET", "/api/invest/convert?amountAmd=1000000000", { jar: user.jar })).status).toBe(200);
  });

  it("text helper sanity (mock)", () => {
    expect(text("x").status).toBe(200);
  });
});
