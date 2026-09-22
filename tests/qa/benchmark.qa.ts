import { describe, it, expect, beforeAll } from "vitest";
import { newUser } from "./helpers";
import type { Client } from "./helpers";
import { seriesMetrics, relativeMetrics } from "@/invest/benchmark";

// ---------- independent reference maths (written from the handover formulas, not from src) ----------
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / a.length;
const sd = (a: number[]) => Math.sqrt(a.reduce((s, x) => s + (x - mean(a)) ** 2, 0) / (a.length - 1)); // sample stdev
const rets = (v: number[]) => v.slice(1).map((x, i) => x / v[i] - 1);
function ref(values: number[], dates: string[], rf: number | null = null) {
  const r = rets(values);
  const n = r.length;
  let peak = values[0], pd = dates[0], mdd = 0, ddP = "", ddT = "";
  values.forEach((v, i) => {
    if (v > peak) { peak = v; pd = dates[i]; }
    if (v / peak - 1 < mdd) { mdd = v / peak - 1; ddP = pd; ddT = dates[i]; }
  });
  const total = values[n] / values[0] - 1;
  const cagr = (values[n] / values[0]) ** (252 / n) - 1;
  const vol = n > 1 ? sd(r) * Math.sqrt(252) : NaN;
  const worst = Math.min(...r);
  return { total, cagr, vol, mdd, ddP, ddT, worstDay: worst, worstDayDate: dates[r.indexOf(worst) + 1], sharpe: rf === null ? null : (cagr - rf) / vol, n };
}
function rel(p: number[], b: number[]) {
  const rp = rets(p), rb = rets(b);
  const mp = mean(rp), mb = mean(rb);
  const cov = rp.reduce((s, x, i) => s + (x - mp) * (rb[i] - mb), 0) / (rp.length - 1);
  const beta = cov / sd(rb) ** 2;
  const corr = cov / (sd(rp) * sd(rb));
  const te = sd(rp.map((x, i) => x - rb[i])) * Math.sqrt(252);
  const up = mean(rp.filter((_, i) => rb[i] > 0)) / mean(rb.filter((x) => x > 0));
  const down = mean(rp.filter((_, i) => rb[i] < 0)) / mean(rb.filter((x) => x < 0));
  return { beta, corr, te, up, down };
}
const close = (a: number, b: number, tol: number, msg = "") => expect(Math.abs(a - b), `${msg} got ${a} expected ${b}`).toBeLessThanOrEqual(tol);
const DATES = ["2026-01-02", "2026-01-05", "2026-01-06", "2026-01-07"];

describe("I1 synthetic maths (spec 12.4-H) - independent expectations vs backend pure functions", () => {
  it("returns +10%, -10%, +10% -> 100,110,99,108.9: total +8.9%, max drawdown -10% (110 -> 99), worst day -10%, vol = sd*sqrt(252)", () => {
    const v = [100, 110, 99, 108.9];
    const m = seriesMetrics(v, DATES, null);
    close(m.totalReturn, 0.089, 1e-9, "total");
    close(m.maxDrawdown, -0.1, 1e-9, "maxDD");
    expect(m.maxDrawdownPeak).toBe("2026-01-05");
    expect(m.maxDrawdownTrough).toBe("2026-01-06");
    close(m.worstDay!, -0.1, 1e-9, "worst day");
    expect(m.worstDayDate).toBe("2026-01-06");
    // by hand: returns .1,-.1,.1 -> mean 1/30, sample var 0.013333 -> sd 0.115470 -> x sqrt(252)=15.8745 -> 1.83303
    close(m.annualisedVolatility!, 1.83303, 2e-5, "vol");
    close(m.cagr!, 1.089 ** (252 / 3) - 1, 1e-6, "cagr");
    expect(m.observations).toBe(3);
    const r = ref(v, DATES);
    close(m.annualisedVolatility!, r.vol, 1e-6);
    close(m.totalReturn, r.total, 1e-9);
  });
  it("benchmark +1% x 3 -> 103.0301: total +3.0301%; no drawdown; zero volatility", () => {
    const v = [100, 101, 102.01, 103.0301];
    const m = seriesMetrics(v, DATES, null);
    close(m.totalReturn, 0.030301, 1e-9);
    close(m.maxDrawdown, 0, 1e-12);
    close(m.annualisedVolatility!, 0, 1e-9);
  });
  it("beta / correlation / tracking error / capture vs an independent calculation (portfolio +10,-10,+10 vs benchmark +2,-1,+3)", () => {
    const p = [100, 110, 99, 108.9];
    const b = [100, 102, 100.98, 104.0094];
    const got = relativeMetrics(p, b);
    const exp = rel(p, b);
    close(got.beta!, exp.beta, 1e-5, "beta");
    close(got.correlation!, exp.corr, 1e-5, "corr");
    close(got.trackingError!, exp.te, 1e-5, "TE");
    close(got.upCapture!, exp.up, 1e-5, "up");
    close(got.downCapture!, exp.down, 1e-5, "down");
  });
  it("edge: constant benchmark returns (zero variance) -> beta/correlation null instead of NaN/Infinity", () => {
    const got = relativeMetrics([100, 110, 99, 108.9], [100, 101, 102.01, 103.0301]);
    console.log("relativeMetrics vs zero-variance benchmark:", JSON.stringify(got));
    for (const v of Object.values(got)) expect(v === null || Number.isFinite(v)).toBe(true);
  });
  it("edge: 2-point and 1-point series do not throw", () => {
    expect(() => seriesMetrics([100, 101], DATES.slice(0, 2), null)).not.toThrow();
    expect(() => seriesMetrics([100], DATES.slice(0, 1), null)).not.toThrow();
  });
});

let c: Client;
let holdings: { symbol: string; shares: number }[] = [];
beforeAll(async () => {
  c = (await newUser("bm")).c;
  const r = await c.post("/api/invest/recommendation", { amountAmd: 1_500_000, risk: "medium", horizon: "long", mode: "portfolio", notNeededForEmergencies: true });
  expect(r.status).toBe(200);
  holdings = r.body.data.holdings.map((h: any) => ({ symbol: h.symbol, shares: h.shares }));
});
const cmp = (h: unknown, window?: string) => c.post("/api/invest/comparison", window ? { holdings: h, window } : { holdings: h });

describe("I2 real comparison: structure and metrics recomputed from the returned series", () => {
  for (const window of ["1M", "3M", "6M", "1Y", "3Y", "5Y"]) {
    it(`window ${window}`, async () => {
      const r = await cmp(holdings, window);
      expect(r.status).toBe(200);
      const d = r.body.data;
      const s = d.series as { date: string; portfolio: number; benchmark: number }[];
      expect(d.window).toBe(window);
      expect(s.length).toBeGreaterThan(5);
      for (const p of s) expect(Object.keys(p).sort()).toEqual(["benchmark", "date", "portfolio"]);
      expect(s[0].portfolio).toBe(100);
      expect(s[0].benchmark).toBe(100);
      expect(s[0].date).toBe(d.start);
      expect(s.at(-1)!.date).toBe(d.end);
      for (let i = 1; i < s.length; i++) expect(s[i].date > s[i - 1].date).toBe(true);
      expect(s.every((p) => p.portfolio > 0 && p.benchmark > 0)).toBe(true);
      expect(d.benchmark.symbol).toBe("VOO");
      expect(d.disclaimers.join(" ")).toMatch(/Hypothetical back-test/);
      expect(d.disclaimers.join(" ")).toMatch(/reference only/i);
      expect(d.disclaimers.join(" ")).toMatch(/not a forecast/i);
      expect(d.disclaimers.join(" ")).toMatch(/[Ss]urvivorship/);
      console.log(`${window}: ${s.length} pts ${d.start}..${d.end} requestedStart ${d.requestedStart} truncated=${d.truncated} notes=${JSON.stringify(d.notes)} initial=$${d.initialValueUsd} rf=${d.riskFreeRate} (${d.riskFreeSource})`);
      const pv = s.map((x) => x.portfolio), bv = s.map((x) => x.benchmark), dates = s.map((x) => x.date);
      for (const [name, v, m] of [["portfolio", pv, d.metrics.portfolio], ["benchmark", bv, d.metrics.benchmark]] as const) {
        const e = ref(v, dates, d.riskFreeRate);
        close(m.totalReturn, e.total, 5e-6, `${window} ${name} total`);
        close(m.cagr, e.cagr, Math.max(5e-5, Math.abs(e.cagr) * 5e-4), `${name} cagr`);
        close(m.annualisedVolatility, e.vol, 2e-4, `${name} vol`);
        close(m.maxDrawdown, e.mdd, 5e-6, `${name} maxDD`);
        expect(m.maxDrawdownPeak, `${name} DD peak`).toBe(e.ddP || null);
        expect(m.maxDrawdownTrough, `${name} DD trough`).toBe(e.ddT || null);
        close(m.worstDay, e.worstDay, 5e-6, `${name} worst day`);
        expect(m.worstDayDate).toBe(e.worstDayDate);
        expect(m.observations).toBe(e.n);
        if (d.riskFreeRate !== null && Number.isFinite(e.sharpe as number)) close(m.sharpe, e.sharpe as number, 2e-3, `${name} sharpe`);
      }
      const e = rel(pv, bv);
      const pm = d.metrics.portfolio;
      close(pm.beta, e.beta, 2e-3, "beta");
      close(pm.correlation, e.corr, 2e-3, "correlation");
      close(pm.trackingError, e.te, 2e-3, "tracking error");
      close(pm.upCapture, e.up, 5e-3, "up capture");
      close(pm.downCapture, e.down, 5e-3, "down capture");
      close(d.metrics.benchmark.beta, 1, 1e-9);
      close(d.metrics.benchmark.correlation, 1, 1e-9);
      close(d.metrics.benchmark.trackingError, 0, 1e-9);
      // worst month: calendar-month-end to month-end (first month from window start)
      const byMonth = new Map<string, number>();
      s.forEach((x, i) => byMonth.set(x.date.slice(0, 7), i));
      const idx = [0, ...[...byMonth.values()]];
      const mr = idx.slice(1).map((k, i) => pv[k] / pv[idx[i]] - 1);
      if (mr.length) {
        const wm = Math.min(...mr);
        console.log(`  worstMonth api=${pm.worstMonth} independent(month-end basis)=${wm.toFixed(6)}`);
      }
      // sanity: benchmark of the same window across calls is the same series
    });
  }

  it("default window is 1Y; embedded benchmark in the recommendation equals the comparison endpoint result", async () => {
    const dflt = await cmp(holdings);
    expect(dflt.status).toBe(200);
    expect(dflt.body.data.window).toBe("1Y");
    const rec = await c.post("/api/invest/recommendation", { amountAmd: 1_500_000, risk: "medium", horizon: "long", mode: "portfolio", notNeededForEmergencies: true });
    const b = rec.body.data.benchmark;
    const again = await cmp(rec.body.data.holdings.map((h: any) => ({ symbol: h.symbol, shares: h.shares })), "1Y");
    expect(b.series).toEqual(again.body.data.series);
    expect(b.metrics).toEqual(again.body.data.metrics);
  });

  it("sharpe/sortino definitions (informational): sharpe = (cagr - rf)/vol", async () => {
    const d = (await cmp(holdings, "1Y")).body.data;
    const m = d.metrics.portfolio;
    console.log(`sharpe api ${m.sharpe} vs (cagr-rf)/vol ${((m.cagr - d.riskFreeRate) / m.annualisedVolatility).toFixed(4)}; sortino ${m.sortino}; rf ${d.riskFreeRate} (${d.riskFreeSource})`);
    expect(Number.isFinite(m.sortino)).toBe(true);
  });
});

describe("I3 comparison input validation", () => {
  it("bad bodies -> 400 (never 500)", async () => {
    const H = [{ symbol: "AAPL", shares: 1 }];
    const bad: [string, unknown][] = [
      ["empty holdings", { holdings: [], window: "1Y" }],
      ["16 holdings", { holdings: Array.from({ length: 16 }, (_, i) => ({ symbol: "A" + i, shares: 1 })), window: "1Y" }],
      ["dup symbol", { holdings: [{ symbol: "AAPL", shares: 1 }, { symbol: "AAPL", shares: 2 }], window: "1Y" }],
      ["shares 0", { holdings: [{ symbol: "AAPL", shares: 0 }], window: "1Y" }],
      ["shares -1", { holdings: [{ symbol: "AAPL", shares: -1 }], window: "1Y" }],
      ["shares 1.5", { holdings: [{ symbol: "AAPL", shares: 1.5 }], window: "1Y" }],
      ["shares string", { holdings: [{ symbol: "AAPL", shares: "1" }], window: "1Y" }],
      ["window 2Y", { holdings: H, window: "2Y" }],
      ["window lowercase", { holdings: H, window: "1y" }],
      ["extra field", { holdings: H, window: "1Y", pf: 1 }],
      ["extra holding field", { holdings: [{ symbol: "AAPL", shares: 1, price: 1 }], window: "1Y" }],
      ["no holdings key", { window: "1Y" }],
      ["symbol injection", { holdings: [{ symbol: "AAPL'; DROP TABLE x;--", shares: 1 }], window: "1Y" }],
      ["symbol very long", { holdings: [{ symbol: "A".repeat(300), shares: 1 }], window: "1Y" }],
    ];
    for (const [name, body] of bad) {
      const r = await c.post("/api/invest/comparison", body);
      expect([400, 404, 422], name).toContain(r.status);
      expect(r.status, name).not.toBe(500);
    }
    const unknown = await c.post("/api/invest/comparison", { holdings: [{ symbol: "ZZZZ", shares: 1 }], window: "1Y" });
    console.log("unknown symbol ZZZZ ->", unknown.status, unknown.body?.error?.code);
    expect([400, 404, 422]).toContain(unknown.status);
    const voo = await c.post("/api/invest/comparison", { holdings: [{ symbol: "VOO", shares: 1 }], window: "1Y" });
    console.log("benchmark ticker as holding VOO ->", voo.status, voo.body?.error?.code);
    const lower = await c.post("/api/invest/comparison", { holdings: [{ symbol: "aapl", shares: 1 }], window: "1Y" });
    console.log("lower-case symbol aapl ->", lower.status);
    expect((await c.post("/api/invest/comparison", { holdings: [{ symbol: "AAPL", shares: 1_000_000_000 }], window: "1Y" })).status, "huge share count").toBeLessThan(500);
  });
});

describe("I4 data plausibility: single mega-cap vs VOO (alignment / correlation investigation)", () => {
  it("correlation with the benchmark series and lead/lag alignment test", async () => {
    const lines: string[] = [];
    const misalignedSymbols: string[] = [];
    for (const sym of ["AAPL", "MSFT", "NVDA", "GOOGL", "AMZN", "JPM", "XOM"]) {
      const r = await c.post("/api/invest/comparison", { holdings: [{ symbol: sym, shares: 1 }], window: "1Y" });
      if (r.status !== 200) { lines.push(`${sym}: HTTP ${r.status}`); continue; }
      const s = r.body.data.series as { date: string; portfolio: number; benchmark: number }[];
      const rp = rets(s.map((x) => x.portfolio)), rb = rets(s.map((x) => x.benchmark));
      const corr = (a: number[], b: number[]) => {
        const ma = mean(a), mb = mean(b);
        return a.reduce((t, x, i) => t + (x - ma) * (b[i] - mb), 0) / ((a.length - 1) * sd(a) * sd(b));
      };
      const n = rp.length;
      const c0 = corr(rp, rb);
      const cLead = corr(rp.slice(1), rb.slice(0, n - 1)); // stock day t+1 vs benchmark day t
      const cLag = corr(rp.slice(0, n - 1), rb.slice(1));
      const misaligned = c0 < Math.max(cLead, cLag) - 0.02;
      lines.push(`${sym}: corr same-day ${c0.toFixed(3)} | stock(t+1) vs VOO(t) ${cLead.toFixed(3)} | stock(t) vs VOO(t+1) ${cLag.toFixed(3)} | api corr ${r.body.data.metrics.portfolio.correlation}${misaligned ? "  <-- same-day is NOT the best-correlated lag" : ""}`);
      if (misaligned) misalignedSymbols.push(sym);
    }
    console.log("MEGA-CAP CORRELATIONS\n" + lines.join("\n"));
  });
  it("first-day / last-day sanity: series dates are US trading days (no weekends) and end at today's or the last completed session", async () => {
    const d = (await cmp(holdings, "1Y")).body.data;
    for (const p of d.series) {
      const dow = new Date(p.date + "T00:00:00Z").getUTCDay();
      expect([0, 6].includes(dow), `${p.date} is a weekend`).toBe(false);
    }
    console.log("series end:", d.end, " (server date UTC:", new Date().toISOString().slice(0, 10) + ")");
  });
});
