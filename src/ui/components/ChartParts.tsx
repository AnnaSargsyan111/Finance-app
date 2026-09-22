"use client";

import { useId, type ReactNode } from "react";
import { IconChart } from "./Icons";
import s from "./chart.module.css";
import ui from "./ui.module.css";

/** Fill colours for chart shapes (never used for small text). Mirrors --chart-* tokens. */
export const CHART_COLORS = ["#91F60D", "#5B93C4", "#C0C2C3", "#2F587E", "#B9EA72", "#7F8A85", "#3F8F6A", "#9CC1E2"] as const;
export const NEG_COLOR = "#FF7B6E";
export const AXIS_COLOR = "#8F9394";
export const GRID_COLOR = "rgba(79,87,83,0.35)";

/**
 * Accessible chart wrapper: the drawing is exposed as one image with a text summary, and the same numbers are
 * available as a compact table (so meaning never depends on colour or on seeing the chart).
 */
export function ChartFigure({ summary, children, table, tableLabel = "View data as a table", caption }: { summary: string; children: ReactNode; table?: ReactNode; tableLabel?: string; caption?: ReactNode }) {
  const id = useId();
  return (
    <figure className={s.figure}>
      <div role="img" aria-label={summary} aria-describedby={caption ? id : undefined} className={s.plot}>
        {children}
      </div>
      {caption ? (
        <figcaption id={id} className={s.caption}>
          {caption}
        </figcaption>
      ) : null}
      {table ? (
        <details className={s.details}>
          <summary>{tableLabel}</summary>
          <div className={ui.tableWrap}>{table}</div>
        </details>
      ) : null}
    </figure>
  );
}

export function DataTable({ columns, rows, caption }: { columns: { key: string; label: string; numeric?: boolean }[]; rows: Record<string, ReactNode>[]; caption: string }) {
  return (
    <table className={ui.table}>
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} scope="col" className={c.numeric ? ui.num : undefined}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {columns.map((c) => (
              <td key={c.key} className={c.numeric ? ui.num : undefined}>
                {r[c.key]}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Empty / "waiting for data" state of a chart: a dashed ghost of the chart plus a sentence saying what to enter.
 * Never draws zero-value data.
 */
export function ChartPlaceholder({ kind, title, message }: { kind: "pie" | "bar" | "line"; title: string; message: string }) {
  return (
    <div className={s.placeholder} role="group" aria-label={`${title}. ${message}`}>
      <svg className={s.ghost} viewBox="0 0 240 140" fill="none" aria-hidden="true" focusable="false">
        {kind === "pie" ? (
          <>
            <circle cx="120" cy="70" r="52" stroke="currentColor" strokeWidth="14" strokeDasharray="6 8" />
            <circle cx="120" cy="70" r="26" stroke="currentColor" strokeWidth="1" strokeDasharray="3 5" />
          </>
        ) : kind === "bar" ? (
          <>
            <rect x="34" y="40" width="46" height="90" rx="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 6" />
            <rect x="97" y="70" width="46" height="60" rx="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 6" />
            <rect x="160" y="55" width="46" height="75" rx="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="5 6" />
            <path d="M20 131h200" stroke="currentColor" strokeWidth="1" />
          </>
        ) : (
          <>
            <path d="M14 108 C50 96 64 66 96 74 S150 112 178 62 214 30 228 24" stroke="currentColor" strokeWidth="1.6" strokeDasharray="5 6" strokeLinecap="round" />
            <path d="M14 131h212" stroke="currentColor" strokeWidth="1" />
          </>
        )}
      </svg>
      <div className={s.placeholderText}>
        <span className={s.placeholderIcon}>
          <IconChart size={16} />
        </span>
        <p className={s.placeholderTitle}>{title}</p>
        <p className={s.placeholderMsg}>{message}</p>
      </div>
    </div>
  );
}
