"use client";

import { useState } from "react";
import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { getStocks } from "../api/market";
import { errorMessage } from "../api/client";
import type { StockItem } from "../api/types";
import { CHART_COLORS, ChartFigure, DataTable, NEG_COLOR } from "../components/ChartParts";
import { InfoTip } from "../components/InfoTip";
import { ChangeChip, Figure } from "../components/Display";
import { EmptyState, ErrorState, Skeleton } from "../components/Feedback";
import { useResource } from "../hooks/useResource";
import { useScrollReplay } from "../hooks/useScrollReplay";
import { formatDate, formatNumber, formatPercent, formatUsd } from "../lib/format";
import { CountFigure } from "./CountFigure";
import { MetaLine } from "./MetaLine";
import { STOCK_METRIC_INFO, type StockMetricKey } from "./stock-metric-info";
import s from "./market.module.css";

/** the label of a metric plus its "i": one short sentence saying what the number is */
function Label({ k }: { k: StockMetricKey }) {
  const info = STOCK_METRIC_INFO[k];
  return (
    <dt>
      {info.title}
      <InfoTip title={info.title} sections={[{ label: "", text: info.text }]} />
    </dt>
  );
}

function bigUsd(v: string | null): string {
  const n = v === null ? NaN : Number(v);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return formatUsd(n, 0);
}

/**
 * The one-month line. Each time it comes into view it is drawn again from left to right, and it is cleared once it has left the screen
 * completely, so it replays whenever the visitor scrolls to it, down or up (see useScrollReplay). With reduced motion it is just drawn.
 */
function Spark({ data, up }: { data: { date: string; close: number }[]; up: boolean }) {
  const [draw, setDraw] = useState({ key: 0, animate: false, hidden: false });
  const ref = useScrollReplay<HTMLDivElement>(
    () => setDraw((d) => ({ key: d.key + 1, animate: true, hidden: false })),
    () => setDraw((d) => ({ key: d.key + 1, animate: false, hidden: true })),
    [data.length, data[data.length - 1]?.close], // stable values, so a parent re-render does not restart the drawing
  );
  return (
    <div ref={ref} className={s.spark}>
      {draw.hidden ? null : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart key={draw.key} data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Line type="monotone" dataKey="close" stroke={up ? CHART_COLORS[0] : NEG_COLOR} strokeWidth={2} dot={false} isAnimationActive={draw.animate} animationDuration={1300} animationEasing="ease-out" />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}

function Trend({ item }: { item: StockItem }) {
  const h = item.history1m ?? [];
  if (h.length < 2) return <p className={s.company}>Trend data isn&apos;t available right now.</p>;
  const data = h.map((p) => ({ date: p.date, close: Number(p.close) }));
  const up = data[data.length - 1].close >= data[0].close;
  const pct = ((data[data.length - 1].close - data[0].close) / data[0].close) * 100;
  return (
    <ChartFigure
      summary={`${item.symbol} closing price over the last month: from ${formatUsd(data[0].close, 2)} on ${formatDate(data[0].date)} to ${formatUsd(data[data.length - 1].close, 2)} on ${formatDate(data[data.length - 1].date)}, ${up ? "up" : "down"} ${formatPercent(Math.abs(pct), 1)}.`}
      table={
        <DataTable
          caption={`${item.symbol} closing prices`}
          columns={[
            { key: "d", label: "Date" },
            { key: "c", label: "Close (USD)", numeric: true },
          ]}
          rows={[...data].reverse().map((p) => ({ d: formatDate(p.date), c: formatUsd(p.close, 2) }))}
        />
      }
      tableLabel="Show 1-month prices"
    >
      <Spark data={data} up={up} />
      <p className={s.company} style={{ marginTop: 4 }}>
        1 month: {up ? "up" : "down"} {formatPercent(Math.abs(pct), 1)}
      </p>
    </ChartFigure>
  );
}

/**
 * Only two things on a card move: the price counts up ONCE, the first time the card is on screen, and never again; and the one-month line
 * is drawn again whenever the card is scrolled to, down or up (Spark). Everything else is static.
 */
function StockCard({ item }: { item: StockItem }) {
  const dash = "-";
  return (
    <article className={s.stock} aria-label={`${item.name ?? item.symbol} (${item.symbol})`}>
      <div className={s.stockHead}>
        <div style={{ minWidth: 0 }}>
          <div className={s.symbol}>{item.symbol}</div>
          <div className={s.company}>{item.name ?? "Name unavailable"}</div>
        </div>
        <ChangeChip change={item.change} pct={item.changePct} decimals={2} />
      </div>
      <div>{item.price === null ? <Figure value={null} size="md" /> : <CountFigure value={item.price} decimals={2} prefix="$" srText={formatUsd(item.price, 2)} when="once" />}</div>
      <Trend item={item} />
      <dl className={s.facts}>
        <div>
          <Label k="previousClose" />
          <dd>{item.previousClose === null ? dash : formatUsd(item.previousClose, 2)}</dd>
        </div>
        <div>
          <Label k="range52w" />
          <dd>{item.low52w && item.high52w ? `${formatUsd(item.low52w, 0)} - ${formatUsd(item.high52w, 0)}` : dash}</dd>
        </div>
        <div>
          <Label k="marketCap" />
          <dd>{bigUsd(item.marketCap)}</dd>
        </div>
        <div>
          <Label k="pe" />
          <dd>{item.peTtm === null ? dash : formatNumber(item.peTtm, 1)}</dd>
        </div>
        <div>
          <Label k="eps" />
          <dd>{item.epsTtm === null ? dash : formatUsd(item.epsTtm, 2)}</dd>
        </div>
        <div>
          <Label k="dividendYield" />
          <dd>{item.dividendYield === null ? dash : formatPercent(item.dividendYield, 2)}</dd>
        </div>
      </dl>
      <p className={s.company}>
        {item.asOf ? `Price as of ${formatDate(item.asOf)}` : "Price time unavailable"}
        {item.isFixture ? " · test fixture data" : item.isDelayed ? " · delayed" : ""}
      </p>
    </article>
  );
}

export function StocksSection() {
  const res = useResource((signal) => getStocks(signal), []);
  if (res.status === "error" && !res.data) return <ErrorState title="We couldn't load stocks" message={errorMessage(res.error)} onRetry={res.reload} />;
  if (!res.data)
    return (
      <div className={s.stocks} role="status" aria-busy="true">
        <span className="sr-only">Loading stocks</span>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className={s.stock}>
            <Skeleton width={90} height={16} />
            <Skeleton width="60%" height={36} />
            <Skeleton height={64} />
            <Skeleton height={60} />
          </div>
        ))}
      </div>
    );
  const items = res.data.data.items;
  const missingFundamentals = items.every((i) => i.marketCap === null && i.peTtm === null);
  return (
    <div className={s.panel}>
      <MetaLine meta={res.data.meta} />
      {items.length === 0 ? (
        <EmptyState title="No stock data available" message="Stock cards will appear here once the data source responds." />
      ) : (
        <div className={s.stocks}>
          {items.map((i) => (
            <StockCard key={i.symbol} item={i} />
          ))}
        </div>
      )}
      {missingFundamentals ? <p className={s.company}>A dash means the value isn&apos;t available from the current free data source (fundamentals need a keyed provider).</p> : null}
    </div>
  );
}
