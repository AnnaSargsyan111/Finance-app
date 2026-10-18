"use client";

import { useEffect, useId, useState } from "react";
import type { PeriodListItem } from "../api/types";
import { Button } from "../components/Button";
import { Segmented } from "../components/Display";
import { IconChevronLeft, IconChevronRight } from "../components/Icons";
import { useT } from "../i18n";
import { currentMonthYerevan, formatDate, formatMonth } from "../lib/format";
import { customRangeError, selectionFromPeriod, shiftMonth, type Selection } from "./calc";
import s from "./pf.module.css";
import { rich } from "./rich";

const MONTH_KEYS = ["m01", "m02", "m03", "m04", "m05", "m06", "m07", "m08", "m09", "m10", "m11", "m12"] as const;

function periodLabel(p: { kind: string; start: string; end: string }): string {
  return p.kind === "month" ? formatMonth(p.start) : `${formatDate(p.start)} - ${formatDate(p.end)}`;
}

export function PeriodSelector({ selection, onSelect, saved }: { selection: Selection; onSelect: (s: Selection) => void; saved: PeriodListItem[] }) {
  const id = useId();
  const t = useT();
  const [mode, setMode] = useState<"month" | "custom">(selection.kind);
  const [start, setStart] = useState(selection.kind === "custom" ? selection.start : "");
  const [end, setEnd] = useState(selection.kind === "custom" ? selection.end : "");
  // the range the user last asked for; its error is worked out while rendering, so it follows the chosen language
  const [applied, setApplied] = useState<{ start: string; end: string } | null>(null);
  const rangeError = applied ? customRangeError(applied.start, applied.end) : null;

  // keep the controls in step when the selection changes from elsewhere (saved-periods list, whole-month normalisation)
  useEffect(() => {
    setMode(selection.kind);
    if (selection.kind === "custom") {
      setStart(selection.start);
      setEnd(selection.end);
    }
    setApplied(null);
  }, [selection]);

  const thisMonth = currentMonthYerevan();
  const month = selection.kind === "month" ? selection.month : thisMonth;
  const [yy, mm] = month.split("-").map(Number);
  const thisYear = Number(thisMonth.slice(0, 4));
  const years = Array.from({ length: 9 }, (_, i) => thisYear - 6 + i);
  if (!years.includes(yy)) years.push(yy);
  years.sort((a, b) => a - b);

  const pickMonth = (m: string) => onSelect({ kind: "month", month: m });

  function chooseMode(m: "month" | "custom") {
    setMode(m);
    setApplied(null);
    if (m === "month" && selection.kind !== "month") pickMonth(thisMonth);
  }

  function applyCustom() {
    setApplied({ start, end });
    if (!customRangeError(start, end)) onSelect({ kind: "custom", start, end });
  }

  const key = selection.kind === "month" ? `month:${selection.month}` : `custom:${selection.start}:${selection.end}`;
  const options = saved.map((p) => ({ p, sel: selectionFromPeriod(p) }));
  const currentSavedKey = options.find((o) => (o.sel.kind === "month" ? `month:${o.sel.month}` : `custom:${o.sel.start}:${o.sel.end}`) === key);

  return (
    <div className={s.selector} role="group" aria-label={t("pf.period.group")}>
      <div className={s.selectorTop}>
        <Segmented
          label={t("pf.period.type")}
          value={mode}
          onChange={chooseMode}
          options={[
            { value: "month", label: t("pf.period.monthly") },
            { value: "custom", label: t("pf.period.custom") },
          ]}
        />
        {saved.length > 0 ? (
          <div className={s.savedPick}>
            <label htmlFor={`${id}-saved`} className={s.miniLabel}>
              {t("pf.period.savedPeriods")}
            </label>
            <select
              id={`${id}-saved`}
              className={s.select}
              value={currentSavedKey ? key : ""}
              onChange={(e) => {
                const o = options.find((x) => (x.sel.kind === "month" ? `month:${x.sel.month}` : `custom:${x.sel.start}:${x.sel.end}`) === e.target.value);
                if (o) onSelect(o.sel);
              }}
            >
              <option value="" disabled>
                {t("pf.period.jump")}
              </option>
              {options.map(({ p, sel }) => (
                <option key={`${p.kind}-${p.start}-${p.end}`} value={sel.kind === "month" ? `month:${sel.month}` : `custom:${sel.start}:${sel.end}`}>
                  {p.hasData ? periodLabel(p) : t("pf.period.emptyOption", { period: periodLabel(p) })}
                </option>
              ))}
            </select>
          </div>
        ) : null}
      </div>

      {mode === "month" ? (
        <div className={s.monthRow}>
          <Button variant="secondary" icon aria-label={t("pf.period.prevMonth")} onClick={() => pickMonth(shiftMonth(month, -1))}>
            <IconChevronLeft />
          </Button>
          <div className={s.monthSelects}>
            <label htmlFor={`${id}-m`} className="sr-only">
              {t("pf.period.month")}
            </label>
            <select id={`${id}-m`} className={s.select} value={mm} onChange={(e) => pickMonth(`${yy}-${String(e.target.value).padStart(2, "0")}`)}>
              {MONTH_KEYS.map((k, i) => (
                <option key={k} value={i + 1}>
                  {t(`common.monthLong.${k}`)}
                </option>
              ))}
            </select>
            <label htmlFor={`${id}-y`} className="sr-only">
              {t("pf.period.year")}
            </label>
            <select id={`${id}-y`} className={s.select} value={yy} onChange={(e) => pickMonth(`${e.target.value}-${String(mm).padStart(2, "0")}`)}>
              {years.map((y) => (
                <option key={y} value={y}>
                  {y}
                </option>
              ))}
            </select>
          </div>
          <Button variant="secondary" icon aria-label={t("pf.period.nextMonth")} onClick={() => pickMonth(shiftMonth(month, 1))}>
            <IconChevronRight />
          </Button>
          {month !== thisMonth ? (
            <Button variant="ghost" size="sm" onClick={() => pickMonth(thisMonth)}>
              {t("pf.period.thisMonth")}
            </Button>
          ) : null}
        </div>
      ) : (
        <div className={s.customDates}>
          <div className={s.dateField}>
            <label htmlFor={`${id}-s`} className={s.miniLabel}>
              {t("pf.period.startDate")}
            </label>
            <input id={`${id}-s`} type="date" className={s.select} value={start} max={end || undefined} onChange={(e) => setStart(e.target.value)} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${id}-err` : undefined} />
          </div>
          <div className={s.dateField}>
            <label htmlFor={`${id}-e`} className={s.miniLabel}>
              {t("pf.period.endDate")}
            </label>
            <input id={`${id}-e`} type="date" className={s.select} value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} aria-invalid={rangeError ? true : undefined} aria-describedby={rangeError ? `${id}-err` : undefined} />
          </div>
          <Button variant="primary" onClick={applyCustom} className={s.applyBtn}>
            {t("pf.period.show")}
          </Button>
        </div>
      )}
      {rangeError ? (
        <p id={`${id}-err`} role="alert" className={s.rangeError}>
          {rangeError}
        </p>
      ) : null}
      <p className={s.selectorCaption}>{rich(t, "pf.period.caption", { period: <strong>{selection.kind === "month" ? formatMonth(selection.month) : `${formatDate(selection.start)} - ${formatDate(selection.end)}`}</strong> })}</p>
    </div>
  );
}
