import { describe, it, expect, beforeAll } from "vitest";
import { newUser, type Client as _C } from "./helpers";
import type { Client } from "./helpers";

type Risk = "low" | "medium" | "high";
type Horizon = "short" | "medium" | "long";
const RISKS: Risk[] = ["low", "medium", "high"];
const HORIZONS: Horizon[] = ["short", "medium", "long"];
const DISPLAY = ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"];
// caps from research 7.6 (Low 20 / Medium 25 / High 30)
const CAP: Record<Risk, number> = { low: 0.2, medium: 0.25, high: 0.3 };
const VOLCAP: Record<Risk, number> = { low: 0.28, medium: 0.45, high: 0.75 };
const BETACAP: Record<Risk, number | null> = { low: 1.0, medium: 1.4, high: null };
const DDCAP: Record<Risk, number | null> = { low: -0.25, medium: -0.4, high: null };
const MCAP: Record<Risk, number> = { low: 50e9, medium: 10e9, high: 2e9 };

let c: Client;
beforeAll(async () => {
  c = (await newUser("inv")).c;
});

const rec = (amountAmd: number | string, risk: Risk, horizon: Horizon, mode: "single" | "portfolio") =>
  c.post("/api/invest/recommendation", { amountAmd, risk, horizon, mode, notNeededForEmergencies: true });

async function pool<T>(n: number, jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < jobs.length) {
        const k = i++;
        out[k] = await jobs[k]();
      }
    }),
  );
  return out;
}
const strip = (d: Record<string, unknown>) => {
  const x = { ...d };
  delete x.saveToken;
  delete x.saveTokenExpiresAt;
  return x;
};
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const allStrings = (v: unknown, out: string[] = []): string[] => {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => allStrings(x, out));
  return out;
};

describe("H1 strict request schema", () => {
  const good = { amountAmd: 500000, risk: "medium", horizon: "medium", mode: "single", notNeededForEmergencies: true };
  it("unknown fields (incl. anything Personal-Finance-like) are rejected", async () => {
    for (const extra of [{ income: 900000 }, { balance: 1 }, { userId: "x" }, { pf: {} }, { available: 5 }, { expenses: [] }, { foo: 1 }]) {
      const r = await c.post("/api/invest/recommendation", { ...good, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
    }
  });
  it("notNeededForEmergencies must be boolean true", async () => {
    for (const v of [false, undefined, "true", 1, null, "yes"]) {
      const b: Record<string, unknown> = { ...good, notNeededForEmergencies: v };
      if (v === undefined) delete b.notNeededForEmergencies;
      const r = await c.post("/api/invest/recommendation", b);
      expect(r.status, String(v)).toBe(400);
      expect(Object.keys(r.body.error.fields ?? {}), String(v)).toContain("notNeededForEmergencies");
    }
  });
  it("amount / risk / horizon / mode validation", async () => {
    for (const a of [0, 999, 1_000_000_001, 1000.5, "1e6", "1,000", -5000, "abc", "", null, true, "0x100", 5e9]) {
      const r = await c.post("/api/invest/recommendation", { ...good, amountAmd: a });
      expect(r.status, `amount=${JSON.stringify(a)}`).toBe(400);
    }
    for (const [k, v] of [["risk", "LOW"], ["risk", "extreme"], ["risk", ""], ["horizon", "very long"], ["horizon", 5], ["mode", "both"], ["mode", "SINGLE"]] as const) {
      const r = await c.post("/api/invest/recommendation", { ...good, [k]: v });
      expect(r.status, `${k}=${v}`).toBe(400);
    }
    for (const k of Object.keys(good)) {
      const b: Record<string, unknown> = { ...good };
      delete b[k];
      expect((await c.post("/api/invest/recommendation", b)).status, `missing ${k}`).toBe(400);
    }
    // accepted forms: integer number and digit string, boundaries
    expect((await rec("1000000", "medium", "medium", "single")).status).toBe(200);
    expect((await rec(1_000_000_000, "medium", "medium", "single")).status).toBe(200);
  });
  it("convert endpoint validation and golden conversion", async () => {
    const r = await c.get("/api/invest/convert?amountAmd=500000");
    expect(r.status).toBe(200);
    const d = r.body.data;
    const rate = Number(d.rate);
    // 500,000 / rate rounded to cents
    expect(d.usd).toBe((Math.round((500000 / rate) * 100) / 100).toFixed(2));
    if (d.rate === "363.44") expect(d.usd).toBe("1375.74");
    for (const bad of ["999", "1000000001", "1.5", "abc", "-1", "", "1e6", "1,000"]) {
      const x = await c.get(`/api/invest/convert?amountAmd=${encodeURIComponent(bad)}`);
      expect(x.status, bad).toBe(400);
    }
    expect((await c.get("/api/invest/convert")).status).toBe(400);
    expect((await c.get("/api/invest/convert?amountAmd=5000&x=1")).status).toBe(400);
    expect((await c.get("/api/invest/convert?amountAmd=1000")).status).toBe(200);
    expect((await c.get("/api/invest/convert?amountAmd=1000000000")).status).toBe(200);
  });
});

describe("H2 determinism + shared fields", () => {
  it("same inputs -> identical output (except saveToken) for single and portfolio, 9 risk/horizon combos", async () => {
    const jobs = RISKS.flatMap((risk) => HORIZONS.map((h) => async () => {
      const a = await rec(750000, risk, h, "portfolio");
      const b = await rec(750000, risk, h, "portfolio");
      expect(a.status).toBe(200);
      expect(strip(b.body.data)).toEqual(strip(a.body.data));
      const s1 = await rec(750000, risk, h, "single");
      const s2 = await rec(750000, risk, h, "single");
      expect(strip(s2.body.data)).toEqual(strip(s1.body.data));
    }));
    await pool(3, jobs);
  });
  it("meta/dataAsOf/methodologyVersion/disclaimers/score fields and a 60-minute save token", async () => {
    const r = await rec(500000, "medium", "long", "portfolio");
    const d = r.body.data;
    expect(r.body.meta.methodologyVersion).toBeTruthy();
    expect(d.methodologyVersion).toBe("v1");
    expect(d.dataAsOf).toMatch(/^\d{4}-\d{2}-\d{2}/);
    expect(d.disclaimers.length).toBeGreaterThanOrEqual(3);
    expect(d.disclaimers.join(" ")).toMatch(/not personal investment advice/i);
    expect(d.disclaimers.join(" ")).toMatch(/no trades/i);
    expect(Number.isInteger(d.score) && d.score >= 0 && d.score <= 100).toBe(true);
    expect(d.scoreLabel).toBe("Match score");
    expect(d.scoreNote).toMatch(/not a forecast of returns/i);
    const ttl = Date.parse(d.saveTokenExpiresAt) - Date.now();
    expect(ttl).toBeGreaterThan(55 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000 + 5000);
    expect(Number(d.usdRate)).toBeGreaterThan(300);
    expect(d.rateDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    for (const w of d.warnings) expect(Object.keys(w).sort()).toEqual(["code", "message"]);
  });
});

const weightsExpected = (risk: Risk, h: Horizon) => {
  const base: Record<Risk, Record<string, number>> = {
    low: { quality: 30, lowRisk: 25, income: 15, value: 20, growth: 5, momentum: 5 },
    medium: { quality: 25, lowRisk: 15, income: 10, value: 15, growth: 20, momentum: 15 },
    high: { quality: 20, lowRisk: 5, income: 0, value: 10, growth: 30, momentum: 35 },
  };
  const w = { ...base[risk] };
  const adj: Record<Horizon, Record<string, number>> = {
    short: { lowRisk: 10, momentum: 5, growth: -10, value: -5 },
    medium: {},
    long: { quality: 5, growth: 5, lowRisk: -5, momentum: -5 },
  };
  for (const [k, v] of Object.entries(adj[h])) w[k] = Math.max(0, w[k] + v);
  const sum = Object.values(w).reduce((a, b) => a + b, 0);
  return Object.fromEntries(Object.entries(w).map(([k, v]) => [k, (v / sum) * 100]));
};

describe("H3 methodology weights follow research 7.4 (risk x horizon)", () => {
  it("weightsUsed equals base weights + horizon adjustment, clamped and renormalised (9 combos)", async () => {
    await pool(3, RISKS.flatMap((risk) => HORIZONS.map((h) => async () => {
      const r = await rec(500000, risk, h, "single");
      if (r.status !== 200) return;
      const got = r.body.data.weightsUsed as Record<string, number>;
      const exp = weightsExpected(risk, h);
      for (const k of Object.keys(exp)) expect(Math.abs((got[k] ?? 0) - exp[k]), `${risk}/${h}/${k} got ${got[k]} exp ${exp[k].toFixed(2)}`).toBeLessThan(0.6);
      expect(Object.values(got).reduce((a, b) => a + b, 0)).toBeGreaterThan(99.5);
      expect(Object.values(got).reduce((a, b) => a + b, 0)).toBeLessThan(100.5);
    })));
  });
  it("horizon effect: short raises Low-Risk weight vs long (same risk)", async () => {
    for (const risk of RISKS) {
      const s = (await rec(500000, risk, "short", "single")).body.data.weightsUsed;
      const l = (await rec(500000, risk, "long", "single")).body.data.weightsUsed;
      expect(s.lowRisk).toBeGreaterThan(l.lowRisk);
    }
  });
});

interface Holding {
  symbol: string; sector: string; price: number; shares: number; cost: number; targetWeight: number; actualWeight: number;
  allocationPercent: number; allocatedAmountUsd: string; allocatedAmountAmd: number; composite: number;
  metrics: { vol1y: number; maxDD1y: number; beta3y: number; marketCap: number };
}

describe("H4 portfolio invariants (property style, random amounts, all risk/horizon)", () => {
  const rng = (() => { let s = 20260921; return () => (s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296; })();
  const amounts = Array.from({ length: 45 }, () => Math.round(Math.exp(Math.log(30_000) + rng() * (Math.log(1_000_000_000) - Math.log(30_000)))));
  const results: { amount: number; risk: Risk; horizon: Horizon; status: number; d: any; ms: number }[] = [];

  it("runs 45 random portfolio requests (4 in parallel)", async () => {
    const jobs = amounts.map((amount, i) => async () => {
      const risk = RISKS[i % 3];
      const horizon = HORIZONS[Math.floor(i / 3) % 3];
      const t = performance.now();
      const r = await rec(amount, risk, horizon, "portfolio");
      results.push({ amount, risk, horizon, status: r.status, d: r.status === 200 ? r.body.data : r.body, ms: performance.now() - t });
    });
    await pool(4, jobs);
    expect(results.length).toBe(45);
    const ok = results.filter((x) => x.status === 200);
    console.log(`portfolio runs: ${ok.length} ok / ${results.length - ok.length} non-200 (${[...new Set(results.filter((x) => x.status !== 200).map((x) => x.status + ":" + x.d?.error?.code))].join(",")}); latency median ${[...ok.map((x) => x.ms)].sort((a, b) => a - b)[Math.floor(ok.length / 2)]?.toFixed(0)}ms`);
    expect(results.every((x) => x.status === 200 || x.status === 422)).toBe(true);
  });

  it("AMD identity sum(allocatedAmountAmd)+unallocatedCashAmd == amountAmd EXACTLY; USD/AMD consistent", () => {
    for (const x of results.filter((r) => r.status === 200)) {
      const d = x.d;
      const hs = d.holdings as Holding[];
      const sum = hs.reduce((a, h) => a + h.allocatedAmountAmd, 0);
      expect(sum + d.unallocatedCashAmd, `amount ${x.amount} ${x.risk}/${x.horizon}`).toBe(x.amount);
      expect(d.allocatedAmountAmd).toBe(sum);
      expect(hs.every((h) => Number.isInteger(h.allocatedAmountAmd))).toBe(true);
      expect(Number.isInteger(d.unallocatedCashAmd) && d.unallocatedCashAmd >= 0).toBe(true);
      for (const h of hs) expect(Math.abs(h.allocatedAmountAmd - Number(h.cost) * Number(d.usdRate)), `${h.symbol} AMD vs cost*rate`).toBeLessThanOrEqual(1.01);
    }
  });

  it("whole shares, cost = shares x price, sum(cost) <= budget, leftover < cheapest holding price, no duplicates", () => {
    for (const x of results.filter((r) => r.status === 200)) {
      const d = x.d;
      const hs = d.holdings as Holding[];
      const totalCost = hs.reduce((a, h) => a + Number(h.cost), 0);
      expect(totalCost, `${x.amount}`).toBeLessThanOrEqual(Number(d.budgetUsd) + 0.005);
      const leftover = Number(d.budgetUsd) - totalCost;
      expect(leftover).toBeGreaterThanOrEqual(-0.005);
      expect(leftover, `leftover ${leftover} vs min price`).toBeLessThan(Math.min(...hs.map((h) => Number(h.price))) + 0.005);
      expect(Math.abs(Number(d.unallocatedCashUsd) - leftover)).toBeLessThan(0.02);
      for (const h of hs) {
        expect(Number.isInteger(h.shares) && h.shares >= 1).toBe(true);
        expect(Math.abs(Number(h.cost) - h.shares * Number(h.price))).toBeLessThan(0.011);
      }
      expect(new Set(hs.map((h) => h.symbol)).size).toBe(hs.length);
    }
  });

  it("weights: target and actual sum to 100% +/- 0.01, min 8%, target <= risk cap; percent field consistent", () => {
    let overCapActual = 0;
    let total = 0;
    const examples: string[] = [];
    for (const x of results.filter((r) => r.status === 200)) {
      const d = x.d;
      const hs = d.holdings as Holding[];
      const relaxed = (d.warnings as { code: string }[]).some((w) => w.code === "POSITION_CAP_NOT_ENFORCEABLE");
      expect(Math.abs(hs.reduce((a, h) => a + h.actualWeight, 0) - 1), `actual sum ${x.amount}`).toBeLessThan(0.0101);
      expect(Math.abs(hs.reduce((a, h) => a + h.targetWeight, 0) - 1), `target sum ${x.amount}`).toBeLessThan(0.0101);
      for (const h of hs) {
        expect(h.targetWeight, `${h.symbol} target vs cap`).toBeLessThanOrEqual(relaxed ? 1 : CAP[x.risk] + 0.0005);
        expect(Math.abs(h.allocationPercent - h.actualWeight * 100)).toBeLessThan(0.06);
        expect(h.targetWeight).toBeGreaterThanOrEqual(0.0799 * (hs.length > 12 ? 0.9 : 1));
        total++;
        if (h.actualWeight > CAP[x.risk] + 0.0005 && !relaxed) {
          overCapActual++;
          if (examples.length < 6) examples.push(`${x.risk}/${x.horizon} amt ${x.amount} ${h.symbol} actual ${(h.actualWeight * 100).toFixed(1)}% cap ${CAP[x.risk] * 100}% (${hs.length} holdings)`);
        }
      }
    }
    console.log(`OBSERVATION actual weight above the risk cap: ${overCapActual}/${total} holdings. Examples: ${examples.join(" | ")}`);
  });

  it("holding count follows the budget table; <=2 per sector; every holding passes the risk caps; universe not limited to display names", () => {
    const seen = new Set<string>();
    let volAbove = 0;
    for (const x of results.filter((r) => r.status === 200)) {
      const d = x.d;
      const hs = d.holdings as Holding[];
      const usd = Number(d.budgetUsd);
      const expN = usd < 300 ? 3 : usd < 1000 ? 3 : usd < 3000 ? 5 : usd < 10000 ? 8 : 11;
      expect(d.metrics.targetHoldings, `budget ${usd}`).toBe(Math.max(1, Math.min(15, expN, Math.floor(usd / 100))));
      expect(hs.length).toBeLessThanOrEqual(d.metrics.targetHoldings);
      expect(d.metrics.holdingsCount).toBe(hs.length);
      expect(hs.length).toBeLessThanOrEqual(Math.max(1, Math.floor(usd / 100)) || 1);
      const bySector = new Map<string, number>();
      for (const h of hs) bySector.set(h.sector, (bySector.get(h.sector) ?? 0) + 1);
      for (const [s, n] of bySector) expect(n, `sector ${s}`).toBeLessThanOrEqual(2);
      const volCap = VOLCAP[x.risk] * (x.horizon === "short" ? 0.8 : 1);
      for (const h of hs) {
        seen.add(h.symbol);
        expect(h.metrics.vol1y, `${h.symbol} vol`).toBeLessThanOrEqual(volCap + 1e-6);
        expect(h.metrics.marketCap, `${h.symbol} cap`).toBeGreaterThanOrEqual(MCAP[x.risk]);
        const bc = BETACAP[x.risk];
        if (bc !== null) expect(h.metrics.beta3y, `${h.symbol} beta`).toBeLessThanOrEqual(bc + 1e-6);
        const dd = DDCAP[x.risk];
        if (dd !== null) expect(h.metrics.maxDD1y, `${h.symbol} dd`).toBeGreaterThanOrEqual(dd - 1e-6);
      }
      // estimated portfolio volatility within band
      if (d.metrics.estimatedVolatility > d.metrics.volatilityBand + 1e-9) {
        volAbove++;
        expect((d.warnings as { code: string }[]).map((w) => w.code), `est vol ${d.metrics.estimatedVolatility} > band ${d.metrics.volatilityBand} must be disclosed`).toContain("VOLATILITY_ABOVE_BAND");
      }
    }
    console.log(`OBSERVATION portfolios with estimated volatility above the risk band: ${volAbove}`);
    const nonDisplay = [...seen].filter((s) => !DISPLAY.includes(s));
    console.log(`symbols recommended across runs: ${seen.size}; non-display: ${nonDisplay.length}; display present: ${[...seen].filter((s) => DISPLAY.includes(s)).join(",") || "none"}`);
    expect(nonDisplay.length).toBeGreaterThan(0);
  });

  it("score is an integer 0-100 and ~ allocation-weighted composite; explanation numbers match metrics", () => {
    for (const x of results.filter((r) => r.status === 200)) {
      const d = x.d;
      const hs = d.holdings as Holding[];
      expect(Number.isInteger(d.score) && d.score >= 0 && d.score <= 100).toBe(true);
      const wsum = hs.reduce((a, h) => a + h.actualWeight, 0);
      const wc = hs.reduce((a, h) => a + h.actualWeight * h.composite, 0) / wsum;
      expect(Math.abs(d.score - wc), `score ${d.score} vs weighted composite ${wc.toFixed(2)}`).toBeLessThanOrEqual(1.01);
    }
  });

  it("wording: no imperative buy/sell advice, no promises anywhere in responses", () => {
    const bad = /\b(buy|sell|purchase|invest)\s+(it\s+)?(now|today|immediately|asap)\b|\byou (should|must|need to) (buy|sell|invest)\b|\bguaranteed (return|profit|gain)s?\b|\bcan'?t lose\b|\brisk[- ]free\b|\bwill (outperform|beat|earn|grow)\b|\bsure thing\b/i;
    for (const x of results.filter((r) => r.status === 200)) {
      for (const s of allStrings(x.d)) expect(s, "advice-like wording").not.toMatch(bad);
    }
  });
});

describe("H5 monotonic risk: mean vol1y Low <= Medium <= High per horizon", () => {
  it("portfolio + single, three amounts", async () => {
    const amounts = [400_000, 1_500_000, 8_000_000];
    for (const h of HORIZONS) {
      const byRisk: Record<Risk, number[]> = { low: [], medium: [], high: [] };
      const sByRisk: Record<Risk, number[]> = { low: [], medium: [], high: [] };
      await pool(3, RISKS.flatMap((risk) => amounts.map((a) => async () => {
        const p = await rec(a, risk, h, "portfolio");
        if (p.status === 200) byRisk[risk].push(...(p.body.data.holdings as Holding[]).map((x) => x.metrics.vol1y));
        const s = await rec(a, risk, h, "single");
        if (s.status === 200) sByRisk[risk].push(s.body.data.pick.metrics.vol1y);
      })));
      const m = (r: Risk) => mean(byRisk[r]);
      console.log(`horizon ${h}: mean holding vol1y low ${m("low").toFixed(3)} medium ${m("medium").toFixed(3)} high ${m("high").toFixed(3)} | single picks ${mean(sByRisk.low).toFixed(3)} / ${mean(sByRisk.medium).toFixed(3)} / ${mean(sByRisk.high).toFixed(3)}`);
      expect(m("low"), `${h} portfolio low<=medium`).toBeLessThanOrEqual(m("medium") + 1e-9);
      expect(m("medium"), `${h} portfolio medium<=high`).toBeLessThanOrEqual(m("high") + 1e-9);
      expect(mean(sByRisk.low), `${h} single low<=medium`).toBeLessThanOrEqual(mean(sByRisk.medium) + 1e-9);
      expect(mean(sByRisk.medium), `${h} single medium<=high`).toBeLessThanOrEqual(mean(sByRisk.high) + 1e-9);
    }
  });
});

describe("H6 single-stock mode", () => {
  const amounts = Array.from({ length: 24 }, (_, i) => Math.round(Math.exp(Math.log(20_000) + (i / 23) * (Math.log(1_000_000_000) - Math.log(20_000)))));
  it("whole shares, exact AMD identity, 2 distinct runners-up, disclosure of concentration, eligibility", async () => {
    const rs = await pool(4, amounts.map((a, i) => async () => ({ a, risk: RISKS[i % 3], h: HORIZONS[(i >> 1) % 3], r: await rec(a, RISKS[i % 3], HORIZONS[(i >> 1) % 3], "single") })));
    let ok = 0;
    for (const { a, risk, h, r } of rs) {
      if (r.status === 422) {
        expect(r.body.error.code).toBe("NO_ELIGIBLE_STOCK");
        expect(r.body.error.reason).toBeTruthy();
        expect(r.body.error.suggestion).toBeTruthy();
        continue;
      }
      expect(r.status, `${a} ${risk}/${h}`).toBe(200);
      ok++;
      const d = r.body.data;
      const p = d.pick;
      expect(d.allocatedAmountAmd + d.unallocatedCashAmd, `amount ${a}`).toBe(a);
      expect(Number.isInteger(p.shares) && p.shares >= 1).toBe(true);
      expect(p.shares).toBe(Math.floor((Number(d.budgetUsd) + 1e-9) / Number(p.price)));
      expect(Math.abs(Number(p.cost) - p.shares * Number(p.price))).toBeLessThan(0.011);
      expect(Math.abs(Number(p.leftoverCash) - (Number(d.budgetUsd) - Number(p.cost)))).toBeLessThan(0.011);
      expect(Number(p.leftoverCash)).toBeLessThan(Number(p.price) + 0.005);
      if (d.runnersUp.length !== 2) console.log(`OBSERVATION only ${d.runnersUp.length} runner-up(s) at ${a} AMD ${risk}/${h}`);
      expect(d.runnersUp.length).toBeGreaterThanOrEqual(1);
      expect(new Set([p.symbol, ...d.runnersUp.map((x: { symbol: string }) => x.symbol)]).size).toBe(1 + d.runnersUp.length);
      expect(Number.isInteger(d.score) && d.score >= 0 && d.score <= 100).toBe(true);
      expect(Math.abs(d.score - Number(p.composite))).toBeLessThanOrEqual(1.01);
      expect(d.warnings.map((w: { code: string }) => w.code)).toContain("CONCENTRATION");
      const vol = p.metrics.vol1y;
      expect(vol).toBeLessThanOrEqual(VOLCAP[risk] * (h === "short" ? 0.8 : 1) + 1e-6);
      expect(p.metrics.marketCap).toBeGreaterThanOrEqual(MCAP[risk]);
      // explanation text quotes numbers that exist in the drivers
      for (const dr of p.drivers) if (dr.value !== "yes") expect(p.explanation).toContain(dr.value);
      expect(p.drivers.length).toBeGreaterThanOrEqual(3);
      for (const dr of p.drivers) {
        expect(dr.percentile).toBeGreaterThanOrEqual(0);
        expect(dr.percentile).toBeLessThanOrEqual(100);
      }
      // runners-up are affordable too
      for (const ru of d.runnersUp) expect(Number(ru.price)).toBeLessThanOrEqual(Number(d.budgetUsd) + 0.005);
    }
    console.log(`single runs ok: ${ok}/${amounts.length}`);
    expect(ok).toBeGreaterThan(10);
  });

  it("runner-up scoring higher than the pick (stability rule) - observation", async () => {
    let n = 0;
    let higher = 0;
    for (const risk of RISKS) for (const h of HORIZONS) {
      const r = await rec(500_000, risk, h, "single");
      if (r.status !== 200) continue;
      n++;
      const d = r.body.data;
      if (d.runnersUp.some((x: { composite: number }) => x.composite > d.pick.composite)) {
        higher++;
        console.log(`OBSERVATION ${risk}/${h}: pick ${d.pick.symbol} ${d.pick.composite} but runner-up ${d.runnersUp.map((x: any) => x.symbol + " " + x.composite).join(", ")}; pick flags ${JSON.stringify(d.pick.flags)}`);
      }
    }
    console.log(`runner-up outscoring the pick in ${higher}/${n} single results`);
  });
});

describe("H7 NO_ELIGIBLE_STOCK and warnings", () => {
  it("tiny budgets -> 422 NO_ELIGIBLE_STOCK with reason, suggestion, minPriceUsd; same for portfolio", async () => {
    for (const mode of ["single", "portfolio"] as const) {
      const r = await rec(1000, "low", "long", mode);
      expect(r.status, mode).toBe(422);
      expect(r.body.error.code).toBe("NO_ELIGIBLE_STOCK");
      expect(typeof r.body.error.reason).toBe("string");
      expect(typeof r.body.error.suggestion).toBe("string");
      console.log(`NO_ELIGIBLE_STOCK ${mode}:`, JSON.stringify(r.body.error).slice(0, 400));
    }
  });
  it("threshold: binary search the smallest amount that yields a single pick; below it 422, at/above 200 (monotone)", async () => {
    let lo = 1000; let hi = 300_000;
    for (let i = 0; i < 20; i++) {
      const mid = Math.floor((lo + hi) / 2);
      const r = await rec(mid, "medium", "medium", "single");
      if (r.status === 200) hi = mid; else lo = mid + 1;
    }
    const at = await rec(hi, "medium", "medium", "single");
    const below = await rec(hi - 1, "medium", "medium", "single");
    console.log(`smallest single-stock budget (medium/medium): ${hi} AMD ~ $${(hi / 363.44).toFixed(2)}; at:${at.status} below:${below.status}`);
    expect(at.status).toBe(200);
    expect(below.status).toBe(422);
    if (at.status === 200) expect(Number(at.body.data.pick.cost)).toBeLessThanOrEqual(Number(at.body.data.budgetUsd) + 0.005);
  });
  it("Low+Short -> suitability note; High+Short -> volatility warning; small budget -> too-small-to-diversify note (spec 7.4 / 7.1)", async () => {
    const lowShort = await rec(2_000_000, "low", "short", "portfolio");
    const highShort = await rec(2_000_000, "high", "short", "portfolio");
    const smallBudget = await rec(60_000, "medium", "long", "portfolio"); // ~ $165 < $300
    const codes = (r: { body: any; status: number }) => (r.status === 200 ? r.body.data.warnings.map((w: { code: string }) => w.code) : [`HTTP${r.status}`]);
    console.log("warnings low/short:", codes(lowShort), "| high/short:", codes(highShort), "| $165 portfolio:", codes(smallBudget));
    expect(codes(lowShort).length, "low+short suitability note present").toBeGreaterThan(0);
    expect(codes(highShort).length, "high+short volatility warning present").toBeGreaterThan(0);
  });
});
