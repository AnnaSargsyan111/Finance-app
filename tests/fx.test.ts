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
import * as banksRoute from "@/app/api/market/fx/banks/route";
import { getBankRates, parseBankRates } from "@/market/fx/bank-rates";
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
  it("latest: USD 363.44, EUR 417.05, GEL 139.53, RUB 4.3123, CurrentDate 2026-09-18", () => {
    const r = parseLatest(cbaXml("latest_2026-09-21.xml"), ["USD", "EUR", "GEL", "RUB"]);
    expect(r.currentDate).toBe("2026-09-18");
    const by = Object.fromEntries(r.observations.map((o) => [o.iso, o]));
    expect(by.USD).toMatchObject({ rate: "363.44", diff: "-0.06", date: "2026-09-18" });
    expect(by.EUR.rate).toBe("417.05");
    expect(by.GEL.rate).toBe("139.53");
    expect(by.RUB.rate).toBe("4.3123");
  });

  it("range 2026-08-20..2026-09-20: 22 working-day rows per currency, dates exactly as the handover lists", () => {
    const rows = parseRange(cbaXml("range_2026-08-20_2026-09-20.xml"));
    const expectedDates = [
      "2026-08-20", "2026-08-21", "2026-08-24", "2026-08-25", "2026-08-26", "2026-08-27", "2026-08-28", "2026-08-31",
      "2026-09-01", "2026-09-02", "2026-09-03", "2026-09-04", "2026-09-07", "2026-09-08", "2026-09-09", "2026-09-10", "2026-09-11",
      "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18",
    ];
    for (const iso of ["USD", "EUR", "GEL", "RUB"]) {
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
      { pair: "GEL/AMD", rate: "139.53", diff: "-0.01", sourceDate: "2026-09-18" },
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

/* Bank buy/sell rates: a SYNTHETIC page with invented numbers, in the shape of the Rate.am banks page (Next.js flight payload:
   `<hex id>:<json>` lines whose values point at each other as "$<hex id>"). */
function flightPage(banks: Record<string, unknown>, opts: { omitRates?: boolean } = {}): string {
  const lines: string[] = [];
  let next = 1;
  const emit = (v: unknown): string => {
    const id = (next++).toString(16);
    lines.push(`${id}:${JSON.stringify(v)}`);
    return `$${id}`;
  };
  // organisation details use the same bank keys but have no `rates` - the parser must skip that chunk
  emit(Object.fromEntries(Object.keys(banks).map((k) => [k, emit({ name: k, slug: k })])));
  const root: Record<string, string> = {};
  for (const [code, b] of Object.entries(banks)) {
    const { lastUpdated, rates } = b as { lastUpdated: number; rates: Record<string, Record<string, unknown>> };
    const rateRefs = Object.fromEntries(Object.entries(rates).map(([iso, boards]) => [iso, emit(Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, emit(v)])))]));
    root[code] = emit({ lastUpdated, ...(opts.omitRates ? {} : { rates: emit(rateRefs) }) });
  }
  emit(root);
  const pushes = lines.map((l) => `<script>self.__next_f.push([1,${JSON.stringify(l + "\n")}])</script>`);
  return `<html><body>${pushes.join("")}</body></html>`;
}
const T = 1791045913000; // 2026-10-03T16:45:13Z
const board = (buy: string, sell: string) => ({ buy, sell });
const bankPage = (opts: { omitRates?: boolean } = {}) =>
  flightPage(
    {
      ameriabank: {
        lastUpdated: T,
        rates: {
          USD: { CASH: board("360.00", "365.00"), CLEARING: board("360.00", "365.00") },
          EUR: { CASH: board("401.00", "415.00"), CLEARING: board("401.00", "415.50") },
          RUR: { CASH: board("4.07", "4.40"), CLEARING: board("4.20", "4.45") },
          GEL: { CASH: board("134.00", "144.50"), CLEARING: board("", "") }, // not quoted non-cash
          JPY: { CASH: board("2.18", "2.43"), CLEARING: board("2.18", "2.43") }, // not one of our currencies
        },
      },
      "acba-bank": {
        lastUpdated: T,
        rates: {
          USD: { CASH: board("360", "364"), CARD: board("1", "2"), CLEARING: board("360", "365") },
          GEL: { CASH: board("137", "147"), CARD: board("137", "147"), CLEARING: board("137", "147") },
        },
      },
      "aydi-bank": { lastUpdated: T, rates: { USD: { CASH: board("0", "364"), CLEARING: board("360", "x") } } }, // invalid numbers
      "some-other-bank": { lastUpdated: T, rates: { USD: { CASH: board("350", "370") } } }, // not one of our banks
    },
    opts,
  );
const rateAmHost = (res: () => Response) => (url: string) => (new URL(url).host === "www.rate.am" ? res() : undefined);
const htmlRes = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

describe("bank buy/sell rates (cash and non-cash)", () => {
  it("reads our three banks from the page payload: CASH board = Cash, CLEARING board = Non-cash (CARD ignored); rouble RUR -> RUB", () => {
    const banks = parseBankRates(bankPage());
    expect(banks.map((b) => b.id)).toEqual(["ameriabank", "acba"]); // idbank has no valid number, the other bank is not ours
    expect(banks[0]).toEqual({
      id: "ameriabank",
      name: "Ameriabank",
      capturedAt: "2026-10-03T16:45:13.000Z",
      cash: [
        { pair: "USD/AMD", buy: "360.00", sell: "365.00" },
        { pair: "EUR/AMD", buy: "401.00", sell: "415.00" },
        { pair: "GEL/AMD", buy: "134.00", sell: "144.50" },
        { pair: "RUB/AMD", buy: "4.07", sell: "4.40" },
      ],
      nonCash: [
        { pair: "USD/AMD", buy: "360.00", sell: "365.00" },
        { pair: "EUR/AMD", buy: "401.00", sell: "415.50" },
        { pair: "RUB/AMD", buy: "4.20", sell: "4.45" }, // no GEL: empty strings mean "not quoted"
      ],
    });
    expect(banks[1].cash.map((r) => `${r.pair} ${r.buy}/${r.sell}`)).toEqual(["USD/AMD 360.00/364.00", "GEL/AMD 137.00/147.00"]);
    expect(banks[1].nonCash.map((r) => `${r.pair} ${r.buy}/${r.sell}`)).toEqual(["USD/AMD 360.00/365.00", "GEL/AMD 137.00/147.00"]);
  });

  it("an unrecognised page, or a payload without rates, is an upstream error (never a half-empty answer)", () => {
    expect(() => parseBankRates("<html>maintenance</html>")).toThrow(/unexpected format/);
    expect(() => parseBankRates(bankPage({ omitRates: true }))).toThrow(/unexpected format/);
  });

  it("GET /api/market/fx/banks: session required, envelope with both boards and attribution, cached (2nd call = no upstream)", async () => {
    mock = mockFetch(rateAmHost(() => htmlRes(bankPage())));
    expect((await call(banksRoute.GET, "GET", "/api/market/fx/banks")).status).toBe(401);
    const r = await call(banksRoute.GET, "GET", "/api/market/fx/banks", { jar: user.jar });
    expect(r.status).toBe(200);
    expect(r.body.data.attribution).toEqual({ name: "Rate.am", url: "https://www.rate.am" });
    expect(r.body.data.banks).toHaveLength(2);
    expect(r.body.data.banks[0].cash).toHaveLength(4);
    expect(r.body.data.banks[0].nonCash).toHaveLength(3);
    expect(r.body.meta).toMatchObject({ stale: false, isFixture: false });
    const before = mock.calls.length;
    await call(banksRoute.GET, "GET", "/api/market/fx/banks", { jar: user.jar });
    expect(mock.calls.length).toBe(before);
  });

  it("source down and nothing cached -> 503 UPSTREAM_UNAVAILABLE; after a good fetch, a later failure serves the last good value flagged stale", async () => {
    mock = mockFetch(rateAmHost(() => text("nope", 500)));
    const down = await call(banksRoute.GET, "GET", "/api/market/fx/banks", { jar: user.jar });
    expect(down.status).toBe(503);
    expect(down.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    mock.restore();
    await resetCache(); // forget the remembered failure

    mock = mockFetch(rateAmHost(() => htmlRes(bankPage())));
    await getBankRates();
    mock.restore();
    mock = mockFetch(rateAmHost(() => htmlRes("<html>changed layout</html>")));
    const stale = await getBankRates({ forceRefresh: true });
    expect(stale.meta.stale).toBe(true);
    expect(stale.data.banks).toHaveLength(2);
  });
});
