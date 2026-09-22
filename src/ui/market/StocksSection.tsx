"use client";

import { Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { getStocks } from "../api/market";
import { errorMessage } from "../api/client";
import type { StockItem } from "../api/types";
import { CHART_COLORS, ChartFigure, DataTable, NEG_COLOR } from "../components/ChartParts";
import { ChangeChip, Figure } from "../components/Display";
import { EmptyState, ErrorState, Skeleton } from "../components/Feedback";
import { useResource } from "../hooks/useResource";
import { formatDate, formatNumber, formatPercent, formatUsd } from "../lib/format";
import { MetaLine } from "./MetaLine";
import s from "./market.module.css";

function bigUsd(v: string | null): string {
  const n = v === null ? NaN : Number(v);
  if (!Number.isFinite(n)) return "-";
  if (Math.abs(n) >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (Math.abs(n) >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  return formatUsd(n, 0);
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
      <div className={s.spark}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 4, right: 2, bottom: 4, left: 2 }}>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Line type="monotone" dataKey="close" stroke={up ? CHART_COLORS[0] : NEG_COLOR} strokeWidth={2} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <p className={s.company} style={{ marginTop: 4 }}>
        1 month: {up ? "up" : "down"} {formatPercent(Math.abs(pct), 1)}
      </p>
    </ChartFigure>
  );
}

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
      <div>{item.price === null ? <Figure value={null} size="md" /> : <Figure value={item.price} decimals={2} prefix="$" size="md" />}</div>
      <Trend item={item} />
      <dl className={s.facts}>
        <div>
          <dt>Previous close</dt>
          <dd>{item.previousClose === null ? dash : formatUsd(item.previousClose, 2)}</dd>
        </div>
        <div>
          <dt>52-week range</dt>
          <dd>{item.low52w && item.high52w ? `${formatUsd(item.low52w, 0)} - ${formatUsd(item.high52w, 0)}` : dash}</dd>
        </div>
        <div>
          <dt>Market cap</dt>
          <dd>{bigUsd(item.marketCap)}</dd>
        </div>
        <div>
          <dt>P/E (TTM)</dt>
          <dd>{item.peTtm === null ? dash : formatNumber(item.peTtm, 1)}</dd>
        </div>
        <div>
          <dt>EPS (TTM)</dt>
          <dd>{item.epsTtm === null ? dash : formatUsd(item.epsTtm, 2)}</dd>
        </div>
        <div>
          <dt>Dividend yield</dt>
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
        {[0, 1, 2, 3, 4].map((i) => (
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
