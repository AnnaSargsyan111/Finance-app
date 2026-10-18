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
import { useT, type Key } from "../i18n";
import { translate } from "../i18n/translate";
import { formatDate, formatDayMonth, formatNumber, formatPercent } from "../lib/format";
import { MetricTip } from "./MetricTip";
import s from "./invest.module.css";

/** the timeframe options; the button text comes from the dictionary (metrics.benchmark.window.<value>) */
export const WINDOWS: ComparisonWindow[] = ["1M", "3M", "6M", "1Y", "3Y", "5Y"];

type T = ReturnType<typeof useT>;

/** the texts of the comparison that the server sends in English (disclaimers, notes): shown from the dictionary when they match exactly, otherwise as sent */
const SERVER_TEXTS = [
  "metrics.benchmark.server.disclaimer1",
  "metrics.benchmark.server.disclaimer2",
  "metrics.benchmark.server.disclaimer3",
  "metrics.benchmark.server.disclaimer4",
  "metrics.benchmark.server.disclaimer5",
  "metrics.benchmark.server.benchmarkNote",
] as const;
const TRUNCATED_NOTE = /^The requested (\S+) window is longer than the history all holdings share; the comparison starts on (\S+)\.$/;
function serverText(t: T, text: string): string {
  const key = SERVER_TEXTS.find((k) => translate("en", k) === text);
  if (key) return t(key);
  const m = TRUNCATED_NOTE.exec(text);
  return m ? t("metrics.benchmark.server.truncatedNote", { window: m[1], start: m[2] }) : text;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const pct = (v: unknown, sign = false) => (num(v) === null ? "-" : formatPercent((v as number) * 100, 1, { sign }));
const dec2 = (v: unknown) => (num(v) === null ? "-" : formatNumber(v as number, 2));

/**
 * Leads with risk (volatility, drawdown) as much as return, as the honesty rules require. `label` is the English name, kept as a reference
 * (tests/ui/metric-info.test.ts reads this list); the text on screen is the dictionary's metrics.bm.<key>.title.
 */
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
  const t = useT();
  const p: MetricSet = data.metrics.portfolio;
  const b: MetricSet = data.metrics.benchmark;
  const rows = METRICS.filter((m) => num(p[m.key]) !== null || num(b[m.key]) !== null);
  return (
    <div>
      <p className={s.tblTitle}>{t("metrics.benchmark.perfTitle")}</p>
      <div>
        <table style={{ width: "100%" }}>
          <caption className="sr-only">{t("metrics.benchmark.perfCaption", { window: t(`metrics.benchmark.window.${data.window}`) })}</caption>
          <thead>
            <tr>
              <th scope="col" className={s.tblH}>{t("metrics.benchmark.colMetric")}</th>
              <th scope="col" className={s.tblH} style={{ textAlign: "right" }}>{t("metrics.benchmark.headPortfolio")}</th>
              <th scope="col" className={s.tblH} style={{ textAlign: "right" }}>{t("metrics.benchmark.headBenchmark")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.key}>
                <th scope="row" style={cellL}>
                  {t(`metrics.bm.${m.key}.title` as Key)}
                  <MetricTip k={`bm.${m.key}`} ctx={{ p: num(p[m.key]), b: num(b[m.key]), window: t(`metrics.period.${data.window}`), bench: data.benchmark.label }} />
                </th>
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
  const t = useT();
  const d = data.diversification;
  if (!d) return null;
  /** portfolio text, benchmark text, explanation key (its title is the row label), and the numbers behind the two texts (for the example sentence) */
  const rows: { a: string; b: string; key: `div.${string}`; p: number | null; bn: number | null }[] = [
    { a: String(d.holdingsCount ?? "-"), b: d.universeSize ? t("metrics.benchmark.indexMembers", { n: d.universeSize }) : "-", key: "div.holdingsCount", p: num(d.holdingsCount), bn: num(d.universeSize) },
    { a: dec2(d.effectiveN), b: "-", key: "div.effectiveN", p: num(d.effectiveN), bn: null },
    { a: pct(d.top1Weight), b: "-", key: "div.top1", p: num(d.top1Weight), bn: null },
    { a: pct(d.top3Weight), b: "-", key: "div.top3", p: num(d.top3Weight), bn: null },
    { a: String(d.sectorCount ?? "-"), b: "-", key: "div.sectors", p: num(d.sectorCount), bn: null },
    { a: pct(d.maxSectorWeight), b: pct(d.benchmarkMaxSectorWeight), key: "div.maxSector", p: num(d.maxSectorWeight), bn: num(d.benchmarkMaxSectorWeight) },
    { a: dec2(d.averagePairwiseCorrelation), b: "-", key: "div.avgCorr", p: num(d.averagePairwiseCorrelation), bn: null },
    { a: dec2(d.diversificationRatio), b: "-", key: "div.divRatio", p: num(d.diversificationRatio), bn: null },
  ];
  return (
    <div>
      <p className={s.tblTitle}>{t("metrics.benchmark.divTitle")}</p>
      <table style={{ width: "100%" }}>
        <caption className="sr-only">{t("metrics.benchmark.divCaption")}</caption>
        <thead>
          <tr>
            <th scope="col" style={{ ...cellL, color: "var(--muted)", fontSize: 12 }}>{t("metrics.benchmark.colMeasure")}</th>
            <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>{t("metrics.benchmark.headPortfolio")}</th>
            <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>{t("metrics.benchmark.headBenchmark")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key}>
              <th scope="row" style={cellL}>
                {t(`metrics.${r.key}.title` as Key)}
                <MetricTip k={r.key} ctx={{ p: r.p, b: r.bn, bText: r.b, bench: data.benchmark.label }} />
              </th>
              <td style={cellR}>{r.a}</td>
              <td style={cellR}>{r.b}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {d.sectors && d.sectors.length > 0 ? (
        <details style={{ marginTop: 12, fontSize: 13, color: "var(--text-2)" }}>
          <summary style={{ cursor: "pointer", color: "var(--muted)" }}>{t("metrics.benchmark.sectorExposure")}</summary>
          <table style={{ width: "100%", marginTop: 8 }}>
            <thead>
              <tr>
                <th scope="col" style={{ ...cellL, color: "var(--muted)", fontSize: 12 }}>{t("metrics.benchmark.colSector")}</th>
                <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>{t("metrics.benchmark.headPortfolio")}</th>
                <th scope="col" style={{ ...cellR, color: "var(--muted)", fontSize: 12 }}>{t("metrics.benchmark.headBenchmark")}</th>
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
  const t = useT();
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className={s.tip}>
      <div className={s.tipDate}>{formatDate(p.date)}</div>
      <div>
        {t("metrics.benchmark.portfolioName")}: <strong className="num">{formatNumber(p.portfolio, 1)}</strong>
      </div>
      <div>
        {t("metrics.benchmark.benchmarkName")}: <strong className="num">{formatNumber(p.benchmark, 1)}</strong>
      </div>
    </div>
  );
}

function Chart({ data }: { data: ComparisonResult }) {
  const t = useT();
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
  const summary = t("metrics.benchmark.chartSummary", {
    window: t(`metrics.benchmark.window.${data.window}`),
    first: formatDate(first.date),
    last: formatDate(last.date),
    portfolio: formatNumber(last.portfolio, 1),
    benchmark: formatNumber(last.benchmark, 1),
  });
  const step = Math.max(1, Math.ceil(series.length / 40));
  return (
    <ChartFigure
      summary={summary}
      table={
        <div className={s.scrollTable}>
          <DataTable
            caption={t("metrics.benchmark.tableCaption")}
            columns={[
              { key: "d", label: t("metrics.benchmark.colDate") },
              { key: "p", label: t("metrics.benchmark.colPortfolio"), numeric: true },
              { key: "b", label: t("metrics.benchmark.colBenchmark"), numeric: true },
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
            <Line type="monotone" dataKey="benchmark" name={t("metrics.benchmark.benchmarkName")} stroke="#C0C2C3" strokeWidth={2} strokeDasharray="6 5" dot={false} isAnimationActive={!reduced} />
            <Line type="monotone" dataKey="portfolio" name={t("metrics.benchmark.portfolioName")} stroke={CHART_COLORS[0]} strokeWidth={2.5} dot={false} isAnimationActive={!reduced} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className={s.legendRow}>
        <span className={s.legendKey}>
          <span className={s.keyLine} /> {t("metrics.benchmark.legendPortfolio")}
        </span>
        <span className={s.legendKey}>
          <span className={s.keyDash} /> {t("metrics.benchmark.legendBenchmark", { label: data.benchmark.label })}
        </span>
        <span>{t("metrics.benchmark.legendStart")}</span>
      </div>
    </ChartFigure>
  );
}

/**
 * Portfolio vs Benchmark. The first (1Y) block ships with the portfolio response; other windows call the comparison
 * endpoint with the recommended holdings. Loads independently of everything else on the page.
 * `fixed` (history review): show the saved block only, no timeframe selector.
 */
export function BenchmarkSection({ result, fixed, memory }: { result: PortfolioResult; fixed?: boolean; memory?: { window: ComparisonWindow | null; cache: Map<ComparisonWindow, ComparisonResult>; onWindow: (w: ComparisonWindow) => void } }) {
  const t = useT();
  const initial = result.benchmark ?? null;
  const [win, setWinState] = useState<ComparisonWindow>(memory?.window ?? initial?.window ?? "1Y");
  const setWin = (w: ComparisonWindow) => {
    setWinState(w);
    memory?.onWindow(w);
  };
  const cache = useRef(memory?.cache ?? new Map<ComparisonWindow, ComparisonResult>());
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
      title={t("metrics.benchmark.title")}
      eyebrow={t("metrics.benchmark.eyebrow")}
      actions={
        fixed ? null : (
          <>
            {loading ? <Spinner label={t("metrics.benchmark.loading")} /> : null}
            <Segmented label={t("metrics.benchmark.timeframe")} value={win} onChange={setWin} options={WINDOWS.map((w) => ({ value: w, label: t(`metrics.benchmark.window.${w}`) }))} />
          </>
        )
      }
    >
      <Note tone="warn">
        <strong>{t("metrics.benchmark.noteStrong")}</strong>{" "}
        {t("metrics.benchmark.noteRest")}
      </Note>
      <div style={{ height: 16 }} />
      {error && !data ? (
        <ErrorState title={t("metrics.benchmark.errorTitle")} message={errorMessage(error)} onRetry={() => setNonce((n) => n + 1)} compact />
      ) : !data ? (
        loading ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("metrics.benchmark.loading")}</span>
            <Skeleton height={340} />
          </div>
        ) : (
          <EmptyState title={t("metrics.benchmark.emptyTitle")} message={t("metrics.benchmark.emptyMessage")} />
        )
      ) : data.series.length < 2 ? (
        <EmptyState title={t("metrics.benchmark.shortTitle")} message={t("metrics.benchmark.shortMessage")} />
      ) : (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity .2s" }} aria-busy={loading}>
          {error ? (
            <div style={{ marginBottom: 12 }}>
              <Note tone="warn" action={<button type="button" className={s.linkish} onClick={() => setNonce((n) => n + 1)}>{t("metrics.benchmark.retry")}</button>}>
                {errorMessage(error)}
              </Note>
            </div>
          ) : null}
          <Chart data={data} />
          {data.truncated || (data.notes && data.notes.length > 0) ? (
            <div style={{ marginTop: 12 }}>
              <Note>
                {data.truncated ? `${t("metrics.benchmark.truncated", { start: formatDate(data.start), end: formatDate(data.end), window: t(`metrics.benchmark.window.${data.window}`) })} ` : ""}
                {data.notes?.map((note) => serverText(t, note)).join(" ")}
              </Note>
            </div>
          ) : null}
          <div className={s.benchTables}>
            <MetricsTable data={data} />
            <DiversificationTable data={data} />
          </div>
          <ul className={s.disc} style={{ marginTop: 20 }}>
            {disclaimers.map((d) => (
              <li key={d}>{serverText(t, d)}</li>
            ))}
            <li>{t("metrics.benchmark.footNote", { label: data.benchmark.label, note: data.benchmark.note ? serverText(t, data.benchmark.note) : t("metrics.benchmark.footNoteDefault") })}</li>
          </ul>
        </div>
      )}
    </Card>
  );
}
