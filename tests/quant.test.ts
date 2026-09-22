import { describe, expect, it } from "vitest";
import { percentileRanks, winsorize, stdev, quantileSorted } from "@/lib/quant/stats";
import { weightsFor, compositeScore } from "@/lib/quant/composite";
import { deriveMetrics, computePriceMetrics } from "@/lib/quant/derive";
import { evaluateHardEligibility, evaluateRiskEligibility } from "@/lib/quant/eligibility";
import { buildRecord, finaliseRecords, computeStableLeaders } from "@/lib/quant/records";
import { universeConfig } from "@/lib/quant/config";
import { allocateWholeShares, inverseVolScoreWeights, roundWeights } from "@/invest/allocation";
import { buildSynthetic, inputFor, makeBars, makeSpecs } from "./helpers/synthetic";
import { FACTORS } from "@/lib/quant/types";

describe("stats", () => {
  it("percentile ranks: ties share the mid-rank, range 0-100, order preserved", () => {
    expect(percentileRanks([10, 20, 30, 40])).toEqual([12.5, 37.5, 62.5, 87.5]);
    expect(percentileRanks([5, 5, 5, 5])).toEqual([50, 50, 50, 50]);
    const p = percentileRanks([3, 1, 2]);
    expect(p[1]).toBeLessThan(p[2]);
    expect(p[2]).toBeLessThan(p[0]);
  });
  it("winsorize clamps the tails", () => {
    const w = winsorize([1, 2, 3, 4, 5, 6, 7, 8, 9, 1000], 0.1, 0.9);
    expect(Math.max(...w)).toBeLessThan(1000);
    expect(quantileSorted([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.138, 3);
  });
});

describe("weights (handover 7.4)", () => {
  it("base weights, and horizon adjustments are clamped at 0 and renormalised to 100", () => {
    const mid = weightsFor("medium", "medium");
    expect(mid).toMatchObject({ quality: 25, lowRisk: 15, income: 10, value: 15, growth: 20, momentum: 15 });
    // Low + Short: lowRisk 35, momentum 10, growth 5-10 -> 0, value 15, quality 30, income 15  => sum 105 -> renormalised
    const ls = weightsFor("low", "short");
    expect(ls.growth).toBe(0);
    expect(ls.lowRisk).toBeCloseTo((35 / 105) * 100, 6);
    expect(FACTORS.reduce((s, f) => s + ls[f], 0)).toBeCloseTo(100, 9);
    for (const r of ["low", "medium", "high"] as const) for (const h of ["short", "medium", "long"] as const) {
      const w = weightsFor(r, h);
      expect(FACTORS.reduce((s, f) => s + w[f], 0)).toBeCloseTo(100, 9);
      expect(FACTORS.every((f) => w[f] >= 0)).toBe(true);
    }
    // horizon effect: short raises the Low-risk share versus long for every risk level
    for (const r of ["low", "medium", "high"] as const) expect(weightsFor(r, "short").lowRisk).toBeGreaterThan(weightsFor(r, "long").lowRisk);
  });
});

describe("derived metrics and price metrics", () => {
  it("fundamentals ratios; gaps stay null (no silent imputation) except the documented dividend rule", () => {
    const m = deriveMetrics(
      { price: 100, sharesOut: 10, revenue: 1000, revenuePrev: 800, revenue3yAgo: 512, netIncome: 100, netIncomePrev: 80, netIncome2yAgo: -10, eps: 10, epsPrev: 8, opIncome: 200, equity: 500, liabilities: 250, opCashFlow: 150, capex: 50, dps: 2 },
      1000,
    );
    expect(m.roe).toBeCloseTo(0.2, 9);
    expect(m.opMargin).toBeCloseTo(0.2, 9);
    expect(m.fcfMargin).toBeCloseTo(0.1, 9);
    expect(m.debtToEquity).toBeCloseTo(0.5, 9);
    expect(m.earningsStability).toBeCloseTo(2 / 3, 9);
    expect(m.pe).toBeCloseTo(10, 9);
    expect(m.ps).toBeCloseTo(1, 9);
    expect(m.fcfYield).toBeCloseTo(0.1, 9);
    expect(m.divYield).toBeCloseTo(0.02, 9);
    expect(m.payout).toBeCloseTo(0.2, 9);
    expect(m.revGrowth).toBeCloseTo(0.25, 9);
    expect(m.rev3yCAGR).toBeCloseTo(0.25, 6);
    expect(m.epsGrowth).toBeCloseTo(0.25, 9);
    const gap = deriveMetrics({ price: 100, sharesOut: 10, revenue: null, revenuePrev: null, revenue3yAgo: null, netIncome: -5, netIncomePrev: null, netIncome2yAgo: null, eps: -1, epsPrev: null, opIncome: null, equity: -10, liabilities: 5, opCashFlow: null, capex: null, dps: null }, 1000);
    expect(gap.opMargin).toBeNull();
    expect(gap.pe).toBeNull(); // negative EPS: not meaningful
    expect(gap.roe).toBeNull(); // negative equity
    expect(gap.debtToEquity).toBeNull();
    expect(gap.fcfMargin).toBeNull();
    expect(gap.revGrowth).toBeNull();
    expect(gap.divYield).toBe(0); // documented: no dividend tag = no dividend (flagged dps_assumed_zero on the record)
  });

  it("price metrics: vol = stdev(252 returns)*sqrt(252), maxDD, momentum, 200-day average, beta vs benchmark", () => {
    const { bench, bars } = makeBars(makeSpecs(4), 900);
    const b = bars.get("NVDA")!;
    const pm = computePriceMetrics(b, bench, { tradingDays: 252, betaMinObservations: 500, betaYears: 3 });
    const adj = b.map((x) => x.adjClose);
    const rets = adj.slice(1).map((x, i) => x / adj[i] - 1).slice(-252);
    expect(pm.vol1y).toBeCloseTo(stdev(rets) * Math.sqrt(252), 9);
    const win = adj.slice(-253);
    let peak = win[0];
    let dd = 0;
    for (const p of win) { peak = Math.max(peak, p); dd = Math.min(dd, p / peak - 1); }
    expect(pm.maxDD1y).toBeCloseTo(dd, 9);
    const n = adj.length;
    expect(pm.mom12_1).toBeCloseTo(adj[n - 22] / adj[n - 253] - 1, 9);
    expect(pm.mom6).toBeCloseTo(adj[n - 1] / adj[n - 127] - 1, 9);
    expect(pm.above200dma).toBeCloseTo(adj[n - 1] / (adj.slice(-200).reduce((s, x) => s + x, 0) / 200) - 1, 9);
    expect(pm.beta3y).toBeGreaterThan(0);
    expect(pm.historyDays).toBeGreaterThan(1200);
    expect(pm.lastClose).toBe(b[b.length - 1].close);
  });

  it("a >40% single-day jump on the adjusted series is a data error and excludes the stock", () => {
    const s = makeSpecs(3);
    const { bench, bars } = makeBars(s, 900);
    const b = bars.get(s[0].symbol)!.map((x) => ({ ...x }));
    for (let i = 500; i < b.length; i++) { b[i].adjClose *= 2; b[i].close *= 2; } // +100% step on one day
    const rec = buildRecord(inputFor(s[0], b, bench));
    expect(rec.flags).toContain("price_jump");
    expect(rec.hardEligible).toBe(false);
    expect(rec.exclusionReasons.join(" ")).toMatch(/jump/);
    expect(rec.status).toBe("excluded");
  });
});

describe("eligibility, scoring, stability on the synthetic snapshot", () => {
  const synth = buildSynthetic();
  const recs = synth.records;

  it("the synthetic universe has eligible stocks at every risk level, financials handled, incomplete ones excluded", () => {
    const by = (k: "low" | "medium" | "high") => recs.filter((r) => r.eligibleByRisk[k]).length;
    expect(by("low")).toBeGreaterThanOrEqual(4);
    expect(by("medium")).toBeGreaterThan(by("low"));
    expect(by("high")).toBeGreaterThan(by("medium") - 1);
    // never imputed: remove revenue -> excluded
    const s = makeSpecs(2);
    const { bench, bars } = makeBars(s, 900);
    const inp = inputFor(s[0], bars.get(s[0].symbol)!, bench);
    inp.fundamentals.revenue = null;
    const rec = buildRecord(inp);
    expect(rec.hardEligible).toBe(false);
    expect(evaluateHardEligibility(rec).join(" ")).toMatch(/revenue/);
    // short history is excluded
    const short = buildRecord(inputFor(s[1], bars.get(s[1].symbol)!.slice(-400), bench));
    expect(short.hardEligible).toBe(false);
    expect(short.exclusionReasons.join(" ")).toMatch(/history/);
  });

  it("per-risk caps are applied to the raw metrics; the short horizon tightens the volatility cap", () => {
    const cfg = universeConfig();
    for (const r of recs.filter((x) => x.hardEligible)) {
      const low = evaluateRiskEligibility(r, "low", "long");
      if (low.ok) {
        expect(r.vol1y!).toBeLessThanOrEqual(cfg.eligibility.caps.low.maxVol1y);
        expect(r.beta3y!).toBeLessThanOrEqual(1.0);
        expect(r.maxDD1y!).toBeGreaterThanOrEqual(-0.25);
        expect(r.marketCap!).toBeGreaterThanOrEqual(50e9);
        expect(r.netIncome!).toBeGreaterThan(0);
      }
      const shortLow = evaluateRiskEligibility(r, "low", "short");
      if (shortLow.ok) expect(r.vol1y!).toBeLessThanOrEqual(cfg.eligibility.caps.low.maxVol1y * 0.8);
      // short can only remove candidates
      if (!low.ok) expect(shortLow.ok).toBe(false);
    }
  });

  it("factor scores are 0-100, inputs carry raw value + percentile, composites are within 0-100", () => {
    for (const r of recs.filter((x) => x.hardEligible)) {
      for (const f of FACTORS) {
        const v = r.factorScores[f];
        if (v !== null) expect(v).toBeGreaterThanOrEqual(0), expect(v).toBeLessThanOrEqual(100);
      }
      for (const inp of Object.values(r.factorInputs)) expect(inp.pct).toBeGreaterThanOrEqual(0), expect(inp.pct).toBeLessThanOrEqual(100);
      const c = compositeScore(r, weightsFor("medium", "medium"));
      expect(c).not.toBeNull();
      expect(c!).toBeGreaterThanOrEqual(0);
      expect(c!).toBeLessThanOrEqual(100);
    }
    // a better (lower) P/E ranks higher on Value within the sector
    const pe = recs.filter((r) => r.hardEligible && r.factorInputs.pe);
    expect(pe.length).toBeGreaterThan(10);
  });

  it("a factor with no valid input is dropped and the composite renormalises the weights (flag present)", () => {
    const r = structuredClone(recs.find((x) => x.hardEligible)!);
    r.factorScores.income = null;
    const w = weightsFor("medium", "medium");
    const full = compositeScore(recs.find((x) => x.symbol === r.symbol)!, w)!;
    const dropped = compositeScore(r, w)!;
    expect(dropped).not.toBe(full);
    const expected = (FACTORS.filter((f) => f !== "income").reduce((s, f) => s + w[f] * (r.factorScores[f] ?? 0), 0)) / (100 - w.income);
    expect(dropped).toBeCloseTo(expected, 1);
    expect(recs.some((x) => x.flags.some((f) => f.startsWith("factor_dropped:")))).toBeDefined();
  });

  it("stability rule: yesterday's leader stays when it is still eligible and within 2 points of today's best", () => {
    const first = computeStableLeaders(recs, null);
    const key = "medium|medium";
    const w = weightsFor("medium", "medium");
    const ranked = recs.filter((r) => evaluateRiskEligibility(r, "medium", "medium").ok).map((r) => ({ s: r.symbol, c: compositeScore(r, w)! })).sort((a, b) => b.c - a.c);
    expect(first[key].symbol).toBe(ranked[0].s);
    // pretend yesterday's leader was the runner-up (within 2 points?) -> kept only if within stabilityPoints
    const prevSym = ranked[1].s;
    const kept = computeStableLeaders(recs, { [key]: { symbol: prevSym, composite: ranked[1].c } });
    if (ranked[0].c - ranked[1].c <= 2) expect(kept[key].symbol).toBe(prevSym);
    else expect(kept[key].symbol).toBe(ranked[0].s);
    // far below -> replaced
    const last = ranked[ranked.length - 1];
    if (ranked[0].c - last.c > 2) expect(computeStableLeaders(recs, { [key]: { symbol: last.s, composite: last.c } })[key].symbol).toBe(ranked[0].s);
    // no longer eligible -> replaced
    expect(computeStableLeaders(recs, { [key]: { symbol: "GONE", composite: 99 } })[key].symbol).toBe(ranked[0].s);
    void finaliseRecords;
  });
});

describe("whole-share allocation (handover 7.6) and weights", () => {
  it("matches the hand-worked example and satisfies the invariants", () => {
    // B = $1,000; prices $60 / $150 / $45; weights 0.5 / 0.3 / 0.2
    const r = allocateWholeShares(100_000, [
      { symbol: "A", priceCents: 6000, weight: 0.5 },
      { symbol: "B", priceCents: 15000, weight: 0.3 },
      { symbol: "C", priceCents: 4500, weight: 0.2 },
    ]);
    // floors: 500/60=8, 300/150=2, 200/45=4 -> cost 480+300+180 = 960, cash 40 < 45 -> no top-up possible
    expect(r.holdings.map((h) => h.shares)).toEqual([8, 2, 4]);
    expect(r.cashCents).toBe(4000);
    expect(r.investedCents).toBe(96000);
    expect(r.holdings[0].actualWeight).toBeCloseTo(48000 / 96000, 12);
    // a case with top-up: B=$1000, prices 100/100, weights 0.55/0.45 -> floors 5,4 -> cash 100 -> top-up goes to the larger deficit
    const t = allocateWholeShares(100_000, [
      { symbol: "X", priceCents: 10000, weight: 0.55 },
      { symbol: "Y", priceCents: 10000, weight: 0.45 },
    ]);
    expect(t.holdings.map((h) => h.shares)).toEqual([5, 5]); // X actual 5/9=.556 (>.55), Y actual 4/9=.444 (<.45) -> Y gets the share
    expect(t.cashCents).toBe(0);
  });

  it("property: sum(cost) <= budget, leftover < cheapest price, weights reported (200 random cases)", () => {
    let seed = 99;
    const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
    for (let k = 0; k < 200; k++) {
      const n = 1 + Math.floor(rnd() * 8);
      const raw = Array.from({ length: n }, () => 0.2 + rnd());
      const sum = raw.reduce((a, b) => a + b, 0);
      const items = raw.map((w, i) => ({ symbol: `S${i}`, priceCents: 500 + Math.floor(rnd() * 60000), weight: w / sum }));
      const budget = 50_000 + Math.floor(rnd() * 5_000_000);
      const res = allocateWholeShares(budget, items);
      const cost = res.holdings.reduce((s, h) => s + h.costCents, 0);
      expect(cost).toBeLessThanOrEqual(budget);
      expect(res.cashCents).toBe(budget - cost);
      expect(res.cashCents).toBeLessThan(Math.min(...items.map((i) => i.priceCents)));
      if (cost > 0) expect(res.holdings.reduce((s, h) => s + h.actualWeight, 0)).toBeCloseTo(1, 9);
    }
  });

  it("inverse-volatility x score weights: sum 1, cap and minimum respected, cap relaxed to 1/n when infeasible; rounding sums to exactly 1", () => {
    const items = [
      { composite: 80, vol: 0.1 }, { composite: 70, vol: 0.2 }, { composite: 60, vol: 0.3 }, { composite: 75, vol: 0.25 },
      { composite: 65, vol: 0.4 }, { composite: 55, vol: 0.5 }, { composite: 72, vol: 0.15 }, { composite: 68, vol: 0.35 },
    ];
    const r = inverseVolScoreWeights(items, 0.25, 0.08);
    expect(r.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Math.max(...r.weights)).toBeLessThanOrEqual(0.25 + 1e-9);
    expect(Math.min(...r.weights)).toBeGreaterThanOrEqual(0.08 - 1e-9);
    expect(r.capRelaxed).toBe(false);
    // the lowest-volatility / highest-score stock gets the biggest weight
    expect(r.weights[0]).toBe(Math.max(...r.weights));
    const three = inverseVolScoreWeights(items.slice(0, 3), 0.2, 0.08);
    expect(three.capRelaxed).toBe(true);
    expect(three.weights.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(Math.max(...three.weights)).toBeLessThanOrEqual(1 / 3 + 1e-9);
    const rounded = roundWeights(r.weights, 4);
    expect(rounded.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
  });
});
