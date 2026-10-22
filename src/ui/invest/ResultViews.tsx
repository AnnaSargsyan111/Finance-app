"use client";

import type { ReactNode } from "react";
import type { Driver, Holding, PortfolioResult, RecommendationResult, SingleResult, StockPick } from "../api/types";
import { Card } from "../components/Display";
import { Note } from "../components/Feedback";
import { useT } from "../i18n";
import { formatAmd, formatDate, formatNumber, formatPercent, formatUsd } from "../lib/format";
import { driverLabel, driverShown, driverText, localizeExplanation, localizeServer, localizeWarning, type T } from "./labels";
import { MetricTip } from "./MetricTip";
import { driverInfoKey, driverNumber, type InfoCtx } from "./metric-info";
import s from "./invest.module.css";

/* ------------------------------------------------------------------ score */
export function ScoreCard({ result, action }: { result: RecommendationResult; action?: ReactNode }) {
  const t = useT();
  return (
    <Card>
      <div className={s.scoreCard}>
        <div>
          <span className={s.scoreLabel}>
            {result.scoreLabel ? localizeServer(t, result.scoreLabel) : t("invest.result.matchScore")}
            <MetricTip k="matchScore" ctx={{ score: result.score }} />
          </span>
          <div className={s.scoreRow}>
            <span style={{ fontSize: "clamp(48px, 8vw, 72px)", fontWeight: 300, letterSpacing: "-0.04em", lineHeight: 1 }} className="num" aria-label={t("invest.result.matchScoreAria", { score: result.score })}>
              {result.score}
            </span>
            <span className={s.scoreOf}>/ 100</span>
          </div>
          <div className={s.meter} aria-hidden="true">
            <div className={s.meterFill} style={{ width: `${Math.max(0, Math.min(100, result.score))}%` }} />
          </div>
        </div>
        <div>
          <p className={s.scoreNote}>{localizeServer(t, result.scoreNote)}</p>
          <p className={s.scoreNote} style={{ color: "var(--muted)", fontSize: 13 }}>
            {t("invest.result.fitNote")}
          </p>
          {action ? <div style={{ marginTop: 16 }}>{action}</div> : null}
        </div>
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------------ shared pieces */
function Drivers({ drivers, name, cost }: { drivers?: Driver[]; name: string; cost: number | null }) {
  const t = useT();
  if (!drivers?.length) return null;
  return (
    <ul className={s.drivers}>
      {drivers.map((d, i) => (
        <li key={`${d.label}-${i}`} className={s.driver}>
          <span>
            {driverLabel(t, d.label)}
            <MetricTip k={driverInfoKey(d.label)} ctx={{ name, value: driverNumber(d), top: d.topPercent, cost }} />
          </span>
          <span className={s.driverVal}>
            {driverShown(t, d)}
            {d.topPercent != null ? <small>{t("invest.result.topPercent", { n: d.topPercent })}</small> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Warnings({ result }: { result: RecommendationResult }) {
  const t = useT();
  if (!result.warnings?.length) return null;
  return (
    <div className={s.warnings}>
      {result.warnings.map((w, i) => (
        <Note key={`${w.code}-${i}`} tone="warn">
          {localizeWarning(t, w)}
        </Note>
      ))}
    </div>
  );
}

export function FinePrint({ result }: { result: RecommendationResult }) {
  const t = useT();
  return (
    <div className={s.finePrint}>
      <ul className={s.disc}>
        {result.disclaimers.map((d) => (
          <li key={d}>{localizeServer(t, d)}</li>
        ))}
      </ul>
      <p>
        {t("invest.result.pricesAsOf", { asOf: formatDate(result.dataAsOf), rate: formatNumber(result.usdRate, 2), source: result.rateSource ?? "CBA", rateDate: formatDate(result.rateDate), method: result.methodologyVersion })}
      </p>
    </div>
  );
}

function amounts(t: T, result: RecommendationResult) {
  const ctx = { inputAmd: result.inputs.amountAmd, allocatedAmd: result.allocatedAmountAmd, unallocatedAmd: result.unallocatedCashAmd };
  return (
    <>
      <div>
        <dt>
          {t("invest.result.allocated")}
          <MetricTip k="allocated" ctx={ctx} />
        </dt>
        <dd>
          {formatAmd(result.allocatedAmountAmd)}
          <small>{formatUsd(result.allocatedAmountUsd, 2)}</small>
        </dd>
      </div>
      <div>
        <dt>
          {t("invest.result.unallocatedCash")}
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
  const t = useT();
  const p = result.pick;
  const m = p.metrics;
  const tip = { name: p.name, price: Number(p.price), shares: p.shares, cost: Number(p.cost), allocatedAmd: result.allocatedAmountAmd, leftUsd: Number(result.unallocatedCashUsd), leftAmd: result.unallocatedCashAmd };
  return (
    <div className={s.section}>
      <div className={s.pickGrid}>
        <Card eyebrow={t("invest.result.bestMatch")} title={undefined}>
          <h3 className={s.company}>{p.name}</h3>
          <p className={s.ticker}>
            {p.symbol}
            {p.sector ? ` · ${p.sector}` : ""}
          </p>
          <dl className={s.stats}>
            <div>
              <dt>
                {t("invest.result.pricePerShare")}
                <MetricTip k="price" ctx={tip} />
              </dt>
              <dd>{formatUsd(p.price, 2)}</dd>
            </div>
            <div>
              <dt>
                {t("invest.result.sharesForAmount")}
                <MetricTip k="shares" ctx={tip} />
              </dt>
              <dd>{formatNumber(p.shares)}</dd>
            </div>
            <div>
              <dt>
                {t("invest.result.cost")}
                <MetricTip k="cost" ctx={tip} />
              </dt>
              <dd>
                {formatUsd(p.cost, 2)}
                <small>{formatAmd(result.allocatedAmountAmd)}</small>
              </dd>
            </div>
            <div>
              <dt>
                {t("invest.result.cashLeft")}
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
                  {t("invest.result.vol1y")}
                  <MetricTip k="vol1y" ctx={{ ...tip, value: m.vol1y }} />
                </dt>
                <dd>{formatPercent(m.vol1y * 100, 1)}</dd>
              </div>
            ) : null}
            {m?.maxDD1y != null ? (
              <div>
                <dt>
                  {t("invest.result.maxDD1y")}
                  <MetricTip k="maxDD" ctx={{ ...tip, value: m.maxDD1y }} />
                </dt>
                <dd>{formatPercent(m.maxDD1y * 100, 1)}</dd>
              </div>
            ) : null}
          </dl>
        </Card>
        <Card title={t("invest.result.whyTitle")} eyebrow={t("invest.result.whyEyebrow")}>
          <Drivers drivers={p.drivers} name={p.name} cost={Number.isFinite(Number(p.cost)) ? Number(p.cost) : null} />
          <p className="sr-only">{localizeExplanation(t, p.explanation, p.drivers)}</p>
        </Card>
      </div>
      <Warnings result={result} />
      {result.runnersUp && result.runnersUp.length > 0 ? (
        <Card title={t("invest.result.alsoTitle")} eyebrow={t("invest.result.alsoEyebrow")}>
          <div className={s.runners}>
            {result.runnersUp.map((r: StockPick) => (
              <div key={r.symbol} className={s.runner}>
                <span>
                  {r.name} <span style={{ color: "var(--muted)" }}>({r.symbol})</span>
                </span>
                <span>{r.composite != null ? t("invest.result.scoreN", { n: Math.round(r.composite) }) : ""}</span>
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
function reasonText(t: T, h: Holding): string {
  const top = (h.drivers ?? []).slice(0, 2).map((d) => driverText(t, d));
  return top.join(" · ") || t("invest.result.balanced");
}

function HoldingsTable({ result }: { result: PortfolioResult }) {
  const t = useT();
  const first = result.holdings[0];
  const tip = first ? { name: first.name, percent: first.allocationPercent, amountAmd: first.allocatedAmountAmd, shares: first.shares, price: Number(first.price), text: reasonText(t, first) } : {};
  return (
    <table className={s.hold}>
      <caption className="sr-only">{t("invest.result.tableCaption")}</caption>
      <thead>
        <tr>
          <th scope="col">{t("invest.result.colAsset")}</th>
          <th scope="col" className={s.r}>
            {t("invest.result.colAllocation")}
            <MetricTip k="allocation" ctx={tip} />
          </th>
          <th scope="col" className={s.r}>{t("invest.result.colAmountAmd")}</th>
          <th scope="col" className={s.r}>{t("invest.result.colAmountUsd")}</th>
          <th scope="col" className={s.r}>
            {t("invest.result.colShares")}
            <MetricTip k="sharesCol" ctx={tip} />
          </th>
          <th scope="col">
            {t("invest.result.colReasons")}
            <MetricTip k="reasons" ctx={tip} />
          </th>
        </tr>
      </thead>
      <tbody>
        {result.holdings.map((h) => (
          <tr key={h.symbol}>
            <td data-label={t("invest.result.colAsset")}>
              <div className={s.assetName}>{h.name}</div>
              <div className={s.assetSub}>
                {h.symbol}
                {h.sector ? ` · ${h.sector}` : ""} · {t("invest.result.perShare", { price: formatUsd(h.price, 2) })}
              </div>
            </td>
            <td data-label={t("invest.result.colAllocation")} className={s.r}>
              {formatPercent(h.allocationPercent, 1)}
              {h.targetWeight != null ? <div className={s.assetSub}>{t("invest.result.target", { pct: formatPercent(h.targetWeight * 100, 1) })}</div> : null}
              <div className={s.pctBar} aria-hidden="true">
                <div className={s.pctBarFill} style={{ width: `${Math.min(100, h.allocationPercent)}%` }} />
              </div>
            </td>
            <td data-label={t("invest.result.colAmountAmd")} className={s.r}>{formatAmd(h.allocatedAmountAmd, { suffix: false })}</td>
            <td data-label={t("invest.result.colAmountUsd")} className={s.r}>{formatUsd(h.allocatedAmountUsd, 2)}</td>
            <td data-label={t("invest.result.colShares")} className={s.r}>{formatNumber(h.shares)}</td>
            <td data-label={t("invest.result.colReasons")} className={`${s.reasonCell}`}>
              <span className={s.reasons}>{reasonText(t, h)}</span>
            </td>
          </tr>
        ))}
        <tr className={s.holdTotal}>
          <td data-label={t("invest.result.colAsset")}>
            <div className={s.assetName}>{t("invest.result.unallocatedCash")}</div>
            <div className={s.assetSub}>{t("invest.result.unallocatedHelp")}</div>
          </td>
          <td data-label={t("invest.result.colAllocation")} className={s.r}>-</td>
          <td data-label={t("invest.result.colAmountAmd")} className={s.r}>{formatAmd(result.unallocatedCashAmd, { suffix: false })}</td>
          <td data-label={t("invest.result.colAmountUsd")} className={s.r}>{formatUsd(result.unallocatedCashUsd, 2)}</td>
          <td data-label={t("invest.result.colShares")} className={s.r}>-</td>
          <td data-label={t("invest.result.colReasons")} className={s.reasonCell} />
        </tr>
      </tbody>
    </table>
  );
}

export function PortfolioView({ result, benchmark }: { result: PortfolioResult; benchmark: ReactNode }) {
  const t = useT();
  const m = result.metrics ?? {};
  const count = m.holdingsCount != null ? m.holdingsCount : result.holdings.length;
  const allocatedAmd = result.allocatedAmountAmd;
  const metricItems: { label: string; value: string; key: string; ctx: InfoCtx }[] = [
    { label: t("invest.result.holdings"), value: String(count), key: "holdingsCount", ctx: { value: count } },
    { label: t("invest.result.weightedBeta"), value: m.weightedBeta != null ? formatNumber(m.weightedBeta, 2) : "-", key: "weightedBeta", ctx: { value: m.weightedBeta } },
    { label: t("invest.result.estimatedVolatility"), value: m.estimatedVolatility != null ? formatPercent(m.estimatedVolatility * 100, 1) : "-", key: "estimatedVolatility", ctx: { value: m.estimatedVolatility, band: m.volatilityBand, allocatedAmd } },
    { label: t("invest.result.dividendYield"), value: m.weightedDividendYield != null ? formatPercent(m.weightedDividendYield * 100, 2) : "-", key: "portfolioDividendYield", ctx: { value: m.weightedDividendYield, allocatedAmd } },
    { label: t("invest.result.effectiveHoldings"), value: m.effectiveN != null ? formatNumber(m.effectiveN, 1) : "-", key: "effectiveN", ctx: { value: m.effectiveN, count } },
  ];
  return (
    <div className={s.section}>
      <Card title={t("invest.result.portfolioTitle")} eyebrow={t("invest.result.portfolioEyebrow")}>
        <HoldingsTable result={result} />
        <dl className={s.stats} style={{ marginTop: 20 }}>
          {amounts(t, result)}
        </dl>
      </Card>
      <Warnings result={result} />
      <Card title={t("invest.result.characteristics")} eyebrow={t("invest.result.glance")}>
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
            {t("invest.result.sectors", { list: m.sectorSplit.map((x) => `${localizeServer(t, x.sector)} ${formatPercent(x.weight * 100, 0)}`).join(", ") })}
          </p>
        ) : null}
        {result.why ? (
          <ul className={s.whyList}>
            {result.why.holdingsCount ? <li>{localizeServer(t, result.why.holdingsCount)}</li> : null}
            {result.why.weighting ? <li>{localizeServer(t, result.why.weighting)}</li> : null}
            {result.why.diversification ? <li>{localizeServer(t, result.why.diversification)}</li> : null}
          </ul>
        ) : null}
      </Card>
      {benchmark}
      <FinePrint result={result} />
    </div>
  );
}
