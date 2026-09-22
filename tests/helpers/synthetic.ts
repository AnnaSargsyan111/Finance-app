import { getDb } from "@/lib/db";
import { buildRecord, computeStableLeaders, finaliseRecords, type RecordInput } from "@/lib/quant/records";
import type { Bar } from "@/lib/quant/derive";
import type { SnapshotPayload, SnapshotRecord } from "@/lib/quant/types";
import { addDays, dayOfWeek } from "@/lib/time";
import { priceDaily } from "@/market/schema";
import { writeSnapshotAtomic } from "@/market/universe/snapshot-store";

/** Deterministic synthetic universe (~60 stocks) run through the REAL scoring pipeline - the "fixed synthetic snapshot" of handover 12.4-G. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(1e-12, r()))) * Math.cos(2 * Math.PI * r());

export const LAST_DATE = "2026-09-18";
export const SECTORS = ["Information Technology", "Health Care", "Financials", "Consumer Staples", "Industrials", "Energy", "Utilities", "Consumer Discretionary"];

/** trading days (Mon-Fri) ending at `end`, `n` of them, oldest first */
export function tradingDates(end: string, n: number): string[] {
  const out: string[] = [];
  for (let d = end; out.length < n; d = addDays(d, -1)) if (dayOfWeek(d) !== 0 && dayOfWeek(d) !== 6) out.push(d);
  return out.reverse();
}

export interface SynthSpec {
  symbol: string;
  name: string;
  sector: string;
  vol: number;
  beta: number;
  price: number;
  marketCap: number;
  quality: number; // 0..1 drives margins / ROE
  growth: number;
  dividend: boolean;
  drift: number;
}

const DISPLAY = ["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"];

export function makeSpecs(count = 60, seed = 7): SynthSpec[] {
  const r = rng(seed);
  const specs: SynthSpec[] = [];
  for (let i = 0; i < count; i++) {
    const symbol = i < DISPLAY.length ? DISPLAY[i] : `SYN${String(i).padStart(2, "0")}`;
    specs.push({
      symbol,
      name: `${symbol} Corp`,
      sector: SECTORS[i % SECTORS.length],
      vol: 0.12 + ((i * 7) % 11) * 0.05 + r() * 0.02,
      beta: 0.5 + ((i * 3) % 9) * 0.15,
      price: 20 + Math.round(r() * 380) + (i % 5 === 0 ? 0 : 0.37),
      marketCap: (4 + ((i * 13) % 40) * 4) * 1e9 + r() * 1e9,
      quality: r(),
      growth: r(),
      dividend: i % 2 === 0,
      drift: (r() - 0.3) * 0.25,
    });
  }
  return specs;
}

/** market factor + idiosyncratic noise, so betas/correlations are meaningful and reproducible */
export function makeBars(specs: SynthSpec[], days = 900, seed = 11): { bench: Bar[]; bars: Map<string, Bar[]> } {
  const dates = tradingDates(LAST_DATE, days);
  const r = rng(seed);
  const market = dates.map(() => gauss(r) * 0.13 / Math.sqrt(252) + 0.09 / 252);
  const bench: Bar[] = [];
  let p = 300;
  dates.forEach((d, i) => {
    p *= 1 + market[i];
    bench.push({ date: d, close: p, adjClose: p });
  });
  const bars = new Map<string, Bar[]>();
  for (const s of specs) {
    const rs = rng(seed + s.symbol.split("").reduce((a, c) => a + c.charCodeAt(0), 0));
    const idio = Math.sqrt(Math.max(1e-6, s.vol ** 2 - (s.beta * 0.13) ** 2)) / Math.sqrt(252);
    let px = s.price / Math.exp(s.drift * (days / 252)) ; // land near the target price at the end
    const list: Bar[] = [];
    dates.forEach((d, i) => {
      px *= 1 + s.beta * market[i] + gauss(rs) * idio + s.drift / 252;
      list.push({ date: d, close: px, adjClose: px });
    });
    // rescale so the last close equals the intended price exactly
    const k = s.price / list[list.length - 1].close;
    for (const b of list) {
      b.close *= k;
      b.adjClose *= k;
    }
    bars.set(s.symbol, list);
  }
  return { bench, bars };
}

export function inputFor(s: SynthSpec, bars: Bar[], bench: Bar[]): RecordInput {
  const shares = s.marketCap / s.price;
  const revenue = (s.marketCap / (1 + s.growth * 6)) * 0.9;
  const margin = 0.05 + s.quality * 0.3;
  const equity = revenue * (0.4 + (1 - s.quality) * 1.2);
  return {
    symbol: s.symbol,
    cik: `${100000 + s.symbol.length}`,
    name: s.name,
    sector: s.sector,
    industry: null,
    fundamentals: {
      price: null,
      sharesOut: shares,
      revenue,
      revenuePrev: revenue / (1 + 0.02 + s.growth * 0.2),
      revenue3yAgo: revenue / (1 + 0.02 + s.growth * 0.2) ** 3,
      netIncome: revenue * margin * 0.8,
      netIncomePrev: revenue * margin * 0.7,
      netIncome2yAgo: revenue * margin * 0.6,
      eps: (revenue * margin * 0.8) / shares,
      epsPrev: (revenue * margin * 0.7) / shares,
      opIncome: revenue * margin,
      equity,
      liabilities: equity * (0.3 + (1 - s.quality) * 2),
      opCashFlow: revenue * margin * 1.1,
      capex: revenue * 0.05,
      dps: s.dividend ? s.price * 0.02 : null,
      grossProfit: null,
      assets: equity * 3,
      fiscalYear: 2025,
      fiscalPeriodEnd: "2025-12-31",
    },
    bars,
    bench,
  };
}

export interface Synth {
  specs: SynthSpec[];
  records: SnapshotRecord[];
  bench: Bar[];
  bars: Map<string, Bar[]>;
  payload: SnapshotPayload;
}

export function buildSynthetic(opts: { count?: number; seed?: number; tweak?: (s: SynthSpec[]) => void } = {}): Synth {
  const specs = makeSpecs(opts.count ?? 60, opts.seed ?? 7);
  opts.tweak?.(specs);
  const { bench, bars } = makeBars(specs);
  const records = finaliseRecords(specs.map((s) => buildRecord(inputFor(s, bars.get(s.symbol)!, bench))));
  const payload: SnapshotPayload = {
    records,
    stableLeaders: computeStableLeaders(records, null),
    coverage: {
      constituents: specs.length, issuers: specs.length, withCik: specs.length, duplicatesDropped: 0, withFundamentals: specs.length, withPrices: specs.length,
      priceFailures: 0, hardEligible: records.filter((r) => r.hardEligible).length,
      eligibleByRisk: { low: records.filter((r) => r.eligibleByRisk.low).length, medium: records.filter((r) => r.eligibleByRisk.medium).length, high: records.filter((r) => r.eligibleByRisk.high).length },
      revenueCoverage: specs.length, netIncomeCoverage: specs.length, epsCoverage: specs.length, opIncomeCoverage: specs.length, grossProfitCoverage: 0,
      equityCoverage: specs.length, assetsCoverage: specs.length, opCashFlowCoverage: specs.length, dividendCoverage: specs.length, sharesCoverage: specs.length,
      incomplete: records.filter((r) => r.status === "incomplete").length, fundamentalsFiscalYear: 2025, limit: null,
    },
    benchmark: { symbol: "VOO", lastDate: LAST_DATE, bars: bench.length },
    notes: ["SYNTHETIC TEST SNAPSHOT"],
  };
  return { specs, records, bench, bars, payload };
}

/** Store prices (universe + VOO + ^IRX) and the snapshot in the current test database. */
export async function seedSynthetic(s: Synth): Promise<number> {
  const db = await getDb();
  const rows: { symbol: string; date: string; close: number; adjClose: number; source: string }[] = [];
  const push = (symbol: string, list: Bar[]) => list.forEach((b) => rows.push({ symbol, date: b.date, close: b.close, adjClose: b.adjClose, source: "synthetic" }));
  for (const [sym, list] of s.bars) push(sym, list);
  push("VOO", s.bench);
  push("^IRX", s.bench.map((b) => ({ date: b.date, close: 4, adjClose: 4 })));
  for (let i = 0; i < rows.length; i += 1000) await db.insert(priceDaily).values(rows.slice(i, i + 1000)).onConflictDoNothing();
  return writeSnapshotAtomic(LAST_DATE, "v1", s.payload);
}
