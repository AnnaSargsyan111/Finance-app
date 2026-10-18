"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ReferenceLine, ResponsiveContainer, XAxis } from "recharts";
import { AXIS_COLOR, CHART_COLORS, ChartFigure, ChartPlaceholder, DataTable, NEG_COLOR } from "../components/ChartParts";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { useT } from "../i18n";
import { formatAmd, formatNumber, formatPercent } from "../lib/format";
import { categoryLabel, type Preview } from "./calc";
import s from "./pf.module.css";

const amd = (cents: number) => cents / 100;

/* ------------------------------------------------------------------ Expense Breakdown (pie / donut) */
export function ExpenseBreakdownChart({ preview }: { preview: Preview }) {
  const reduced = useReducedMotion();
  const t = useT();
  const items = preview.breakdown.map((i) => ({ ...i, label: categoryLabel(i.key, i.key === null, i.label) }));
  if (items.length === 0) {
    return <ChartPlaceholder kind="pie" title={t("pf.charts.pie.emptyTitle")} message={t("pf.charts.pie.emptyMessage")} />;
  }
  const total = preview.expensesCents;
  const summary = t("pf.charts.pie.summary", { items: items.map((i) => t("pf.charts.pie.summaryItem", { label: i.label, percent: i.percent })).join(", "), total: formatAmd(amd(total)) });
  return (
    <ChartFigure
      summary={summary}
      tableLabel={t("pf.charts.viewTable")}
      table={
        <DataTable
          caption={t("pf.charts.pie.tableCaption")}
          columns={[
            { key: "cat", label: t("pf.charts.pie.colCategory") },
            { key: "share", label: t("pf.charts.pie.colShare"), numeric: true },
            { key: "amount", label: t("pf.charts.pie.colAmount"), numeric: true },
          ]}
          rows={items.map((i) => ({ cat: i.label, share: `${i.percent}%`, amount: formatNumber(amd(i.cents), i.cents % 100 ? 2 : 0) }))}
        />
      }
    >
      <div className={s.pieWrap}>
        <div className={s.pieBox}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={items.map((i) => ({ name: i.label, value: i.cents }))} dataKey="value" nameKey="name" innerRadius="62%" outerRadius="96%" paddingAngle={items.length > 1 ? 2 : 0} stroke="none" isAnimationActive={!reduced} startAngle={90} endAngle={-270}>
                {items.map((_, i) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className={s.pieCenter} aria-hidden="true">
            <span className={s.pieCenterLabel}>{t("pf.charts.pie.center")}</span>
            <span className={s.pieCenterValue}>{formatNumber(amd(total), total % 100 ? 2 : 0)}</span>
          </div>
        </div>
        <ul className={s.legend} aria-label={t("pf.charts.pie.legend")}>
          {items.map((i, k) => (
            <li key={`${i.label}-${k}`} className={s.legendItem}>
              <span className={s.swatch} style={{ background: CHART_COLORS[k % CHART_COLORS.length] }} aria-hidden="true" />
              <span className={s.legendLabel}>{i.label}</span>
              <span className={s.legendPct}>{formatPercent(i.percent, 0)}</span>
              <span className={s.legendAmt}>{formatAmd(amd(i.cents), { suffix: false })}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFigure>
  );
}

/* ------------------------------------------------------------------ Cash Flow (bars) */
export function CashFlowChart({ preview }: { preview: Preview }) {
  const reduced = useReducedMotion();
  const t = useT();
  if (preview.isEmpty) {
    return <ChartPlaceholder kind="bar" title={t("pf.charts.bar.emptyTitle")} message={t("pf.charts.bar.emptyMessage")} />;
  }
  const data = [
    { id: "income", name: t("pf.charts.bar.income"), short: t("pf.charts.bar.income"), value: amd(preview.incomeCents), color: CHART_COLORS[1], entered: preview.incomeEntered },
    { id: "expenses", name: t("pf.charts.bar.expenses"), short: t("pf.charts.bar.expenses"), value: amd(preview.expensesCents), color: CHART_COLORS[5], entered: true },
    { id: "available", name: t("pf.charts.bar.available"), short: t("pf.charts.bar.availableShort"), value: amd(preview.availableCents), color: preview.availableCents < 0 ? NEG_COLOR : CHART_COLORS[0], entered: true },
  ];
  const summary = preview.incomeEntered
    ? t("pf.charts.bar.summary", { income: formatAmd(data[0].value), expenses: formatAmd(data[1].value), available: formatAmd(data[2].value) })
    : t("pf.charts.bar.summaryNoIncome", { expenses: formatAmd(data[1].value), available: formatAmd(data[2].value) });
  const short = (n: string) => data.find((d) => d.name === n)?.short ?? n;
  return (
    <ChartFigure
      summary={summary}
      tableLabel={t("pf.charts.viewTable")}
      caption={preview.incomeMissing ? t("pf.charts.bar.caption") : undefined}
      table={
        <DataTable
          caption={t("pf.charts.bar.tableCaption")}
          columns={[
            { key: "k", label: t("pf.charts.bar.colMeasure") },
            { key: "v", label: t("pf.charts.bar.colAmount"), numeric: true },
          ]}
          rows={data.map((d) => ({ k: d.name, v: d.id === "income" && !d.entered ? t("pf.charts.bar.notEntered") : formatAmd(d.value, { suffix: false }) }))}
        />
      }
    >
      <div className={s.barBox}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 28, right: 8, bottom: 8, left: 8 }} barCategoryGap="22%">
            <XAxis dataKey="name" tickFormatter={short} tickLine={false} axisLine={false} tick={{ fill: AXIS_COLOR, fontSize: 12 }} interval={0} />
            <ReferenceLine y={0} stroke="#4F5753" />
            <Bar dataKey="value" radius={[8, 8, 8, 8]} isAnimationActive={!reduced} maxBarSize={120}>
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} fillOpacity={d.id === "income" && !d.entered ? 0.35 : 1} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                content={(p) => {
                  const { x, y, width, height, value } = p as unknown as { x: number; y: number; width: number; height: number; value: number };
                  const neg = value < 0;
                  const cy = neg ? y + Math.abs(height) + 16 : y - 8;
                  const cx = x + width / 2;
                  return (
                    <text x={cx} y={cy} textAnchor="middle" fill="#ECEDED" fontSize={13} fontWeight={500}>
                      {formatNumber(value, value % 1 ? 2 : 0)}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartFigure>
  );
}
