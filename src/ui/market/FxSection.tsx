"use client";

import { useMemo, useState } from "react";
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { FX_PAIRS, FX_PERIODS, getFxHistory, getFxLatest, type FxPeriodId } from "../api/market";
import { errorMessage } from "../api/client";
import type { FxPoint } from "../api/types";
import { AXIS_COLOR, CHART_COLORS, ChartFigure, DataTable, GRID_COLOR } from "../components/ChartParts";
import { Card, ChangeChip, Figure, Segmented } from "../components/Display";
import { EmptyState, ErrorState, Note, Skeleton, Spinner } from "../components/Feedback";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useResource } from "../hooks/useResource";
import { cx } from "../lib/cx";
import { formatDate, formatDayMonth, formatFx, fxDecimals } from "../lib/format";
import { carriedRuns } from "./fx-utils";
import { MetaLine } from "./MetaLine";
import s from "./market.module.css";

function FxTip({ active, payload, pair }: { active?: boolean; payload?: { payload: FxPoint }[]; pair: string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className={s.tip}>
      <div className={s.tipDate}>{formatDate(p.date)}</div>
      <div className={s.tipVal}>{formatFx(p.rate, pair)} AMD</div>
      {p.isCarriedForward ? <div className={s.tipNote}>Weekend or holiday: last working-day rate ({formatDate(p.sourceDate)})</div> : null}
    </div>
  );
}

function FxChart({ pair, days }: { pair: string; days: number }) {
  const reduced = useReducedMotion();
  const res = useResource((signal) => getFxHistory(pair, days, signal), [pair, days]);
  const series = res.data?.data.series ?? [];
  const dp = fxDecimals(pair);
  const stats = useMemo(() => {
    if (!series.length) return null;
    const vals = series.map((p) => Number(p.rate));
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const pad = (max - min || max * 0.01) * 0.15;
    return { min, max, domain: [min - pad, max + pad] as [number, number], runs: carriedRuns(series), carried: series.filter((p) => p.isCarriedForward).length };
  }, [series]);
  const label = FX_PERIODS.find((p) => p.days === days)?.label ?? `${days}D`;

  if (res.status === "error" && !res.data) return <ErrorState title={`We couldn't load the ${pair} history`} message={errorMessage(res.error)} onRetry={res.reload} compact />;
  if (!res.data || !stats) return <Skeleton height={340} />;

  const first = series[0];
  const last = series[series.length - 1];
  const summary = `${pair} exchange rate over the last ${label}: from ${formatFx(first.rate, pair)} on ${formatDate(first.date)} to ${formatFx(last.rate, pair)} on ${formatDate(last.date)}. Lowest ${formatFx(stats.min, pair)}, highest ${formatFx(stats.max, pair)}. ${stats.carried} of ${series.length} days are weekend or holiday values carried forward.`;

  return (
    <div style={{ opacity: res.loading ? 0.6 : 1, transition: "opacity .2s" }} aria-busy={res.loading}>
      <ChartFigure
        summary={summary}
        table={
          <div className={s.scrollTable}>
            <DataTable
              caption={`${pair} daily rates`}
              columns={[
                { key: "d", label: "Date" },
                { key: "r", label: "Rate (AMD)", numeric: true },
                { key: "n", label: "Note" },
              ]}
              rows={[...series].reverse().map((p) => ({ d: formatDate(p.date), r: formatFx(p.rate, pair), n: p.isCarriedForward ? `Carried forward from ${formatDate(p.sourceDate)}` : "" }))}
            />
          </div>
        }
      >
        <div className={s.fxChart}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`fx-${pair.replace("/", "")}`} x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0" stopColor={CHART_COLORS[0]} stopOpacity={0.22} />
                  <stop offset="1" stopColor={CHART_COLORS[0]} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID_COLOR} strokeDasharray="3 6" vertical={false} />
              {stats.runs.map((r) => (
                <ReferenceArea key={r.x1 + r.x2} x1={r.x1} x2={r.x2} fill="#C0C2C3" fillOpacity={stats.runs.length > 20 ? 0.06 : 0.09} stroke={stats.runs.length > 20 ? "none" : "#C0C2C3"} strokeOpacity={0.2} strokeDasharray="3 4" ifOverflow="extendDomain" />
              ))}
              <XAxis dataKey="date" tickFormatter={formatDayMonth} tick={{ fill: AXIS_COLOR, fontSize: 12 }} tickLine={false} axisLine={{ stroke: "#4F5753" }} minTickGap={48} />
              <YAxis domain={stats.domain} tickFormatter={(v: number) => v.toFixed(dp)} tick={{ fill: AXIS_COLOR, fontSize: 12 }} tickLine={false} axisLine={false} width={dp === 4 ? 52 : 48} tickCount={5} />
              <Tooltip content={<FxTip pair={pair} />} cursor={{ stroke: "#C0C2C3", strokeOpacity: 0.4 }} />
              <Area type="monotone" dataKey={(p: FxPoint) => Number(p.rate)} stroke={CHART_COLORS[0]} strokeWidth={2} fill={`url(#fx-${pair.replace("/", "")})`} isAnimationActive={!reduced} dot={false} activeDot={{ r: 4, fill: CHART_COLORS[0], stroke: "#020203", strokeWidth: 2 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className={s.legendRow} aria-hidden={stats.carried === 0 ? true : undefined}>
          <span className={s.legendKey}>
            <span className={s.keyLine} /> Official CBA rate
          </span>
          {stats.carried > 0 ? (
            <span className={s.legendKey}>
              <span className={s.keyBand} /> Weekend / holiday: last working-day rate carried forward ({stats.carried} {stats.carried === 1 ? "day" : "days"})
            </span>
          ) : null}
        </div>
      </ChartFigure>
    </div>
  );
}

export function FxSection() {
  const latest = useResource((signal) => getFxLatest(signal), []);
  const [pair, setPair] = useState<string>(FX_PAIRS[0]);
  const [period, setPeriod] = useState<FxPeriodId>("1M");
  const days = FX_PERIODS.find((p) => p.id === period)!.days;

  return (
    <div className={s.panel}>
      {latest.status === "error" && !latest.data ? (
        <ErrorState title="We couldn't load exchange rates" message={errorMessage(latest.error)} onRetry={latest.reload} />
      ) : (
        <>
          <div className={s.pairs} role="radiogroup" aria-label="Currency pair">
            {latest.data
              ? latest.data.data.rates.map((r) => {
                  const active = r.pair === pair;
                  return (
                    <button
                      key={r.pair}
                      id={`fxp-${FX_PAIRS.indexOf(r.pair as (typeof FX_PAIRS)[number])}`}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      tabIndex={active ? 0 : -1}
                      className={cx(s.pair, active && s.pairActive)}
                      onClick={() => setPair(r.pair)}
                      onKeyDown={(e) => {
                        const i = FX_PAIRS.indexOf(r.pair as (typeof FX_PAIRS)[number]);
                        let n = -1;
                        if (e.key === "ArrowRight" || e.key === "ArrowDown") n = (i + 1) % FX_PAIRS.length;
                        if (e.key === "ArrowLeft" || e.key === "ArrowUp") n = (i + FX_PAIRS.length - 1) % FX_PAIRS.length;
                        if (n >= 0) {
                          e.preventDefault();
                          setPair(FX_PAIRS[n]);
                          requestAnimationFrame(() => document.getElementById(`fxp-${n}`)?.focus());
                        }
                      }}
                    >
                      <span className={s.pairName}>
                        {r.pair}
                        {active ? <span className={s.pairSel}>Chart</span> : null}
                      </span>
                      <Figure value={r.rate} decimals={fxDecimals(r.pair)} size="md" />
                      <span>
                        <ChangeChip change={r.diff} decimals={fxDecimals(r.pair)} />
                      </span>
                      <span className={s.pairDate}>CBA official rate, {formatDate(r.sourceDate)}</span>
                    </button>
                  );
                })
              : FX_PAIRS.map((p) => (
                  <div key={p} className={s.pair} aria-hidden="true">
                    <Skeleton width={70} height={14} />
                    <Skeleton width="80%" height={36} />
                    <Skeleton width={90} height={22} radius={99} />
                    <Skeleton width="60%" height={12} />
                  </div>
                ))}
          </div>
          {latest.data ? <MetaLine meta={latest.data.meta} label="Rates fetched" /> : null}
        </>
      )}

      <Card
        title={`${pair} history`}
        eyebrow="Historical movement"
        actions={
          <>
            {latest.loading ? <Spinner label="Refreshing" /> : null}
            <Segmented label="Time period" value={period} onChange={setPeriod} options={FX_PERIODS.map((p) => ({ value: p.id, label: p.label, title: `Last ${p.days} days` }))} />
          </>
        }
      >
        <FxChart pair={pair} days={days} />
        <div style={{ marginTop: 16 }}>
          <Note>The CBA publishes one official rate per working day. On weekends and holidays the latest working-day rate is used, and those days are shaded on the chart.</Note>
        </div>
      </Card>
      {latest.data && latest.data.data.rates.length === 0 ? <EmptyState title="No exchange rates available" message="Rates will appear here once the data source responds." /> : null}
    </div>
  );
}
