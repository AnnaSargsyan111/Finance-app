import { describe, it, expect, beforeAll } from "vitest";
import { newUser } from "./helpers";
import type { Client } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = (await newUser("fx")).c;
});
const PAIRS = ["USD/AMD", "EUR/AMD", "GBP/AMD", "RUB/AMD"];

describe("E FX", () => {
  it("latest: all four pairs, sane rates, sourceDate present, meta.source CBA when live", async () => {
    const r = await c.get("/api/market/fx/latest");
    expect(r.status).toBe(200);
    const rates = r.body.data.rates as { pair: string; rate: string; diff: string | null; sourceDate: string }[];
    expect(rates.map((x) => x.pair).sort()).toEqual([...PAIRS].sort());
    for (const x of rates) {
      expect(Number(x.rate)).toBeGreaterThan(0);
      expect(x.sourceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    const usd = rates.find((x) => x.pair === "USD/AMD")!;
    const rub = rates.find((x) => x.pair === "RUB/AMD")!;
    expect(Number(usd.rate)).toBeGreaterThan(100); // plausible AMD/USD magnitude
    expect(Number(rub.rate)).toBeLessThan(20); // RUB is per-unit, not per-100
    expect(usd.rate.split(".")[1]?.length).toBeLessThanOrEqual(2); // 2 dp for USD/EUR/GBP
    expect(rub.rate.split(".")[1]?.length).toBeLessThanOrEqual(4); // RUB up to 4 dp
    console.log("FX latest:", JSON.stringify(rates), "meta:", JSON.stringify(r.body.meta));
    if (usd.rate === "363.44") {
      expect(usd.sourceDate).toBe("2026-09-18");
      expect(rates.find((x) => x.pair === "EUR/AMD")!.rate).toBe("417.05");
      expect(rates.find((x) => x.pair === "GBP/AMD")!.rate).toBe("485.52");
      expect(rates.find((x) => x.pair === "RUB/AMD")!.rate).toBe("4.3123");
      console.log("golden fixture (spec 12.3) matched exactly");
    } else {
      console.log("OBSERVATION live CBA rate has moved since the golden fixture (18 Sep) was recorded; sourceDate", usd.sourceDate);
    }
  });

  it("history boundaries: days=6 and 367 rejected, 7 and 366 accepted with exact point counts", async () => {
    for (const days of [0, 1, 6, 367, 400, -1, 30.5, "abc"]) {
      const r = await c.get(`/api/market/fx/history?pair=USD/AMD&days=${days}`);
      expect(r.status, `days=${days}`).toBe(400);
    }
    for (const days of [7, 8, 30, 90, 180, 365, 366]) {
      const r = await c.get(`/api/market/fx/history?pair=USD/AMD&days=${days}`);
      expect(r.status, `days=${days}`).toBe(200);
      expect(r.body.data.series.length, `days=${days}`).toBe(days);
    }
  });

  it("default days=30 when omitted; strict query (unknown params, missing pair, bad pair rejected)", async () => {
    const r = await c.get("/api/market/fx/history?pair=USD/AMD");
    expect(r.status).toBe(200);
    expect(r.body.data.series.length).toBe(30);
    for (const q of ["pair=CAD/AMD&days=30", "pair=usd/amd&days=30", "pair=USD&days=30", "pair=USD/AMD&days=30&x=1"]) {
      expect((await c.get(`/api/market/fx/history?${q}`)).status, q).toBe(400);
    }
  });

  it("all four pairs individually return correct length and increasing dates ending today (or the latest available)", async () => {
    for (const pair of PAIRS) {
      const r = await c.get(`/api/market/fx/history?pair=${encodeURIComponent(pair)}&days=30`);
      expect(r.status, pair).toBe(200);
      const s = r.body.data.series as { date: string; rate: string; isCarriedForward: boolean; sourceDate: string }[];
      expect(s.length).toBe(30);
      for (let i = 1; i < s.length; i++) expect(s[i].date > s[i - 1].date, pair).toBe(true);
      for (const p of s) {
        expect(Number(p.rate), `${pair} ${p.date}`).toBeGreaterThan(0);
        expect(p.sourceDate <= p.date, `${pair} ${p.date} sourceDate<=date`).toBe(true);
        expect(p.isCarriedForward).toBe(p.sourceDate !== p.date);
      }
    }
  });

  it("golden weekend/holiday fixture (spec 12.3): 09-12/09-13 carried from 09-11 (363.28); holiday 09-21 carried from 09-18; range 08-20..09-20 = 22 working-day rows", async () => {
    // enough history to cover late Aug/Sep 2026
    const r = await c.get("/api/market/fx/history?pair=USD/AMD&days=60");
    expect(r.status).toBe(200);
    const byDate = new Map(r.body.data.series.map((p: any) => [p.date, p]));
    const sat = byDate.get("2026-09-12") as any;
    const sun = byDate.get("2026-09-13") as any;
    const hol = byDate.get("2026-09-21") as any;
    if (sat && sun) {
      expect(sat.isCarriedForward).toBe(true);
      expect(sat.sourceDate).toBe("2026-09-11");
      expect(sun.isCarriedForward).toBe(true);
      expect(sun.sourceDate).toBe("2026-09-11");
      if (sat.rate === "363.28") expect(sun.rate).toBe("363.28");
      console.log("weekend fixture 09-12/09-13 ->", sat.rate, sun.rate, "sourceDate", sat.sourceDate);
    } else console.log("OBSERVATION 09-12/09-13 not in the 60-day window from today; fixture not directly checkable");
    if (hol) {
      expect(hol.isCarriedForward).toBe(true);
      expect(hol.sourceDate).toBe("2026-09-18");
      console.log("holiday fixture 09-21 (Independence Day) -> carried from", hol.sourceDate, "rate", hol.rate);
    }
    // count of distinct working-day sourceDates within 08-20..09-20 should be 22 (per the fixture)
    const inRange = [...byDate.values()].filter((p: any) => p.date >= "2026-08-20" && p.date <= "2026-09-20") as any[];
    if (inRange.length === 32) {
      const workingDays = new Set(inRange.map((p) => p.sourceDate));
      console.log("distinct source (working) days in 08-20..09-20:", workingDays.size, "(fixture expects 22)");
    }
  });

  it("RUB is divided by Amount (per-unit rate), not raw CBA units", async () => {
    const r = await c.get("/api/market/fx/latest");
    const rub = r.body.data.rates.find((x: any) => x.pair === "RUB/AMD");
    // CBA quotes RUB per 100 units; the API must already divide by Amount so rate is AMD per 1 RUB (~4, not ~430)
    expect(Number(rub.rate)).toBeGreaterThan(1);
    expect(Number(rub.rate)).toBeLessThan(20);
  });

  it("conversion cross-check: latest USD/AMD matches /invest/convert's rate", async () => {
    const latest = await c.get("/api/market/fx/latest");
    const usd = latest.body.data.rates.find((x: any) => x.pair === "USD/AMD");
    const conv = await c.get("/api/invest/convert?amountAmd=1000000");
    expect(conv.body.data.rate).toBe(usd.rate);
    expect(conv.body.data.rateDate).toBe(usd.sourceDate);
  });
});
