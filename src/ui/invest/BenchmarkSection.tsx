"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { getComparison } from "../api/invest";
import { errorMessage } from "../api/client";
import type { ComparisonResult, ComparisonSeriesPoint, ComparisonWindow, MetricSet, PortfolioResult } from "../api/types";
import { AXIS_COLOR, CHART_COLORS, ChartFigure, DataTable, GRID_COLOR } from "../components/ChartParts";
import { Card, Segmented } from "../components/Display";
import { EmptyState, ErrorState, Note, Skeleton, Spinner } from "../components/Feedback";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { formatDate, formatDayMonth, formatNumber, formatPercent } from "../lib/format";
import s from "./invest.module.css";

export const WINDOWS: { value: ComparisonWindow; label: string }[] = [
  { value: "1M", label: "1M" },
  { value: "3M", label: "3M" },
  { value: "6M", label: "6M" },
  { value: "1Y", label: "1Y" },
  { value: "3Y", label: "3Y" },
  { value: "5Y", label: "5Y" },
];

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v: unknown, sign = false) => (num(v) === null ? "-" : formatPercent((v as number) * 100, 1, { sign }));
const dec2 = (v: unknown) => (num(v) === null ? "-" : formatNumber(v as number, 2));

/** Leads with risk (volatility, drawdown) as much as return, as the honesty rules require. */
const METRICS: { key: string; label: string; fmt: (v: unknown) => string; better?: "high" | "low" }[] = [
  { key: "annualisedVolatility", label: "Volatility (annualised)", fmt: (v) => pct(v), better: "low" },
  { key: "maxDrawdown", label: "Max drawdown", fmt: (v) => pct(v), better: "high" },
  { key: "worstDay", label: "Worst day", fmt: (v) => pct(v), better: "high" },
  { key: "worstMonth", label: "Worst month", fmt: (v) => pct(v), better: "high" },
  { key: "totalReturn", label: "Total return", fmt: (v) => pct(v, true), better: "high" },
  { key: "cagr", label: "Annualised return", fmt: (v) => pct(v, true), better: "high" },
  { key: "sharpe", label: "Sharpe ratio", fmt: dec2, better: "high" },
  { key: "sortino", label: "Sortino ratio", fmt: dec2, better: "high" },
  { key: "beta", label: "Beta vs benchmark", fmt: dec2 },
  { key: "correlation", label: "Correlation", fmt: dec2 },
  { key: "trackingError", label: "Tracking error", fmt: (v) => pct(v) },
  { key: "upCapture", label: "Up-capture", fmt: pct },
  { key: "downCapture", label: "Down-capture", fmt: pct },
];

function MetricsTable({ data }: { data: ComparisonResult }) {
  const p: MetricSet = data.metrics.portfolio;
  const b: MetricSet = data.metrics.benchmark;
  const rows = METRICS.filter((m) => num(p[m.key]) !== null || num(b[m.key]) !== null);
  return (
    <div>
      <p className={s.tblTitle}>Performance and risk</p>
      <div>
        <table style={{ width: "100%" }}>
          <caption className="sr-only">Portfolio and benchmark metrics over {data.window}</caption>
          <thead>
            <tr>
              <th scope="col" className={s.tblH}>Metric</th>
              <th scope="col" className={s.tblH} style={{ textAlign: "right" }}>Portfolio</th>
              <th scope="col" className={s.tblH} style={{ textAlign: "right" }}>Benchmark</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.key}>
                <th scope="row" style={cellL}>{m.label}</th>
                <td style={cellR}>{m.fmt(p[m.key])}</td>
                <td style={cellR}>{m.fmt(b[m.key])}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const cellL: React.CSSProperties = { textAlign: "left", padding: "10px 8px", borderBottom: "1px solid var(--border-faint)", fontSize: 14, fontWeight: 400, color: "var(--text-2)" };
const cellR: React.CSSProperties = { textAlign: "right", padding: "10px 8px", borderBottom: "1px solid var(--border-faint)", fontSize: 14, fontVariantNumeric: "tabular-nums" };

function DiversificationTable({ data }: { data: ComparisonResult }) {
  const d = data.diversification;
  if (!d) return null;
  const rows: [string, string, string][] = [
    ["Number of holdings", String(d.holdingsCount ?? "-"), d.universeSize ? `${d.universeSize} (index members)` : "-"],
    ["Effective number of holdings", dec2(d.effectiveN), "-"],
    ["Largest holding", pct(d.top1Weight), "-"],
    ["Top 3 holdings", pct(d.top3Weight), "-"],
    ["Sectors covered", String(d.sectorCount ?? "-"), "-"],
    ["Largest sector", pct(d.maxSectorWeight), pct(d.benchmarkMaxSectorWeight)],
    ["Average pairwise correlation", dec2(d.averagePairwiseCorrelation), "-"],
    ["Diversification ratio", dec2(d.diversificationRatio), "-"],
  ];
  return (
    <div>
      <p className={s.tblTitle}>Diversification</p>
      <table style={{ width: "100%" }}>
        <caption className="sr-only">Diversification of the portfolio compared with the benchmark</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...cellL, color: "var(--muted)", fontSize: 12 }}>Measure</th>
            <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>Portfolio</th>
            <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>Benchmark</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, a, b]) => (
            <tr key={k}>
              <th scope="row" style={cellL}>{k}</th>
              <td style={cellR}>{a}</td>
              <td style={cellR}>{b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.sectors && d.sectors.length > 0 ? (
        <details style={{ marginTop: 12, fontSize: 13, color: "var(--text-2)" }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)" }}>Sector exposure vs benchmark</summary>
          <table style={{ width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...cellL, color: "var(--muted)", fontSize: 12 }}>Sector</th>
                <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>Portfolio</th>
                <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>Benchmark</th>
              </tr>
            </thead>
            <tbody>
              {d.sectors.map((x) => (
                <tr key={x.sector}>
                  <th scope="row" style={cellL}>{x.sector}</th>
                  <td style={cellR}>{pct(x.portfolioWeight)}</td>
                  <td style={cellR}>{pct(x.benchmarkWeight)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null}
    </div>
  );
}

function BenchTip({ active, payload }: { active?: boolean; payload?: { payload: ComparisonSeriesPoint }[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className={s.tip}>
      <div className={s.tipDate}>{formatDate(p.date)}</div>
      <div>
        Recommended Portfolio: <strong className="num">{formatNumber(p.portfolio, 1)}</strong>
      </div>
      <div>
        Benchmark: <strong className="num">{formatNumber(p.benchmark, 1)}</strong>
      </div>
    </div>
  );
}

function Chart({ data }: { data: ComparisonResult }) {
  const reduced = useReducedMotion();
  const series = data.series;
  const domain = useMemo(() => {
    const vals = series.flatMap((p) => [p.portfolio, p.benchmark]);
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = Math.max((max - min) * 0.12, 1);
    return [Math.floor(min - pad), Math.ceil(max + pad)] as [number, number];
  }, [series]);
  const first = series[0];
  const last = series[series.length - 1];
  const summary = `Recommended Portfolio versus benchmark over ${data.window}, both rebased to 100 on ${formatDate(first.date)}. On ${formatDate(last.date)} the portfolio stands at ${formatNumber(last.portfolio, 1)} and the benchmark at ${formatNumber(last.benchmark, 1)}. Hypothetical back-test; not a forecast.`;
  const step = Math.max(1, Math.ceil(series.length / 40));
  return (
    <ChartFigure
      summary={summary}
      table={
        <div className={s.scrollTable}>
          <DataTable
            caption="Rebased values over time (start = 100)"
            columns={[
              { key: "d", label: "Date" },
              { key: "p", label: "Recommended Portfolio", numeric: true },
              { key: "b", label: "Benchmark", numeric: true },
            ]}
            rows={series.filter((_, i) => i % step === 0 || i === series.length - 1).map((p) => ({ d: formatDate(p.date), p: formatNumber(p.portfolio, 1), b: formatNumber(p.benchmark, 1) }))}
          />
        </div>
      }
    >
      <div className={s.benchChart}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 6" vertical={false} />
            <XAxis dataKey="date" tickFormatter={formatDayMonth} tick={{ fill: AXIS_COLOR, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#4F5753" }} minTickGap={52} />
            <YAxis domain={domain} tick={{ fill: AXIS_COLOR, fontSize: 12 }} tickLine={false} axisLine={false} width={40} />
            <Tooltip content={<BenchTip />} cursor={{ stroke: "#C0C2C3", strokeOpacity: 0.4 }} />
            <Line type="monotone" dataKey="benchmark" name="Benchmark" stroke="#C0C2C3" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={!reduced} />
            <Line type="monotone" dataKey="portfolio" name="Recommended Portfolio" stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} isAnimationActive={!reduced} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={s.legendRow}>
        <span className={s.legendKey}>
          <span className={s.keyLine} /> Recommended Portfolio (solid)
        </span>
        <span className={s.legendKey}>
          <span className={s.keyDash} /> Benchmark: {data.benchmark.label} (dashed)
        </span>
        <span>Both start at 100</span>
      </div>
    </ChartFigure>
  );
}

/**
 * Portfolio vs Benchmark. The first (1Y) block ships with the portfolio response; other windows call the comparison
 * endpoint with the recommended holdings. Loads independently of everything else on the page.
 * `fixed` (history review): show the saved block only, no timeframe selector.
 */
export function BenchmarkSection({ result, fixed }: { result: PortfolioResult; fixed?: boolean }) {
  const initial = result.benchmark ?? null;
  const [win, setWin] = useState<ComparisonWindow>(initial?.window ?? "1Y");
  const cache = useRef(new Map<ComparisonWindow, ComparisonResult>());
  const [data, setData] = useState<ComparisonResult | null>(initial);
  const [loading, setLoading] = useState(!initial && !fixed);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);
  const holdings = useMemo(() => result.holdings.map((h) => ({ symbol: h.symbol, shares: h.shares })), [result.holdings]);

  useEffect(() => {
    if (initial) cache.current.set(initial.window, initial);
  }, [initial]);

  useEffect(() => {
    if (fixed) return;
    const hit = cache.current.get(win);
    if (hit) {
      setData(hit);
      setError(null);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setError(null);
    getComparison({ holdings, window: win }, ctrl.signal)
      .then((r) => {
        cache.current.set(win, r.data);
        setData(r.data);
        setLoading(false);
      })
      .catch((e) => {
        if (ctrl.signal.aborted) return;
        setError(e);
        setLoading(false);
      });
    return () => ctrl.abort();
  }, [win, holdings, nonce, fixed]);

  const disclaimers = data?.disclaimers ?? [];
  return (
    <Card
      title="Portfolio vs Benchmark"
      eyebrow="Hypothetical back-test"
      actions={
        fixed ? null : (
          <>
            {loading ? <Spinner label="Loading comparison" /> : null}
            <Segmented label="Timeframe" value={win} onChange={setWin} options={WINDOWS} />
          </>
        )
      }
    >
      <Note tone="warn">
        <strong>Hypothetical back-test of today&apos;s selection using historical prices. Not a forecast; past performance does not guarantee future results.</strong>{" "}
        The benchmark is a reference, not a recommendation.
      </Note>
      <div style={{ height: 16 }} />
      {error && !data ? (
        <ErrorState title="We couldn't load the comparison" message={errorMessage(error)} onRetry={() => setNonce((n) => n + 1)} compact />
      ) : !data ? (
        loading ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">Loading comparison</span>
            <Skeleton height={340} />
          </div>
        ) : (
          <EmptyState title="No comparison available" message="There isn't enough price history for these holdings to draw a comparison." />
        )
      ) : data.series.length < 2 ? (
        <EmptyState title="Not enough history" message="These holdings don't have enough price history for this timeframe. Try a shorter one." />
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .2s" }} aria-busy={loading}>
          {error ? (
            <div style={{ marginBottom: 12 }}>
              <Note tone="warn" action={<button type="button" className={s.linkish} onClick={() => setNonce((n) => n + 1)}>Retry</button>}>
                {errorMessage(error)}
              </Note>
            </div>
          ) : null}
          <Chart data={data} />
          {data.truncated || (data.notes && data.notes.length > 0) ? (
            <div style={{ marginTop: 12 }}>
              <Note>
                {data.truncated ? `Showing ${formatDate(data.start)} to ${formatDate(data.end)}, which is shorter than the ${data.window} you chose because some holdings have less price history. ` : ""}
                {data.notes?.join(" ")}
              </Note>
            </div>
          ) : null}
          <div className={s.benchTables}>
            <MetricsTable data={data} />
            <DiversificationTable data={data} />
          </div>
          <ul className={s.disc} style={{ marginTop: 20 }}>
            {disclaimers.map((d) => (
              <li key={d}>{d}</li>
            ))}
            <li>{data.benchmark.label}: {data.benchmark.note ?? "reference only, not a recommendation."}</li>
          </ul>
        </div>
      )}
    </Card>
  );
}
