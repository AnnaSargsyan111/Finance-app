import { tg, type Key, type Params } from "../i18n/translate";
import { formatAmd, formatNumber, formatPercent, formatUsd } from "../lib/format";

/**
 * Plain-language explanations for every metric on the recommendation result, shown in the "i" popovers. Each has three short parts:
 * what it is, how to read it, and an "in this result" line built from the REAL numbers of the result on screen (never invented). The wording
 * is educational: it explains a number and never tells anyone to buy or sell.
 *
 * All the wording lives in the dictionary (src/ui/i18n/dict/metrics.en.ts, "metrics.<key>.title / what / read / example"). This file only
 * decides WHICH sentence applies (gained or lost, with or without a dram amount) and formats the numbers; it never builds a sentence out of
 * separately translated pieces.
 */
export interface MetricInfo {
  title: string;
  what: string;
  read: string;
  /** "in this result": null when the numbers it needs are missing */
  example: string | null;
}

/** what a popover knows about the result it sits in; a missing value just means no example line */
export type InfoCtx = Record<string, string | number | null | undefined>;

/** looks up one text of the metric (`part` = "example", "exampleDown", ...) and fills in the numbers */
type Say = (part: string, params?: Params) => string;
type Example = (c: InfoCtx, say: Say) => string | null;

/* ------------------------------------------------------------------ small helpers */
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);
const pct = (x: number, d = 1) => formatPercent(x * 100, d);
const usd = (x: number, d = 2) => formatUsd(x, d);
const num = (x: number, d = 2) => formatNumber(x, d);
const who = (c: InfoCtx) => str(c.name, tg("metrics.shared.thisStock"));
const win = (c: InfoCtx) => str(c.window, tg("metrics.shared.thePeriod"));
const bench = (c: InfoCtx) => str(c.bench, tg("metrics.shared.theBenchmark"));
/** adds "On this measure it ranks in the top 3% ..." as its own sentence (drivers carry this) */
const ranked = (text: string, c: InfoCtx) => (n(c.top) !== null ? `${text} ${tg("metrics.shared.rank", { top: n(c.top)! })}` : text);

/* ------------------------------------------------------------------ the examples (which sentence, with which numbers) */
const EXAMPLES: Record<string, Example> = {
  /* ---- the single-stock card ---- */
  price: (c, say) => (n(c.price) !== null ? say("example", { name: who(c), price: usd(n(c.price)!) }) : null),
  shares: (c, say) => (n(c.shares) !== null && n(c.cost) !== null && n(c.price) !== null ? say("example", { cost: usd(n(c.cost)!), shares: num(n(c.shares)!, 0), count: n(c.shares)!, name: who(c), price: usd(n(c.price)!) }) : null),
  cost: (c, say) => {
    if (n(c.shares) === null || n(c.price) === null || n(c.cost) === null) return null;
    const p = { shares: num(n(c.shares)!, 0), price: usd(n(c.price)!), cost: usd(n(c.cost)!) };
    return n(c.allocatedAmd) !== null ? say("exampleAmd", { ...p, amd: formatAmd(n(c.allocatedAmd)!) }) : say("example", p);
  },
  cashLeft: (c, say) => (n(c.price) !== null && n(c.leftUsd) !== null && n(c.leftAmd) !== null ? say("example", { name: who(c), price: usd(n(c.price)!), leftUsd: usd(n(c.leftUsd)!), leftAmd: formatAmd(n(c.leftAmd)!) }) : null),
  vol1y: (c, say) => {
    const v = n(c.value);
    if (v === null) return null;
    const cost = n(c.cost);
    const text = say("example", { name: who(c), vol: pct(v) });
    return ranked(cost !== null ? `${text} ${say("costNote", { cost: usd(cost), swing: usd(cost * v, 0) })}` : text, c);
  },
  maxDD: (c, say) => {
    const v = n(c.value);
    if (v === null) return null;
    const cost = n(c.cost);
    const text = say("example", { name: who(c), drawdown: pct(Math.abs(v)) });
    return ranked(cost !== null ? `${text} ${say("costNote", { cost: usd(cost), loss: usd(cost * Math.abs(v), 0) })}` : text, c);
  },

  /* ---- allocated / left over (both result types) ---- */
  allocated: (c, say) => (n(c.inputAmd) !== null && n(c.allocatedAmd) !== null ? say("example", { input: formatAmd(n(c.inputAmd)!), allocated: formatAmd(n(c.allocatedAmd)!) }) : null),
  unallocated: (c, say) => (n(c.unallocatedAmd) !== null && n(c.inputAmd) !== null ? say("example", { unallocated: formatAmd(n(c.unallocatedAmd)!), input: formatAmd(n(c.inputAmd)!) }) : null),
  matchScore: (c, say) => (n(c.score) !== null ? say("example", { score: num(n(c.score)!, 0) }) : null),

  /* ---- "Why this match": the measures a stock can stand out on ---- */
  roe: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), roe: pct(n(c.value)!), profit: usd(n(c.value)!) }), c) : null),
  opMargin: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)! * 100, 0) }), c) : null),
  fcfMargin: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)! * 100, 0) }), c) : null),
  debtToEquity: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)!) }), c) : null),
  earningsStability: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), years: Math.round(n(c.value)! * 3) }), c) : null),
  pe: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), pe: num(n(c.value)!), amount: usd(n(c.value)!) }), c) : null),
  ps: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)!) }), c) : null),
  pb: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)!) }), c) : null),
  fcfYield: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)! * 100, 2) }), c) : null),
  revGrowth: (c, say) => (n(c.value) !== null ? ranked(say(n(c.value)! >= 0 ? "example" : "exampleDown", { name: who(c), change: pct(Math.abs(n(c.value)!)) }), c) : null),
  rev3yCAGR: (c, say) => (n(c.value) !== null ? ranked(say(n(c.value)! >= 0 ? "example" : "exampleDown", { name: who(c), change: pct(Math.abs(n(c.value)!)) }), c) : null),
  epsGrowth: (c, say) => (n(c.value) !== null ? ranked(say(n(c.value)! >= 0 ? "example" : "exampleDown", { name: who(c), change: pct(Math.abs(n(c.value)!)) }), c) : null),
  mom12_1: (c, say) => (n(c.value) !== null ? ranked(say(n(c.value)! >= 0 ? "example" : "exampleDown", { name: who(c), change: pct(Math.abs(n(c.value)!)) }), c) : null),
  mom6: (c, say) => (n(c.value) !== null ? ranked(say(n(c.value)! >= 0 ? "example" : "exampleDown", { name: who(c), change: pct(Math.abs(n(c.value)!)) }), c) : null),
  above200dma: (c, say) => (n(c.value) !== null ? ranked(say(n(c.value)! >= 0 ? "example" : "exampleDown", { name: who(c), change: pct(Math.abs(n(c.value)!)) }), c) : null),
  beta3y: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), beta: num(n(c.value)!), moved: num(n(c.value)! * 10, 1) }), c) : null),
  divYield: (c, say) => (n(c.value) !== null ? ranked(say("example", { name: who(c), amount: usd(n(c.value)! * 1000, 0) }), c) : null),
  payoutOk: (c, say) => ranked(say("example", { name: who(c) }), c),
  paysDividend: (c, say) => ranked(say("example", { name: who(c) }), c),

  /* ---- portfolio characteristics ---- */
  holdingsCount: (c, say) => (n(c.value) !== null ? say("example", { count: num(n(c.value)!, 0) }) : null),
  weightedBeta: (c, say) => (n(c.value) !== null ? say("example", { beta: num(n(c.value)!), moved: num(n(c.value)! * 10, 1) }) : null),
  estimatedVolatility: (c, say) => {
    const v = n(c.value);
    if (v === null) return null;
    const base = n(c.allocatedAmd);
    const text = base !== null ? say("exampleAmount", { vol: pct(v), swing: formatAmd(base * v), base: formatAmd(base) }) : say("example", { vol: pct(v) });
    return n(c.band) !== null ? `${text} ${say("bandNote", { band: pct(n(c.band)!, 0) })}` : text;
  },
  portfolioDividendYield: (c, say) => {
    const v = n(c.value);
    const base = n(c.allocatedAmd);
    return v !== null && base !== null ? say("example", { amount: formatAmd(base * v), base: formatAmd(base) }) : null;
  },
  effectiveN: (c, say) => {
    if (n(c.value) === null) return null;
    const effective = num(n(c.value)!, 1);
    return n(c.count) !== null ? say("exampleCount", { count: num(n(c.count)!, 0), effective }) : say("example", { effective });
  },

  /* ---- holdings table headers ---- */
  allocation: (c, say) => {
    if (n(c.percent) === null) return null;
    const p = { name: who(c), percent: formatPercent(n(c.percent)!, 1) };
    return n(c.amountAmd) !== null ? say("exampleAmd", { ...p, amount: formatAmd(n(c.amountAmd)!) }) : say("example", p);
  },
  sharesCol: (c, say) => (n(c.shares) !== null && n(c.price) !== null ? say("example", { shares: num(n(c.shares)!, 0), count: n(c.shares)!, name: who(c), price: usd(n(c.price)!) }) : null),
  reasons: (c, say) => (typeof c.text === "string" && c.text ? say("example", { name: who(c), text: c.text }) : null),

  /* ---- benchmark comparison: performance and risk ---- */
  "bm.annualisedVolatility": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { window: win(c), p: pct(n(c.p)!), bench: bench(c), b: pct(n(c.b)!) }) : null),
  "bm.maxDrawdown": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { window: win(c), p: pct(Math.abs(n(c.p)!)), bench: bench(c), b: pct(Math.abs(n(c.b)!)) }) : null),
  "bm.worstDay": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { p: pct(n(c.p)!), bench: bench(c), b: pct(n(c.b)!) }) : null),
  "bm.worstMonth": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { p: pct(n(c.p)!), bench: bench(c), b: pct(n(c.b)!) }) : null),
  "bm.totalReturn": (c, say) => {
    if (n(c.p) === null || n(c.b) === null) return null;
    const pUp = n(c.p)! >= 0;
    const bUp = n(c.b)! >= 0;
    const part = pUp ? (bUp ? "example" : "exampleUpDown") : bUp ? "exampleDownUp" : "exampleDownDown";
    return say(part, { window: win(c), p: pct(Math.abs(n(c.p)!)), bench: bench(c), b: pct(Math.abs(n(c.b)!)) });
  },
  "bm.cagr": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { p: pct(n(c.p)!), b: pct(n(c.b)!), bench: bench(c) }) : null),
  "bm.sharpe": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { p: num(n(c.p)!), bench: bench(c), b: num(n(c.b)!) }) : null),
  "bm.sortino": (c, say) => (n(c.p) !== null && n(c.b) !== null ? say("example", { p: num(n(c.p)!), bench: bench(c), b: num(n(c.b)!) }) : null),
  "bm.beta": (c, say) => (n(c.p) !== null ? say("example", { p: num(n(c.p)!), bench: bench(c), moved: num(n(c.p)! * 10, 1) }) : null),
  "bm.correlation": (c, say) => (n(c.p) !== null ? say(n(c.p)! >= 0.9 ? "example" : n(c.p)! >= 0.6 ? "exampleMid" : "exampleLow", { p: num(n(c.p)!), bench: bench(c) }) : null),
  "bm.trackingError": (c, say) => (n(c.p) !== null ? say("example", { p: pct(n(c.p)!), bench: bench(c) }) : null),
  "bm.upCapture": (c, say) => (n(c.p) !== null ? say("example", { bench: bench(c), p: pct(n(c.p)!, 0) }) : null),
  "bm.downCapture": (c, say) => (n(c.p) !== null ? say("example", { bench: bench(c), p: pct(n(c.p)!, 0) }) : null),

  /* ---- benchmark comparison: diversification ---- */
  "div.holdingsCount": (c, say) => (n(c.p) !== null ? (typeof c.bText === "string" && c.bText !== "-" ? say("exampleBench", { p: num(n(c.p)!, 0), bText: c.bText }) : say("example", { p: num(n(c.p)!, 0) })) : null),
  "div.effectiveN": (c, say) => (n(c.p) !== null ? say("example", { p: num(n(c.p)!, 1) }) : null),
  "div.top1": (c, say) => (n(c.p) !== null ? say("example", { p: pct(n(c.p)!) }) : null),
  "div.top3": (c, say) => (n(c.p) !== null ? say("example", { p: pct(n(c.p)!) }) : null),
  "div.sectors": (c, say) => (n(c.p) !== null ? say("example", { p: num(n(c.p)!, 0), count: n(c.p)! }) : null),
  "div.maxSector": (c, say) => (n(c.p) !== null ? (n(c.b) !== null ? say("exampleBench", { p: pct(n(c.p)!), b: pct(n(c.b)!), bench: bench(c) }) : say("example", { p: pct(n(c.p)!) })) : null),
  "div.avgCorr": (c, say) => (n(c.p) !== null ? say(n(c.p)! >= 0.6 ? "example" : n(c.p)! >= 0.3 ? "exampleMid" : "exampleLow", { p: num(n(c.p)!) }) : null),
  "div.divRatio": (c, say) => (n(c.p) !== null ? say("example", { p: num(n(c.p)!), smaller: pct(1 - 1 / Math.max(n(c.p)!, 1), 0) }) : null),
};

/**
 * the key for a "Why this match" row, from the label the recommendation engine puts on it. These English labels are server text: they are
 * only the lookup key here; the label the user reads comes from the dictionary (invest area) and falls back to the server text.
 */
const DRIVER_KEY_BY_LABEL: Record<string, string> = {
  "Return on equity": "roe",
  "Operating margin": "opMargin",
  "Free-cash-flow margin": "fcfMargin",
  "Liabilities to equity": "debtToEquity",
  "Profitable years (last 3)": "earningsStability",
  "P/E (latest fiscal year)": "pe",
  "Price to sales": "ps",
  "Price to book": "pb",
  "Free-cash-flow yield": "fcfYield",
  "Revenue growth (year on year)": "revGrowth",
  "Revenue growth (3-year annualised)": "rev3yCAGR",
  "EPS growth (year on year)": "epsGrowth",
  "12-1 month price momentum": "mom12_1",
  "6-month price momentum": "mom6",
  "Price vs 200-day average": "above200dma",
  "1-year volatility": "vol1y",
  "Beta vs the S&P 500 ETF (3 years)": "beta3y",
  "1-year maximum drawdown": "maxDD",
  "Dividend yield": "divYield",
  "Dividend payout at or below 70%": "payoutOk",
  "Pays a dividend": "paysDividend",
};

/** the number behind a driver: its raw value, or, for older saved results without one, the one read back from its text ("103.0%" -> 1.03) */
export function driverNumber(d: { value: string; rawValue?: number | null }): number | null {
  if (typeof d.rawValue === "number" && Number.isFinite(d.rawValue)) return d.rawValue;
  const text = d.value.trim();
  const m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(text.replace(/,/g, ""));
  if (!m) return text === "yes" ? 1 : text === "no" ? 0 : null;
  return m[2] ? Number(m[1]) / 100 : Number(m[1]);
}

export const DRIVER_LABELS = Object.keys(DRIVER_KEY_BY_LABEL);
export const INFO_KEYS = Object.keys(EXAMPLES);

export function driverInfoKey(label: string): string | null {
  return DRIVER_KEY_BY_LABEL[label] ?? null;
}

/** the explanation for a metric, or null when there is none for that key. Texts come in the language the page is showing. */
export function metricInfo(key: string | null, ctx: InfoCtx = {}): MetricInfo | null {
  const example = key ? EXAMPLES[key] : undefined;
  if (!key || !example) return null;
  const text = (part: string, params?: Params) => tg(`metrics.${key}.${part}` as Key, params);
  return { title: text("title"), what: text("what"), read: text("read"), example: example(ctx, text) };
}
