import { ApiError } from "@/lib/errors";
import { addMonths, todayIn } from "@/lib/time";
import { readLatestSnapshot, readPriceSeries, type Bar } from "@/market/read";
import { computeComparison, computeDiversification, DISCLAIMERS, universeSectorWeights } from "./benchmark";
import { investConfig } from "./config";
import type { ComparisonRequest } from "./schemas";

/**
 * POST /api/invest/comparison: recomputed from STORED prices on every call, nothing is persisted (handover 10.4).
 * Request: holdings [{symbol, shares}] + window. There is no cash field, so the comparison covers the invested part only.
 */
export async function runComparison(req: ComparisonRequest, opts: { now?: Date } = {}) {
  const cfg = investConfig();
  const months = cfg.benchmark.windows[req.window];
  const today = todayIn("America/New_York", opts.now ?? new Date());
  const from = addMonths(today, -Math.max(months + 1, 14));
  const symbols = req.holdings.map((h) => h.symbol);
  const rfSymbol = "^IRX";
  const series = await readPriceSeries([...symbols, cfg.benchmark.symbol, rfSymbol], from);

  const fields: Record<string, string> = {};
  req.holdings.forEach((h, i) => {
    if ((series.get(h.symbol)?.length ?? 0) < 30) fields[`holdings.${i}.symbol`] = "No stored price history for this symbol";
  });
  if (Object.keys(fields).length) throw new ApiError("VALIDATION_ERROR", 400, "Some fields are invalid.", fields);
  const bench = series.get(cfg.benchmark.symbol) ?? [];
  if (bench.length < 30) throw new ApiError("NO_SNAPSHOT", 503, "Benchmark price history is not available yet (the nightly batch has not run).");

  let cmp;
  try {
    cmp = computeComparison({
      window: req.window,
      months,
      holdings: req.holdings,
      bars: series,
      bench,
      rfYields: (series.get(rfSymbol) ?? []).map((b) => ({ date: b.date, value: b.close })),
      tradingDays: cfg.benchmark.tradingDaysPerYear,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "NOT_ENOUGH_COMMON_HISTORY") {
      throw new ApiError("INSUFFICIENT_HISTORY", 422, "These holdings share too little price history for a comparison.");
    }
    throw e;
  }

  const snap = await readLatestSnapshot();
  const sectorOf = new Map((snap?.payload.records ?? []).map((r) => [r.symbol, r.sector]));
  const last = (s: Bar[]) => s.filter((b) => b.date <= cmp.end).at(-1)!.adjClose;
  const values = req.holdings.map((h) => h.shares * last(series.get(h.symbol)!));
  const total = values.reduce((a, b) => a + b, 0);
  const diversification = computeDiversification({
    weights: req.holdings.map((h, i) => ({ symbol: h.symbol, weight: values[i] / total, sector: sectorOf.get(h.symbol) ?? null })),
    bars: series,
    benchSectorWeights: snap ? universeSectorWeights(snap.payload.records) : new Map(),
    universeSize: snap?.payload.coverage.issuers ?? 0,
    tradingDays: cfg.benchmark.tradingDaysPerYear,
  });

  const notes: string[] = [];
  if (cmp.truncated) notes.push(`The requested ${req.window} window is longer than the history all holdings share; the comparison starts on ${cmp.start}.`);
  return {
    window: req.window,
    benchmark: { symbol: cfg.benchmark.symbol, label: cfg.benchmark.label, note: "Reference only - not a recommendation." },
    requestedStart: cmp.requestedStart,
    start: cmp.start,
    end: cmp.end,
    truncated: cmp.truncated,
    notes,
    series: cmp.series,
    initialValueUsd: cmp.initialValueUsd,
    metrics: cmp.metrics,
    diversification,
    riskFreeRate: cmp.riskFreeRate,
    riskFreeSource: cmp.riskFreeSource,
    disclaimers: [...DISCLAIMERS],
  };
}

export type ComparisonPayload = Awaited<ReturnType<typeof runComparison>>;
