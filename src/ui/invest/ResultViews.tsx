"use client";

import type { ReactNode } from "react";
import type { Driver, Holding, PortfolioResult, RecommendationResult, SingleResult, StockPick } from "../api/types";
import { Card } from "../components/Display";
import { Note } from "../components/Feedback";
import { formatAmd, formatDate, formatNumber, formatPercent, formatUsd } from "../lib/format";
import { MetricTip } from "./MetricTip";
import { driverInfoKey, driverNumber, type InfoCtx } from "./metric-info";
import s from "./invest.module.css";

/* ------------------------------------------------------------------ score */
export function ScoreCard({ result, action }: { result: RecommendationResult; action?: ReactNode }) {
  return (
    <Card>
      <div className={s.scoreCard}>
        <div>
          <span className={s.scoreLabel}>
            {result.scoreLabel || "Match score"}
            <MetricTip k="matchScore" ctx={{ score: result.score }} />
          </span>
          <div className={s.scoreRow}>
            <span style={{ fontSize: "clamp(48px, 8vw, 72px)", fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1 }} className="num" aria-label={`Match score ${result.score} out of 100`}>
              {result.score}
            </span>
            <span className={s.scoreOf}>/ 100</span>
          </div>
          <div className={s.meter} aria-hidden="true">
            <div className={s.meterFill} style={{ width: `${Math.max(0, Math.min(100, result.score))}%` }} />
          </div>
        </div>
        <div>
          <p className={s.scoreNote}>{result.scoreNote}</p>
          <p className={s.scoreNote} style={{ color: "var(--muted)", fontSize: 13 }}>
            It is a fit score, not a probability and not an expected return.
          </p>
          {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ shared pieces */
function Drivers({ drivers, name, cost }: { drivers?: Driver[]; name: string; cost: number | null }) {
  if (!drivers?.length) return null;
  return (
    <ul className={s.drivers}>
      {drivers.map((d, i) => (
        <li key={`${d.label}-${i}`} className={s.driver}>
          <span>
            {d.label}
            <MetricTip k={driverInfoKey(d.label)} ctx={{ name, value: driverNumber(d), top: d.topPercent, cost }} />
          </span>
          <span className={s.driverVal}>
            {d.value}
            {d.topPercent != null ? <small>top {d.topPercent}% of eligible stocks</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Warnings({ result }: { result: RecommendationResult }) {
  if (!result.warnings?.length) return null;
  return (
    <div className={s.warnings}>
      {result.warnings.map((w, i) => (
        <Note key={`${w.code}-${i}`} tone="warn">
          {w.message}
        </Note>
      ))}
    </div>
  );
}

export function FinePrint({ result }: { result: RecommendationResult }) {
  return (
    <div className={s.finePrint}>
      <ul className={s.disc}>
        {result.disclaimers.map((d) => (
          <li key={d}>{d}</li>
        ))}
      </ul>
      <p>
        Prices as of {formatDate(result.dataAsOf)} · USD/AMD {formatNumber(result.usdRate, 2)} ({result.rateSource ?? "CBA"}, {formatDate(result.rateDate)}) · method {result.methodologyVersion}
      </p>
    </div>
  );
}

function amounts(result: RecommendationResult) {
  const ctx = { inputAmd: result.inputs.amountAmd, allocatedAmd: result.allocatedAmountAmd, unallocatedAmd: result.unallocatedCashAmd };
  return (
    <>
      <div>
        <dt>
          Allocated
          <MetricTip k="allocated" ctx={ctx} />
        </dt>
        <dd>
          {formatAmd(result.allocatedAmountAmd)}
          <small>{formatUsd(result.allocatedAmountUsd, 2)}</small>
        </dd>
      </div>
      <div>
        <dt>
          Unallocated cash
          <MetricTip k="unallocated" ctx={ctx} />
        </dt>
        <dd>
          {formatAmd(result.unallocatedCashAmd)}
          <small>{formatUsd(result.unallocatedCashUsd, 2)}</small>
        </dd>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ single stock */
export function SingleView({ result }: { result: SingleResult }) {
  const p = result.pick;
  const m = p.metrics;
  const tip = { name: p.name, price: Number(p.price), shares: p.shares, cost: Number(p.cost), allocatedAmd: result.allocatedAmountAmd, leftUsd: Number(result.unallocatedCashUsd), leftAmd: result.unallocatedCashAmd };
  return (
    <div className={s.section}>
      <div className={s.pickGrid}>
        <Card eyebrow="Best match for your preferences" title={undefined}>
          <h3 className={s.company}>{p.name}</h3>
          <p className={s.ticker}>
            {p.symbol}
            {p.sector ? ` · ${p.sector}` : ""}
          </p>
          <dl className={s.stats}>
            <div>
              <dt>
                Price per share
                <MetricTip k="price" ctx={tip} />
              </dt>
              <dd>{formatUsd(p.price, 2)}</dd>
            </div>
            <div>
              <dt>
                Shares for your amount
                <MetricTip k="shares" ctx={tip} />
              </dt>
              <dd>{formatNumber(p.shares)}</dd>
            </div>
            <div>
              <dt>
                Cost
                <MetricTip k="cost" ctx={tip} />
              </dt>
              <dd>
                {formatUsd(p.cost, 2)}
                <small>{formatAmd(result.allocatedAmountAmd)}</small>
              </dd>
            </div>
            <div>
              <dt>
                Cash left over
                <MetricTip k="cashLeft" ctx={tip} />
              </dt>
              <dd>
                {formatAmd(result.unallocatedCashAmd)}
                <small>{formatUsd(result.unallocatedCashUsd, 2)}</small>
              </dd>
            </div>
            {m?.vol1y != null ? (
              <div>
                <dt>
                  1-year volatility
                  <MetricTip k="vol1y" ctx={{ ...tip, value: m.vol1y }} />
                </dt>
                <dd>{formatPercent(m.vol1y * 100, 1)}</dd>
              </div>
            ) : null}
            {m?.maxDD1y != null ? (
              <div>
                <dt>
                  1-year max drawdown
                  <MetricTip k="maxDD" ctx={{ ...tip, value: m.maxDD1y }} />
                </dt>
                <dd>{formatPercent(m.maxDD1y * 100, 1)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
        <Card title="Why this match" eyebrow="What stands out">
          <Drivers drivers={p.drivers} name={p.name} cost={Number.isFinite(Number(p.cost)) ? Number(p.cost) : null} />
          <p className="sr-only">{p.explanation}</p>
        </Card>
      </div>
      <Warnings result={result} />
      {result.runnersUp && result.runnersUp.length > 0 ? (
        <Card title="Also considered" eyebrow="Runners-up">
          <div className={s.runners}>
            {result.runnersUp.map((r: StockPick) => (
              <div key={r.symbol} className={s.runner}>
                <span>
                  {r.name} <span style={{ color: "var(--muted)" }}>({r.symbol})</span>
                </span>
                <span>{r.composite != null ? `Score ${Math.round(r.composite)}` : ""}</span>
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <FinePrint result={result} />
    </div>
  );
}

/* ------------------------------------------------------------------ portfolio */
function reasonText(h: Holding): string {
  const top = (h.drivers ?? []).slice(0, 2).map((d) => `${d.label} ${d.value}`);
  return top.join(" · ") || "Balanced fit for your risk and horizon.";
}

function HoldingsTable({ result }: { result: PortfolioResult }) {
  const first = result.holdings[0];
  const tip = first ? { name: first.name, percent: first.allocationPercent, amountAmd: first.allocatedAmountAmd, shares: first.shares, price: Number(first.price), text: reasonText(first) } : {};
  return (
    <table className={s.hold}>
      <caption className="sr-only">Recommended portfolio holdings</caption>
      <thead>
        <tr>
          <th scope="col">Asset</th>
          <th scope="col" className={s.r}>
            Allocation
            <MetricTip k="allocation" ctx={tip} />
          </th>
          <th scope="col" className={s.r}>Amount (AMD)</th>
          <th scope="col" className={s.r}>Amount (USD)</th>
          <th scope="col" className={s.r}>
            Shares
            <MetricTip k="sharesCol" ctx={tip} />
          </th>
          <th scope="col">
            Reasons
            <MetricTip k="reasons" ctx={tip} />
          </th>
        </tr>
      </thead>
      <tbody>
        {result.holdings.map((h) => (
          <tr key={h.symbol}>
            <td data-label="Asset">
              <div className={s.assetName}>{h.name}</div>
              <div className={s.assetSub}>
                {h.symbol}
                {h.sector ? ` · ${h.sector}` : ""} · {formatUsd(h.price, 2)} / share
              </div>
            </td>
            <td data-label="Allocation" className={s.r}>
              {formatPercent(h.allocationPercent, 1)}
              {h.targetWeight != null ? <div className={s.assetSub}>target {formatPercent(h.targetWeight * 100, 1)}</div> : null}
              <div className={s.pctBar} aria-hidden="true">
                <div className={s.pctBarFill} style={{ width: `${Math.min(100, h.allocationPercent)}%` }} />
              </div>
            </td>
            <td data-label="Amount (AMD)" className={s.r}>{formatAmd(h.allocatedAmountAmd, { suffix: false })}</td>
            <td data-label="Amount (USD)" className={s.r}>{formatUsd(h.allocatedAmountUsd, 2)}</td>
            <td data-label="Shares" className={s.r}>{formatNumber(h.shares)}</td>
            <td data-label="Reasons" className={`${s.reasonCell}`}>
              <span className={s.reasons}>{reasonText(h)}</span>
            </td>
          </tr>
        ))}
        <tr className={s.holdTotal}>
          <td data-label="Asset">
            <div className={s.assetName}>Unallocated cash</div>
            <div className={s.assetSub}>What is left after buying whole shares</div>
          </td>
          <td data-label="Allocation" className={s.r}>-</td>
          <td data-label="Amount (AMD)" className={s.r}>{formatAmd(result.unallocatedCashAmd, { suffix: false })}</td>
          <td data-label="Amount (USD)" className={s.r}>{formatUsd(result.unallocatedCashUsd, 2)}</td>
          <td data-label="Shares" className={s.r}>-</td>
          <td data-label="Reasons" className={s.reasonCell} />
        </tr>
      </tbody>
    </table>
  );
}

export function PortfolioView({ result, benchmark }: { result: PortfolioResult; benchmark: ReactNode }) {
  const m = result.metrics ?? {};
  const count = m.holdingsCount != null ? m.holdingsCount : result.holdings.length;
  const allocatedAmd = result.allocatedAmountAmd;
  const metricItems: { label: string; value: string; key: string; ctx: InfoCtx }[] = [
    { label: "Holdings", value: String(count), key: "holdingsCount", ctx: { value: count } },
    { label: "Weighted beta", value: m.weightedBeta != null ? formatNumber(m.weightedBeta, 2) : "-", key: "weightedBeta", ctx: { value: m.weightedBeta } },
    { label: "Estimated volatility", value: m.estimatedVolatility != null ? formatPercent(m.estimatedVolatility * 100, 1) : "-", key: "estimatedVolatility", ctx: { value: m.estimatedVolatility, band: m.volatilityBand, allocatedAmd } },
    { label: "Dividend yield", value: m.weightedDividendYield != null ? formatPercent(m.weightedDividendYield * 100, 2) : "-", key: "portfolioDividendYield", ctx: { value: m.weightedDividendYield, allocatedAmd } },
    { label: "Effective holdings", value: m.effectiveN != null ? formatNumber(m.effectiveN, 1) : "-", key: "effectiveN", ctx: { value: m.effectiveN, count } },
  ];
  return (
    <div className={s.section}>
      <Card title="Recommended portfolio" eyebrow="Allocation of your amount">
        <HoldingsTable result={result} />
        <dl className={s.stats} style={{ marginTop: 20 }}>
          {amounts(result)}
        </dl>
      </Card>
      <Warnings result={result} />
      <Card title="Portfolio characteristics" eyebrow="At a glance">
        <dl className={s.metricsGrid}>
          {metricItems.map((it) => (
            <div key={it.label} className={s.metric}>
              <dt>
                {it.label}
                {it.value !== "-" ? <MetricTip k={it.key} ctx={it.ctx} /> : null}
              </dt>
              <dd>{it.value}</dd>
            </div>
          ))}
        </dl>
        {m.sectorSplit && m.sectorSplit.length > 0 ? (
          <p className={s.miniNote} style={{ marginTop: 16 }}>
            Sectors: {m.sectorSplit.map((x) => `${x.sector} ${formatPercent(x.weight * 100, 0)}`).join(", ")}.
          </p>
        ) : null}
        {result.why ? (
          <ul className={s.whyList}>
            {result.why.holdingsCount ? <li>{result.why.holdingsCount}</li> : null}
            {result.why.weighting ? <li>{result.why.weighting}</li> : null}
            {result.why.diversification ? <li>{result.why.diversification}</li> : null}
          </ul>
        ) : null}
      </Card>
      {benchmark}
      <FinePrint result={result} />
    </div>
  );
}
