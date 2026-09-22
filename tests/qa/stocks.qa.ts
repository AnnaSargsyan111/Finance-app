import { describe, it, expect, beforeAll } from "vitest";
import { newUser } from "./helpers";
import type { Client } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = (await newUser("stocks")).c;
});
const DISPLAY = ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"];

describe("G stocks (display)", () => {
  it("exactly the five display symbols, in the documented order, no key material in the payload", async () => {
    const r = await c.get("/api/market/stocks");
    expect(r.status).toBe(200);
    const items = r.body.data.items as any[];
    expect(items.map((x) => x.symbol)).toEqual(DISPLAY);
    expect(r.text).not.toMatch(/api[_-]?key|finnhub.{0,3}[a-z0-9]{20,}|twelvedata.{0,3}[a-z0-9]{20,}/i);
    expect(r.body.meta.notConfigured).toBeTruthy();
    console.log("stocks meta:", JSON.stringify(r.body.meta));
  });

  it("field consistency: change = price - previousClose, changePct = change/previousClose*100; null fields have a reason", async () => {
    const r = await c.get("/api/market/stocks");
    for (const it of r.body.data.items as any[]) {
      if (it.price != null && it.previousClose != null && it.change != null) {
        const price = Number(it.price), prev = Number(it.previousClose), chg = Number(it.change);
        expect(Math.abs(chg - (price - prev)), it.symbol).toBeLessThan(0.011);
        if (it.changePct != null) {
          const expPct = ((price - prev) / prev) * 100;
          expect(Math.abs(it.changePct - expPct), `${it.symbol} changePct`).toBeLessThan(0.05);
        }
      }
      const unavailable = it.unavailable ?? {};
      for (const [field, val] of Object.entries(it)) {
        if (val === null && field !== "unavailable") expect(unavailable[field], `${it.symbol}.${field} null without a reason`).toBeTruthy();
      }
      expect(it.isDelayed).toBe(true); // no keys configured -> always delayed/fixture in this environment
      expect(it.asOf).toBeTruthy();
      expect(typeof it.source).toBe("string");
    }
  });

  it("honest labelling: isDelayed / isFixture / notConfigured reflect the actual (keyless) environment", async () => {
    const r = await c.get("/api/market/stocks");
    expect(r.body.meta.isDelayed).toBe(true);
    expect(Array.isArray(r.body.meta.notConfigured)).toBe(true);
    expect(r.body.meta.notConfigured.length).toBeGreaterThan(0);
    for (const it of r.body.data.items as any[]) {
      // fundamentals are annual, not TTM: source string should say so (research 5.3 / API-CONTRACT)
      if (it.fieldSources) console.log(it.symbol, "fieldSources:", JSON.stringify(it.fieldSources));
    }
  });

  it("history: ~21 points for 1m, symbol must be a display company (others 404), invalid range rejected", async () => {
    for (const sym of DISPLAY) {
      const r = await c.get(`/api/market/stocks/${sym}/history?range=1m`);
      expect(r.status, sym).toBe(200);
      const s = r.body.data.series as { date: string; close: string }[];
      expect(s.length, sym).toBeGreaterThanOrEqual(18);
      expect(s.length, sym).toBeLessThanOrEqual(24);
      for (let i = 1; i < s.length; i++) expect(s[i].date > s[i - 1].date, sym).toBe(true);
      for (const p of s) expect(Number(p.close), `${sym} ${p.date}`).toBeGreaterThan(0);
    }
    for (const range of ["3m", "6m", "1y"]) {
      const r = await c.get(`/api/market/stocks/NVDA/history?range=${range}`);
      expect(r.status, range).toBe(200);
      expect(r.body.data.series.length).toBeGreaterThan(20);
    }
    expect((await c.get("/api/market/stocks/TSLA/history?range=1m")).status).toBe(404);
    const lower = await c.get("/api/market/stocks/nvda/history?range=1m");
    console.log("OBSERVATION lower-case symbol 'nvda' ->", lower.status, "(case-insensitive matching; not necessarily wrong)");
    expect((await c.get("/api/market/stocks/NVDA/history?range=2y")).status).toBe(400);
    const noRange = await c.get("/api/market/stocks/NVDA/history");
    console.log("OBSERVATION range omitted ->", noRange.status, "(defaults rather than rejecting; not necessarily wrong)");
    expect((await c.get("/api/market/stocks/NVDA/history?range=1m&x=1")).status).toBe(400);
  });

  it("providers endpoint: no key material, reports live/fixture/notConfigured", async () => {
    const r = await c.get("/api/market/providers");
    expect(r.status).toBe(200);
    expect(r.text).not.toMatch(/[a-z0-9]{24,}/i); // no raw key-looking tokens
    console.log("providers:", r.text.slice(0, 400));
  });
});
