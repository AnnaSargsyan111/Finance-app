"use client";

import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ReferenceLine, ResponsiveContainer, XAxis } from "recharts";
import { AXIS_COLOR, CHART_COLORS, ChartFigure, ChartPlaceholder, DataTable, NEG_COLOR } from "../components/ChartParts";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { formatAmd, formatNumber, formatPercent } from "../lib/format";
import type { Preview } from "./calc";
import s from "./pf.module.css";

const amd = (cents: number) => cents / 100;

/* ------------------------------------------------------------------ Expense Breakdown (pie / donut) */
export function ExpenseBreakdownChart({ preview }: { preview: Preview }) {
  const reduced = useReducedMotion();
  const items = preview.breakdown;
  if (items.length === 0) {
    return <ChartPlaceholder kind="pie" title="No expenses entered yet" message="Enter an amount in at least one expense category to see how your spending splits up." />;
  }
  const total = preview.expensesCents;
  const summary = `Expense breakdown. ${items.map((i) => `${i.label} ${i.percent}%`).join(", ")}. Total expenses ${formatAmd(amd(total))}.`;
  return (
    <ChartFigure
      summary={summary}
      table={
        <DataTable
          caption="Expense breakdown by category"
          columns={[
            { key: "cat", label: "Category" },
            { key: "share", label: "Share", numeric: true },
            { key: "amount", label: "Amount (AMD)", numeric: true },
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
            <span className={s.pieCenterLabel}>Expenses</span>
            <span className={s.pieCenterValue}>{formatNumber(amd(total), total % 100 ? 2 : 0)}</span>
          </div>
        </div>
        <ul className={s.legend} aria-label="Expense categories">
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
  if (preview.isEmpty) {
    return <ChartPlaceholder kind="bar" title="No income or expenses entered yet" message="Enter your income and expenses for this period to compare them here." />;
  }
  const data = [
    { name: "Income", value: amd(preview.incomeCents), color: CHART_COLORS[1], entered: preview.incomeEntered },
    { name: "Expenses", value: amd(preview.expensesCents), color: CHART_COLORS[5], entered: true },
    { name: "Available / Difference", value: amd(preview.availableCents), color: preview.availableCents < 0 ? NEG_COLOR : CHART_COLORS[0], entered: true },
  ];
  const summary = `Cash flow. Income ${preview.incomeEntered ? formatAmd(data[0].value) : "not entered"}. Expenses ${formatAmd(data[1].value)}. Available / Difference ${formatAmd(data[2].value)}.`;
  const short = (n: string) => (n === "Available / Difference" ? "Available" : n);
  return (
    <ChartFigure
      summary={summary}
      caption={preview.incomeMissing ? "Income has not been entered, so it counts as 0 in this comparison." : undefined}
      table={
        <DataTable
          caption="Cash flow"
          columns={[
            { key: "k", label: "Measure" },
            { key: "v", label: "Amount (AMD)", numeric: true },
          ]}
          rows={data.map((d) => ({ k: d.name, v: d.name === "Income" && !d.entered ? "Not entered" : formatAmd(d.value, { suffix: false }) }))}
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
                <Cell key={i} fill={d.color} fillOpacity={d.name === "Income" && !d.entered ? 0.35 : 1} />
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
