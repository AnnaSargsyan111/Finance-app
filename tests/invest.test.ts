import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { I, R, registerUser, type TestUser } from "./helpers/routes";
import { fxHandler, mockFetch, type FetchMock } from "./helpers/fetch-mock";
import { resetCache, tableCounts } from "./helpers/db";
import { buildSynthetic, seedSynthetic, type Synth } from "./helpers/synthetic";
import { evaluateRiskEligibility } from "@/lib/quant/eligibility";
import { weightsFor } from "@/lib/quant/composite";
import { FACTORS } from "@/lib/quant/types";
import { recommendSingle } from "@/invest/recommend";
import { seriesMetrics, relativeMetrics, computeComparison } from "@/invest/benchmark";
import { hashResult, signSaveToken, verifySaveToken } from "@/invest/history/token";
import { readLatestSnapshot } from "@/market/read";
import type { Risk, Horizon } from "@/lib/quant/types";

let mock: FetchMock;
let user: TestUser;
let synth: Synth;

const RATE = 363.44;
const amd = (usd: number) => Math.round(usd * RATE);
const body = (over: Record<string, unknown> = {}) => ({ amountAmd: amd(5000), risk: "medium", horizon: "long", mode: "portfolio", notNeededForEmergencies: true, ...over });
const rec = (u: TestUser | null, b: unknown) => call(I.recommendationRoute.POST, "POST", "/api/invest/recommendation", { json: b, jar: u?.jar });
const strip = (d: Record<string, unknown>) => {
  const c = { ...d };
  delete c.saveToken;
  delete c.saveTokenExpiresAt;
  return c;
};

beforeAll(async () => {
  await useTestDb();
  mock = mockFetch(fxHandler());
  user = await registerUser("invest");
});
afterAll(() => mock.restore());

describe("request validation (strict schema) and access control", () => {
  it("401 without a session; 503 NO_SNAPSHOT before the first batch", async () => {
    expect((await rec(null, body())).status).toBe(401);
    const r = await rec(user, body());
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe("NO_SNAPSHOT");
  });

  it("seed the synthetic snapshot (60 stocks) for the rest of the file", async () => {
    synth = buildSynthetic();
    await seedSynthetic(synth);
    const snap = await readLatestSnapshot();
    expect(snap!.payload.records).toHaveLength(60);
    expect(snap!.payload.coverage.hardEligible).toBeGreaterThan(40);
  });

  it("notNeededForEmergencies must be boolean true; unknown fields (incl. anything Personal-Finance-like) are rejected", async () => {
    const bad = async (b: Record<string, unknown>) => rec(user, b);
    for (const v of [false, "true", 1, null, undefined]) {
      const r = await bad(body({ notNeededForEmergencies: v }));
      expect(r.status, String(v)).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
      expect(r.body.error.fields.notNeededForEmergencies).toBeTruthy();
    }
    const missing: Record<string, unknown> = body();
    delete missing.notNeededForEmergencies;
    expect((await bad(missing)).body.error.fields.notNeededForEmergencies).toBeTruthy();
    for (const extra of [{ income: "900000" }, { userId: "x" }, { balance: 1 }, { periodId: "abc" }, { totalBalance: 5 }]) {
      const r = await bad(body(extra));
      expect(r.status).toBe(400);
      expect(Object.keys(r.body.error.fields)).toEqual(Object.keys(extra));
    }
    for (const [k, v] of [["amountAmd", 999], ["amountAmd", 1_000_000_001], ["amountAmd", 500000.5], ["amountAmd", "5e5"], ["amountAmd", "abc"], ["risk", "extreme"], ["horizon", "forever"], ["mode", "both"]] as [string, unknown][]) {
      const r = await bad(body({ [k]: v }));
      expect(r.status, `${k}=${String(v)}`).toBe(400);
      expect(r.body.error.fields[k]).toBeTruthy();
    }
    expect((await bad(body({ amountAmd: "500000" }))).status).toBe(200); // digit strings are accepted
  });
});

describe("AC-B6 determinism, eligibility, invariants", () => {
  it("same inputs + same snapshot => identical output (all 9 risk x horizon combinations, both modes)", async () => {
    for (const risk of ["low", "medium", "high"] as Risk[]) {
      for (const horizon of ["short", "medium", "long"] as Horizon[]) {
        for (const mode of ["single", "portfolio"] as const) {
          const a = await rec(user, body({ risk, horizon, mode, amountAmd: amd(8000) }));
          const b = await rec(user, body({ risk, horizon, mode, amountAmd: amd(8000) }));
          expect(a.status, `${risk} ${horizon} ${mode}: ${JSON.stringify(a.body).slice(0, 200)}`).toBe(200);
          expect(strip(b.body.data)).toEqual(strip(a.body.data));
        }
      }
    }
  });

  it("every pick is eligible for the chosen risk AND horizon", async () => {
    const snap = (await readLatestSnapshot())!;
    const bySym = new Map(snap.payload.records.map((r) => [r.symbol, r]));
    for (const risk of ["low", "medium", "high"] as Risk[]) {
      for (const horizon of ["short", "medium", "long"] as Horizon[]) {
        const s = await rec(user, body({ risk, horizon, mode: "single", amountAmd: amd(20000) }));
        expect(evaluateRiskEligibility(bySym.get(s.body.data.pick.symbol)!, risk, horizon).ok, `${risk}/${horizon} single`).toBe(true);
        for (const ru of s.body.data.runnersUp) expect(evaluateRiskEligibility(bySym.get(ru.symbol)!, risk, horizon).ok).toBe(true);
        const p = await rec(user, body({ risk, horizon, mode: "portfolio", amountAmd: amd(20000) }));
        for (const h of p.body.data.holdings) expect(evaluateRiskEligibility(bySym.get(h.symbol)!, risk, horizon).ok, `${risk}/${horizon} ${h.symbol}`).toBe(true);
      }
    }
  });

  it("AC-B6/B7 portfolio invariants: weights sum to 100%, caps, sector limit, N by budget, whole shares, leftover < cheapest price, no duplicates, AMD identity", async () => {
    const caps: Record<string, number> = { low: 0.2, medium: 0.25, high: 0.3 };
    const expectedN: [number, number][] = [[2000, 5], [5000, 8], [20000, 11]]; // budget USD -> holdings (handover 7.6 table)
    for (const risk of ["low", "medium", "high"] as Risk[]) {
      for (const [usd, n] of expectedN) {
        const amount = amd(usd);
        const r = await rec(user, body({ risk, amountAmd: amount, horizon: "medium" }));
        expect(r.status).toBe(200);
        const d = r.body.data;
        const hs = d.holdings;
        expect(hs.length, `${risk} $${usd}`).toBeLessThanOrEqual(n);
        expect(hs.length).toBeGreaterThanOrEqual(Math.min(n, 3));
        expect(new Set(hs.map((h: { symbol: string }) => h.symbol)).size).toBe(hs.length);
        const targetSum = hs.reduce((s: number, h: { targetWeight: number }) => s + h.targetWeight, 0);
        expect(Math.abs(targetSum - 1)).toBeLessThan(0.0001 + 1e-9); // 100 % +- 0.01
        const actualSum = hs.reduce((s: number, h: { actualWeight: number }) => s + h.actualWeight, 0);
        expect(Math.abs(actualSum - 1)).toBeLessThan(0.001);
        if (hs.length >= 5) for (const h of hs) expect(h.targetWeight).toBeLessThanOrEqual(caps[risk] + 1e-9);
        const secs = new Map<string, number>();
        for (const h of hs) secs.set(h.sector, (secs.get(h.sector) ?? 0) + 1);
        expect(Math.max(...secs.values())).toBeLessThanOrEqual(3); // 2, relaxed to 3 only when reported
        if (Math.max(...secs.values()) === 3) expect(d.warnings.some((w: { code: string }) => w.code === "CONSTRAINT_RELAXED")).toBe(true);
        // whole shares, budget, leftover
        let cost = 0;
        for (const h of hs) {
          expect(Number.isInteger(h.shares) && h.shares >= 1).toBe(true);
          expect(Math.round(Number(h.price) * 100) * h.shares).toBe(Math.round(Number(h.cost) * 100));
          cost += Math.round(Number(h.cost) * 100);
          expect(h.actualWeight).toBeGreaterThan(0);
        }
        const budgetCents = Math.round(Number(d.budgetUsd) * 100);
        expect(cost).toBeLessThanOrEqual(budgetCents);
        expect(budgetCents - cost).toBe(Math.round(Number(d.unallocatedCashUsd) * 100));
        expect(budgetCents - cost).toBeLessThan(Math.min(...hs.map((h: { price: string }) => Math.round(Number(h.price) * 100))));
        // AC-B14: exact AMD identity, integer 0-100 score
        const sumAmd = hs.reduce((s: number, h: { allocatedAmountAmd: number }) => s + h.allocatedAmountAmd, 0);
        expect(sumAmd + d.unallocatedCashAmd).toBe(amount);
        expect(d.allocatedAmountAmd).toBe(sumAmd);
        expect(d.unallocatedCashAmd).toBeGreaterThanOrEqual(0);
        expect(Number.isInteger(d.score) && d.score >= 0 && d.score <= 100).toBe(true);
        expect(d.scoreLabel).toBe("Match score");
        expect(d.scoreNote).toMatch(/not a forecast of returns/);
        // score = allocation-weighted composite
        const weighted = Math.round(hs.reduce((s: number, h: { actualWeight: number; composite: number }) => s + h.actualWeight * h.composite, 0));
        expect(Math.abs(d.score - weighted)).toBeLessThanOrEqual(1);
        for (const h of hs) expect(h.allocatedAmountUsd).toBe(h.cost);
      }
    }
  });

  it("holdings-by-budget table: 3 for $300-$1,000, 5 for ~$2,000, 8 for ~$5,000, up to 11 above $10,000; tiny budgets get 1-3 with a small-budget note", async () => {
    const n = async (usd: number) => (await rec(user, body({ amountAmd: amd(usd), risk: "high" }))).body.data;
    expect((await n(900)).holdings.length).toBeLessThanOrEqual(3);
    expect((await n(2500)).holdings.length).toBe(5);
    expect((await n(6000)).holdings.length).toBe(8);
    expect((await n(30000)).holdings.length).toBe(11);
    const small = await n(250);
    expect(small.holdings.length).toBeLessThanOrEqual(2);
    expect(small.warnings.some((w: { code: string }) => w.code === "SMALL_BUDGET")).toBe(true);
  });

  it("AC-B14 single stock: AMD identity, integer score, shares = floor(budget/price), runners-up, concentration warning", async () => {
    for (const usd of [1500, 5000, 50000]) {
      const amount = amd(usd) + 137;
      const r = await rec(user, body({ mode: "single", amountAmd: amount, risk: "high", horizon: "long" }));
      const d = r.body.data;
      expect(d.mode).toBe("single");
      expect(d.pick.shares).toBe(Math.floor(Math.round(Number(d.budgetUsd) * 100) / Math.round(Number(d.pick.price) * 100)));
      expect(d.allocatedAmountAmd + d.unallocatedCashAmd).toBe(amount);
      expect(Number(d.pick.leftoverCash)).toBeCloseTo(Number(d.budgetUsd) - Number(d.pick.cost), 2);
      expect(Number(d.pick.leftoverCash)).toBeLessThan(Number(d.pick.price));
      expect(d.score).toBe(Math.round(d.pick.composite));
      expect(d.runnersUp.length).toBeLessThanOrEqual(2);
      expect(d.runnersUp.every((x: { composite: number }) => x.composite <= d.pick.composite + 2)).toBe(true);
      expect(d.warnings[0].code).toBe("CONCENTRATION");
      expect(d.warnings[0].message).toMatch(/undiversified/);
    }
  });

  it("monotonic risk: average vol1y of the picks is non-decreasing Low -> Medium -> High (every horizon, single top-3 and portfolios)", async () => {
    const bySym = new Map((await readLatestSnapshot())!.payload.records.map((r) => [r.symbol, r]));
    for (const horizon of ["short", "medium", "long"] as Horizon[]) {
      const avg: Record<string, number> = {};
      const avgSingle: Record<string, number> = {};
      for (const risk of ["low", "medium", "high"] as Risk[]) {
        const p = await rec(user, body({ risk, horizon, amountAmd: amd(20000) }));
        const vols = p.body.data.holdings.map((h: { symbol: string }) => bySym.get(h.symbol)!.vol1y!);
        avg[risk] = vols.reduce((a: number, b: number) => a + b, 0) / vols.length;
        const s = await rec(user, body({ risk, horizon, mode: "single", amountAmd: amd(20000) }));
        const picks = [s.body.data.pick, ...s.body.data.runnersUp].map((x: { symbol: string }) => bySym.get(x.symbol)!.vol1y!);
        avgSingle[risk] = picks.reduce((a: number, b: number) => a + b, 0) / picks.length;
      }
      expect(avg.low, `portfolio ${horizon}`).toBeLessThanOrEqual(avg.medium + 1e-9);
      expect(avg.medium, `portfolio ${horizon}`).toBeLessThanOrEqual(avg.high + 1e-9);
      expect(avgSingle.low, `single ${horizon}`).toBeLessThanOrEqual(avgSingle.medium + 1e-9);
      expect(avgSingle.medium, `single ${horizon}`).toBeLessThanOrEqual(avgSingle.high + 1e-9);
    }
  });

  it("horizon effect: the Low-risk factor share is larger for Short than for Long (weightsUsed in the payload)", async () => {
    for (const risk of ["low", "medium", "high"] as Risk[]) {
      const s = (await rec(user, body({ risk, horizon: "short", mode: "single", amountAmd: amd(20000) }))).body.data.weightsUsed;
      const l = (await rec(user, body({ risk, horizon: "long", mode: "single", amountAmd: amd(20000) }))).body.data.weightsUsed;
      expect(s.lowRisk).toBeGreaterThan(l.lowRisk);
      expect(FACTORS.reduce((a, f) => a + s[f], 0)).toBeCloseTo(100, 1);
    }
  });

  it("the universe is NOT limited to the 5 display companies: a non-display stock is recommended, and a display company can win too", async () => {
    const DISPLAY = ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"];
    const picks: string[] = [];
    for (const risk of ["low", "medium", "high"] as Risk[]) {
      for (const horizon of ["short", "medium", "long"] as Horizon[]) {
        picks.push((await rec(user, body({ mode: "single", risk, horizon, amountAmd: amd(20000) }))).body.data.pick.symbol);
      }
    }
    expect(picks.some((s) => !DISPLAY.includes(s))).toBe(true); // non-display companies are recommended
    expect(new Set(picks).size).toBeGreaterThan(1);
    const p = await rec(user, body({ amountAmd: amd(20000) }));
    expect(p.body.data.holdings.some((h: { symbol: string }) => !DISPLAY.includes(h.symbol))).toBe(true);
    // second fixture: make AAPL the standout on every factor -> it wins with no special treatment
    const s2 = buildSynthetic({
      tweak: (specs) => {
        const a = specs.find((x) => x.symbol === "AAPL")!;
        Object.assign(a, { quality: 1, growth: 1, vol: 0.14, beta: 0.7, marketCap: 400e9, dividend: true, drift: 0.2 });
      },
    });
    const winner = s2.records.filter((x) => evaluateRiskEligibility(x, "medium", "long").ok).sort((a, b) => (b.factorScores.quality! + b.factorScores.growth!) - (a.factorScores.quality! + a.factorScores.growth!))[0];
    expect(winner.symbol).toBe("AAPL");
    expect(DISPLAY.includes(winner.symbol)).toBe(true);
  });

  it("stability rule end to end: the snapshot's stabilised leader is kept when affordable and within 2 points of the best", async () => {
    const snap = (await readLatestSnapshot())!;
    const key = "medium|long";
    const top = await recommendSingle({ amountAmd: amd(50000), risk: "medium", horizon: "long", mode: "single", notNeededForEmergencies: true });
    // rig the leader to the runner-up (composite within 2 points?) and check the decision
    const ru = top.runnersUp[0];
    const gap = top.pick.composite - ru.composite;
    const original = snap.payload.stableLeaders[key];
    snap.payload.stableLeaders[key] = { symbol: ru.symbol, composite: ru.composite };
    const again = await recommendSingle({ amountAmd: amd(50000), risk: "medium", horizon: "long", mode: "single", notNeededForEmergencies: true });
    snap.payload.stableLeaders[key] = original; // memoised snapshot object: restore
    if (gap <= 2) expect(again.pick.symbol).toBe(ru.symbol);
    else expect(again.pick.symbol).toBe(top.pick.symbol);
  });

  it("NO_ELIGIBLE_STOCK when the budget is below the cheapest eligible share (422 with reason + suggestion)", async () => {
    for (const mode of ["single", "portfolio"]) {
      const r = await rec(user, body({ mode, amountAmd: 1000 })); // about $2.75
      expect(r.status).toBe(422);
      expect(r.body.error.code).toBe("NO_ELIGIBLE_STOCK");
      expect(r.body.error.reason).toMatch(/cheapest eligible share/);
      expect(r.body.error.suggestion).toMatch(/AMD/);
      expect(r.body.error.minPriceUsd).toMatch(/^\d+\.\d{2}$/);
    }
  });

  it("warnings: Low+Short suitability note, High+Short volatility warning; wording is informational (no imperative buy/sell)", async () => {
    const ls = (await rec(user, body({ risk: "low", horizon: "short", mode: "single", amountAmd: amd(30000) }))).body;
    if (ls.data) expect(ls.data.warnings.some((w: { code: string }) => w.code === "LOW_RISK_SHORT_HORIZON")).toBe(true);
    const hs = (await rec(user, body({ risk: "high", horizon: "short", mode: "portfolio", amountAmd: amd(30000) }))).body.data;
    expect(hs.warnings.some((w: { code: string }) => w.code === "HIGH_RISK_SHORT_HORIZON")).toBe(true);
    for (const mode of ["single", "portfolio"]) {
      const d = (await rec(user, body({ mode, amountAmd: amd(10000) }))).body.data;
      const text = JSON.stringify([d.warnings, d.disclaimers, d.scoreNote, d.pick?.explanation, d.holdings?.map((h: { explanation: string }) => h.explanation), d.why]);
      expect(text).not.toMatch(/\b(buy|sell|invest)\s+(now|today|immediately)\b/i);
      expect(text).not.toMatch(/\byou should (buy|sell)\b/i);
      expect(d.disclaimers.join(" ")).toMatch(/no trades/i);
      expect(d.methodologyVersion).toBe("v1");
      expect(d.dataAsOf).toBe("2026-09-18");
      expect(d.snapshotDate).toBe("2026-09-18");
    }
  });

  it("explanations use the snapshot's real numbers (parsed back and compared)", async () => {
    const bySym = new Map((await readLatestSnapshot())!.payload.records.map((r) => [r.symbol, r]));
    const d = (await rec(user, body({ mode: "single", amountAmd: amd(20000) }))).body.data;
    const r = bySym.get(d.pick.symbol)!;
    expect(d.pick.drivers.length).toBeGreaterThanOrEqual(3);
    for (const dr of d.pick.drivers) {
      // every displayed number must come from an input of that factor with that exact percentile (ties: any matching input)
      const candidates = Object.entries(r.factorInputs).filter(([, v]) => v.factor === dr.factor && Math.abs(v.pct - dr.percentile) < 1e-9);
      expect(candidates.length).toBeGreaterThan(0);
      if (dr.value !== "yes" && dr.value !== "no") {
        const ratio = /Beta|P\/E|Price to|Liabilities/.test(dr.label);
        const formats = candidates.map(([name, v]) => {
          const shown = name === "maxDDAbs" ? r.maxDD1y! : v.value;
          return ratio ? shown.toFixed(2) : `${(shown * 100).toFixed(1)}%`;
        });
        expect(formats).toContain(dr.value);
      }
      expect(d.pick.explanation).toContain(dr.value === "yes" ? dr.label : `${dr.label} ${dr.value} (top ${dr.topPercent}% of eligible stocks)`);
    }
    expect(d.pick.price).toBe(r.price!.toFixed(2));
    expect(d.pick.composite).toBe(Math.round(d.pick.composite * 100) / 100);
    const w = weightsFor("medium", "long");
    expect(d.pick.explanation).toContain(`Quality ${Math.round(w.quality)}%`);
  });
});

describe("AC-B9 independence: Personal Finance data never influences or is touched by Investment", () => {
  it("results are identical with or without rich pf data; no rows are written by recommendation/comparison; payload has no pf fields", async () => {
    const rich = await registerUser("richpf");
    const put = await call(R.pfPeriod.PUT, "PUT", "/api/pf/period", {
      json: { kind: "month", month: "2026-09", income: "9999999.00", expenses: [{ key: "housing", amount: "123456.00" }] },
      jar: rich.jar,
    });
    expect(put.status).toBe(200);
    const withData = await rec(rich, body({ amountAmd: amd(7000) }));
    const without = await rec(user, body({ amountAmd: amd(7000) }));
    expect(strip(withData.body.data)).toEqual(strip(without.body.data));
    expect(JSON.stringify(withData.body)).not.toMatch(/9999999|123456|expensesTotal|housing|periodId/i);

    await resetCache();
    await rec(user, body()); // warm the FX cache (a cache write is not an invest write)
    const ignore = (k: string) => /cache_entry|cache_lock|rate_event|auth\.session|fx_rate/.test(k);
    const before = await tableCounts();
    await rec(user, body({ mode: "single" }));
    await rec(user, body({ risk: "high" }));
    const holdings = (await rec(user, body())).body.data.holdings.map((h: { symbol: string; shares: number }) => ({ symbol: h.symbol, shares: h.shares }));
    await call(I.comparisonRoute.POST, "POST", "/api/invest/comparison", { json: { holdings, window: "1Y" }, jar: user.jar });
    const after = await tableCounts();
    for (const k of Object.keys(before)) if (!ignore(k)) expect(after[k], k).toBe(before[k]);
    expect(after["invest.saved_recommendation"]).toBe(0); // nothing is saved without an explicit Add
  });
});

describe("AC-B8 benchmark math (synthetic series of handover 12.4-H) and the comparison endpoint", () => {
  const dates = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"];
  it("daily returns +10%, -10%, +10% => +8.9%, path 100 -> 110 -> 99 -> 108.9, max drawdown -10% (110 -> 99); benchmark +1% x3 => +3.0301%", () => {
    const p = [100, 110, 99, 108.9];
    const b = [100, 101, 102.01, 103.0301];
    const pm = seriesMetrics(p, dates, null);
    expect(pm.totalReturn).toBeCloseTo(0.089, 9);
    expect(pm.maxDrawdown).toBeCloseTo(-0.1, 9);
    expect(pm.maxDrawdownPeak).toBe("2026-01-05");
    expect(pm.maxDrawdownTrough).toBe("2026-01-06");
    expect(pm.worstDay).toBeCloseTo(-0.1, 9);
    expect(pm.worstDayDate).toBe("2026-01-06");
    const bm = seriesMetrics(b, dates, null);
    expect(bm.totalReturn).toBeCloseTo(0.030301, 9);
    // independent calculations (plain loops)
    const r = [0.1, -0.1, 0.1];
    const mean = r.reduce((a, x) => a + x, 0) / 3;
    const sd = Math.sqrt(r.reduce((a, x) => a + (x - mean) ** 2, 0) / 2);
    expect(pm.annualisedVolatility).toBeCloseTo(sd * Math.sqrt(252), 5);
    expect(pm.cagr).toBeCloseTo(1.089 ** (252 / 3) - 1, 3);
    const rb = [0.01, 0.01, 0.01];
    const mb = 0.01;
    const cov = r.reduce((a, x, i) => a + (x - mean) * (rb[i] - mb), 0) / 2;
    const rel = relativeMetrics(p, b);
    expect(rel.beta).toBeNull(); // benchmark variance is 0 => beta undefined, never NaN/Infinity
    expect(cov).toBeCloseTo(0, 12);
    // a benchmark with variance: check beta / correlation / tracking error against hand calculation
    const b2 = [100, 102, 100.98, 103.9998];
    const rb2 = b2.slice(1).map((x, i) => x / b2[i] - 1);
    const m2 = rb2.reduce((a, x) => a + x, 0) / 3;
    const cov2 = r.reduce((a, x, i) => a + (x - mean) * (rb2[i] - m2), 0) / 2;
    const var2 = rb2.reduce((a, x) => a + (x - m2) ** 2, 0) / 2;
    const rel2 = relativeMetrics(p, b2);
    expect(rel2.beta).toBeCloseTo(cov2 / var2, 5);
    expect(rel2.correlation).toBeCloseTo(cov2 / Math.sqrt(var2 * sd * sd), 5);
    const diff = r.map((x, i) => x - rb2[i]);
    const dm = diff.reduce((a, x) => a + x, 0) / 3;
    expect(rel2.trackingError).toBeCloseTo(Math.sqrt(diff.reduce((a, x) => a + (x - dm) ** 2, 0) / 2) * Math.sqrt(252), 5);
    expect(rel2.upCapture).toBeCloseTo((0.1 + 0.1) / 2 / ((rb2[0] + rb2[2]) / 2), 5);
    expect(rel2.downCapture).toBeCloseTo(-0.1 / rb2[1], 5);
  });

  it("computeComparison: inner-joins trading dates, both series start at 100 on the same date, buy-and-hold with whole shares", () => {
    const mk = (vals: number[], ds: string[]) => vals.map((v, i) => ({ date: ds[i], close: v, adjClose: v }));
    const ds = ["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"];
    const bars = new Map([
      ["AAA", mk([10, 11, 12, 13, 14], ds)],
      ["BBB", mk([20, 20, 22, 22, 24], ds.filter((d) => d !== "2026-09-16").concat(["2026-09-19"]))], // BBB misses 09-16 -> that date is dropped
    ]);
    const bench = mk([100, 101, 102, 103, 104], ds);
    const c = computeComparison({ window: "1M", months: 1, holdings: [{ symbol: "AAA", shares: 10 }, { symbol: "BBB", shares: 5 }], bars, bench, rfYields: [], tradingDays: 252 });
    expect(c.series.map((s) => s.date)).toEqual(["2026-09-14", "2026-09-15", "2026-09-17", "2026-09-18"]);
    expect(c.series[0]).toEqual({ date: "2026-09-14", portfolio: 100, benchmark: 100 });
    // V0 = 10*10 + 5*20 = 200 ; V(09-17) = 130 + 110 = 240 -> 120
    expect(c.series[2].portfolio).toBeCloseTo(120, 4);
    expect(c.initialValueUsd).toBe("200.00");
    expect(c.series[2].benchmark).toBeCloseTo((103 / 100) * 100, 4);
    expect(c.metrics.portfolio.sharpe).toBeNull(); // no risk-free data => omitted, never invented
  });

  it("POST /api/invest/comparison: two series on a common rebased scale, metrics, diversification, honesty labels; short history is disclosed; strict validation", async () => {
    const p = (await rec(user, body({ amountAmd: amd(20000) }))).body.data;
    const holdings = p.holdings.map((h: { symbol: string; shares: number }) => ({ symbol: h.symbol, shares: h.shares }));
    const call1 = (b: unknown, jar = user.jar) => call(I.comparisonRoute.POST, "POST", "/api/invest/comparison", { json: b, jar });
    expect((await call(I.comparisonRoute.POST, "POST", "/api/invest/comparison", { json: { holdings, window: "1Y" } })).status).toBe(401);
    // the default embedded 1Y block equals the comparison endpoint for the same holdings
    const c = await call1({ holdings, window: "1Y" });
    expect(c.status).toBe(200);
    const d = c.body.data;
    expect(d.series[0]).toEqual({ date: d.start, portfolio: 100, benchmark: 100 });
    expect(Object.keys(d.series[5]).sort()).toEqual(["benchmark", "date", "portfolio"]);
    expect(d.series.length).toBeGreaterThan(240);
    expect(d.metrics.portfolio).toMatchObject({ observations: d.series.length - 1 });
    expect(d.metrics.benchmark).toMatchObject({ beta: 1, correlation: 1, trackingError: 0 });
    expect(d.metrics.portfolio.maxDrawdown).toBeLessThanOrEqual(0);
    expect(d.metrics.portfolio.sharpe).not.toBeNull(); // ^IRX series is stored (4 % in the fixture)
    expect(d.diversification.holdingsCount).toBe(holdings.length);
    expect(d.diversification.universeSize).toBe(60);
    expect(d.diversification.effectiveN).toBeGreaterThan(1);
    expect(d.diversification.sectors.length).toBeGreaterThan(1);
    expect(d.disclaimers.join(" ")).toMatch(/Hypothetical back-test/);
    expect(d.disclaimers.join(" ")).toMatch(/reference only - not a recommendation/);
    expect(d.benchmark.note).toMatch(/not a recommendation/);
    expect(p.benchmark.window).toBe("1Y");
    expect(p.benchmark.series).toEqual(d.series);
    expect(p.benchmark.metrics).toEqual(d.metrics);
    // windows shorter than the requested one are disclosed
    const five = await call1({ holdings, window: "5Y" });
    expect(five.status).toBe(200);
    expect(five.body.data.truncated).toBe(true);
    expect(five.body.data.notes[0]).toMatch(/longer than the history/);
    const one = await call1({ holdings, window: "1M" });
    expect(one.body.data.series.length).toBeGreaterThan(15);
    expect(one.body.data.series.length).toBeLessThan(30);
    // validation
    expect((await call1({ holdings, window: "2Y" })).status).toBe(400);
    expect((await call1({ holdings: [], window: "1Y" })).status).toBe(400);
    expect((await call1({ holdings: [{ symbol: "NOPE", shares: 1 }], window: "1Y" })).body.error.fields["holdings.0.symbol"]).toBeTruthy();
    expect((await call1({ holdings: [{ symbol: holdings[0].symbol, shares: 0 }], window: "1Y" })).status).toBe(400);
    expect((await call1({ holdings: [holdings[0], holdings[0]], window: "1Y" })).status).toBe(400);
    expect((await call1({ holdings, window: "1Y", cash: 5 })).status).toBe(400);
  });
});

describe("AC-B15 recommendation history (opt-in Add, saveToken, idempotent, per-user)", () => {
  it("nothing is saved without Add; Add works once (201), again is idempotent (200); grouped by Yerevan date; delete works", async () => {
    const A = await registerUser("histA");
    const B = await registerUser("histB");
    const save = (u: TestUser, b: unknown) => call(I.historyListRoute.POST, "POST", "/api/invest/history", { json: b, jar: u.jar });
    const list = (u: TestUser, q = "") => call(I.historyListRoute.GET, "GET", `/api/invest/history${q}`, { jar: u.jar });
    const item = (u: TestUser | null, id: string, m = "GET") => call(m === "GET" ? I.historyItemRoute.GET : I.historyItemRoute.DELETE, m, `/api/invest/history/${id}`, { jar: u?.jar, params: { id } });

    const r1 = (await rec(A, body({ amountAmd: amd(4000) }))).body.data;
    const r2 = (await rec(A, body({ amountAmd: amd(4000), mode: "single" }))).body.data;
    expect((await list(A)).body.data).toMatchObject({ groups: [], total: 0 });

    const s1 = await save(A, { saveToken: r1.saveToken, result: r1 });
    expect(s1.status).toBe(201);
    expect(s1.body.data).toMatchObject({ mode: "portfolio", score: r1.score, methodologyVersion: "v1" });
    expect(s1.body.data.holdings.length).toBe(r1.holdings.length);
    const again = await save(A, { saveToken: r1.saveToken, result: r1 });
    expect(again.status).toBe(200);
    expect(again.body.data.id).toBe(s1.body.data.id);
    // a fresh recommendation with identical content has the same hash -> still the same row
    const r1b = (await rec(A, body({ amountAmd: amd(4000) }))).body.data;
    expect(hashResult(r1b)).toBe(hashResult(r1));
    expect((await save(A, { saveToken: r1b.saveToken, result: r1b })).body.data.id).toBe(s1.body.data.id);
    const s2 = await save(A, { saveToken: r2.saveToken, result: r2 });
    expect(s2.status).toBe(201);
    const db = await getDb();
    expect(((await db.execute(sql`select count(*)::int as n from invest.saved_recommendation where user_id = ${A.id}`)).rows[0] as { n: number }).n).toBe(2);

    // full item + summary fields
    const full = await item(A, s1.body.data.id);
    expect(full.status).toBe(200);
    expect(full.body.data.result.holdings).toHaveLength(r1.holdings.length);
    expect(full.body.data.result.saveToken).toBeUndefined();
    expect(full.body.data.benchmarkSummary).toMatchObject({ window: "1Y" });
    expect(typeof full.body.data.benchmarkSummary.portfolioTotalReturn).toBe("number");

    // grouping by the Asia/Yerevan calendar day of created_at (UTC+4): 19:30Z is still the 18th, 20:30Z is already the 19th
    await db.execute(sql`update invest.saved_recommendation set created_at = timestamptz '2026-09-18 19:30:00+00' where id = ${s1.body.data.id}`);
    await db.execute(sql`update invest.saved_recommendation set created_at = timestamptz '2026-09-18 20:30:00+00' where id = ${s2.body.data.id}`);
    const l = (await list(A)).body.data;
    expect(l.total).toBe(2);
    expect(l.groups.map((g: { date: string }) => g.date)).toEqual(["2026-09-19", "2026-09-18"]); // newest first
    expect(l.groups[0].label).toBe("September 19, 2026");
    expect(l.groups[0].items.map((i: { id: string }) => i.id)).toEqual([s2.body.data.id]);
    expect(l.groups[1].label).toBe("September 18, 2026");
    expect((await list(A, "?pageSize=1&page=2")).body.data.groups[0].items[0].id).toBe(s1.body.data.id);
    expect((await list(A, "?pageSize=51")).status).toBe(400);

    // per-user isolation
    expect((await list(B)).body.data.total).toBe(0);
    expect((await item(B, s1.body.data.id)).status).toBe(404);
    expect((await item(B, s1.body.data.id, "DELETE")).status).toBe(404);
    expect((await item(null, s1.body.data.id)).status).toBe(401);
    expect((await item(A, "not-a-uuid")).status).toBe(404);
    expect((await item(A, s1.body.data.id, "DELETE")).status).toBe(204);
    expect((await item(A, s1.body.data.id)).status).toBe(404);
    expect((await list(A)).body.data.total).toBe(1);
    // B saving A's own token fails; B may save B's own identical result as B's row
    expect((await save(B, { saveToken: r2.saveToken, result: r2 })).status).toBe(400);
    const rb = (await rec(B, body({ amountAmd: amd(4000), mode: "single" }))).body.data;
    expect((await save(B, { saveToken: rb.saveToken, result: rb })).status).toBe(201);
  });

  it("forged, expired and mismatched saveTokens are rejected with INVALID_SAVE_TOKEN; nothing is written", async () => {
    const A = await registerUser("forge");
    const save = (b: unknown) => call(I.historyListRoute.POST, "POST", "/api/invest/history", { json: b, jar: A.jar });
    const r = (await rec(A, body({ amountAmd: amd(3000) }))).body.data;
    const db = await getDb();
    const count = async () => Number(((await db.execute(sql`select count(*)::int as n from invest.saved_recommendation`)).rows[0] as { n: number }).n);
    const before = await count();
    const bad = async (b: unknown, label: string) => {
      const x = await save(b);
      expect(x.status, label).toBe(400);
      expect(x.body.error.code, label).toBe("INVALID_SAVE_TOKEN");
    };
    await bad({ saveToken: r.saveToken, result: { ...r, score: 100 } }, "modified score");
    await bad({ saveToken: r.saveToken, result: { ...r, holdings: r.holdings.slice(1) } }, "modified holdings");
    await bad({ saveToken: r.saveToken, result: { ...r, inputs: { ...r.inputs, amountAmd: 1 } } }, "modified inputs");
    await bad({ saveToken: r.saveToken + "x", result: r }, "tampered signature");
    await bad({ saveToken: "a".repeat(40) + "." + "b".repeat(40), result: r }, "garbage token");
    await bad({ saveToken: "notatoken-notatoken-notatoken", result: r }, "malformed token");
    const expired = signSaveToken(A.id, hashResult(r), 60, new Date(Date.now() - 2 * 3600_000)).token;
    await bad({ saveToken: expired, result: r }, "expired");
    const otherUser = signSaveToken("someone-else", hashResult(r), 60).token;
    await bad({ saveToken: otherUser, result: r }, "token issued to another user");
    expect((await save({ saveToken: r.saveToken, result: r, extra: 1 })).status).toBe(400); // strict body
    expect(await count()).toBe(before);
    // the token is limited to 60 minutes
    const t = signSaveToken(A.id, "h", 500, new Date());
    expect(new Date(t.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(3600_000 + 2000);
    // and the same result verifies with the untouched token (saveToken fields do not take part in the hash)
    expect(verifySaveToken(r.saveToken, A.id, r).ok).toBe(true);
    expect(verifySaveToken(r.saveToken, A.id, strip(r)).ok).toBe(true);
    expect((await save({ saveToken: r.saveToken, result: r })).status).toBe(201);
  });
});

describe("AC-B10 upstream cache: 100 concurrent users cause at most one upstream call per provider per TTL", () => {
  it("100 concurrent recommendation requests -> one CBA call", async () => {
    await resetCache();
    const before = mock.countHost("api.cba.am");
    const rs = await Promise.all(Array.from({ length: 100 }, () => rec(user, body({ amountAmd: amd(6000) }))));
    expect(rs.every((r) => r.status === 200)).toBe(true);
    expect(mock.countHost("api.cba.am") - before).toBe(1);
  });

  it("readLatestSnapshot() single-flights concurrent callers: N concurrent calls share ONE load, not N redundant DB reads + JSON parses", async () => {
    // deployment-readiness finding: readLatestSnapshot() used to have no protection against a thundering herd - every
    // concurrent caller that arrived before the first had finished memoising independently re-read and re-parsed the
    // whole snapshot payload. That is wasted work on every request in production, and made this file's 100-concurrent
    // test above flaky in-process (all 100 racing to reload the ~60-stock synthetic snapshot at once). Proven here by
    // object identity: single-flighted concurrent calls resolve to the exact same in-memory object, not separately
    // deserialised copies.
    const results = await Promise.all(Array.from({ length: 50 }, () => readLatestSnapshot()));
    expect(results.every((r) => r !== null)).toBe(true);
    expect(new Set(results).size).toBe(1); // every concurrent caller got back the SAME object reference
    expect(results[0]).toBe(await readLatestSnapshot()); // and a later, non-concurrent call reuses the same memoised object
  });
});
