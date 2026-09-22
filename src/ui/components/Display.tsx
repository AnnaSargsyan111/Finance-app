"use client";

import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { figureParts, formatNumber, formatPercent, formatSigned } from "../lib/format";
import { Button } from "./Button";
import { IconArrowDown, IconArrowUp, IconMinus } from "./Icons";
import s from "./ui.module.css";

/* ------------------------------------------------------------------ Card */
export function Card({ title, eyebrow, actions, children, className, as: Tag = "section", ...rest }: { title?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode; children?: ReactNode; className?: string; as?: "section" | "div" | "article"; "aria-label"?: string; "aria-labelledby"?: string; id?: string }) {
  const id = useId();
  const hasHead = title || eyebrow || actions;
  return (
    <Tag className={cx(s.card, className)} aria-labelledby={title && !rest["aria-label"] && !rest["aria-labelledby"] ? id : undefined} {...rest}>
      {hasHead ? (
        <header className={s.cardHead}>
          <div style={{ minWidth: 0 }}>
            {eyebrow ? <span className={s.eyebrow}>{eyebrow}</span> : null}
            {title ? (
              <h2 id={id} className={s.cardTitle}>
                {title}
              </h2>
            ) : null}
          </div>
          {actions ? <div className={s.cardActions}>{actions}</div> : null}
        </header>
      ) : null}
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------------ Figure (large light number, muted decimals) */
export function Figure({ value, decimals = 2, prefix, unit, size = "md", negTone, muted }: { value: string | number | null | undefined; decimals?: number; prefix?: string; unit?: string; size?: "sm" | "md" | "lg"; negTone?: boolean; muted?: boolean }) {
  const parts = figureParts(value, decimals);
  const sizeCls = size === "lg" ? s.figureLg : size === "sm" ? s.figureSm : s.figureMd;
  if (!parts) return <span className={cx(s.figure, sizeCls, s.figureFrac)}>-</span>;
  const neg = parts.neg;
  return (
    <span className={cx(s.figure, sizeCls, neg && negTone && s.figureNeg, muted && s.figureFrac)}>
      {neg ? "-" : ""}
      {prefix}
      {parts.int}
      {parts.frac ? <span className={s.figureFrac}>.{parts.frac}</span> : null}
      {unit ? <span className={s.figureUnit}>{unit}</span> : null}
    </span>
  );
}

/* ------------------------------------------------------------------ Chip */
export function Chip({ tone = "neutral", children, title }: { tone?: "neutral" | "pos" | "neg" | "warn"; children: ReactNode; title?: string }) {
  return (
    <span className={cx(s.chip, tone === "pos" && s.chipPos, tone === "neg" && s.chipNeg, tone === "warn" && s.chipWarn)} title={title}>
      {children}
    </span>
  );
}

/** Up / down / flat change chip: colour + arrow + explicit sign + word for screen readers. */
export function ChangeChip({ change, pct, decimals = 2, unit = "" }: { change?: string | number | null; pct?: number | null; decimals?: number; unit?: string }) {
  const n = change === null || change === undefined || change === "" ? (pct ?? null) : Number(change);
  if (n === null || Number.isNaN(n)) return <Chip>No change data</Chip>;
  const tone = n > 0 ? "pos" : n < 0 ? "neg" : "neutral";
  const word = n > 0 ? "up" : n < 0 ? "down" : "unchanged";
  return (
    <Chip tone={tone}>
      <span className="sr-only">{word} </span>
      {n > 0 ? <IconArrowUp size={12} /> : n < 0 ? <IconArrowDown size={12} /> : <IconMinus size={12} />}
      <span className="num">
        {change !== null && change !== undefined && change !== "" ? formatSigned(change, decimals) + unit : ""}
        {pct !== null && pct !== undefined ? `${change !== null && change !== undefined && change !== "" ? " (" : ""}${formatPercent(pct, 2, { sign: true })}${change !== null && change !== undefined && change !== "" ? ")" : ""}` : ""}
      </span>
    </Chip>
  );
}

/* ------------------------------------------------------------------ Segmented (single-select chips) */
export function Segmented<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: readonly { value: T; label: ReactNode; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(options[next].value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className={cx(s.segmented, className)} role="radiogroup" aria-label={label}>
      {options.map((o, i) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active ? 0 : -1}
            title={o.title}
            className={cx(s.seg, active && s.segActive)}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Tabs */
export function Tabs<T extends string>({ label, value, tabs, onChange, idPrefix }: { label: string; value: T; tabs: readonly { value: T; label: ReactNode }[]; onChange: (v: T) => void; idPrefix: string }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    let next = -1;
    if (e.key === "ArrowRight") next = (i + 1) % tabs.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next >= 0) {
      e.preventDefault();
      onChange(tabs[next].value);
      refs.current[next]?.focus();
    }
  };
  return (
    <div className={s.tabs} role="tablist" aria-label={label}>
      {tabs.map((t, i) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-tab-${t.value}`}
            role="tab"
            type="button"
            aria-selected={active}
            aria-controls={`${idPrefix}-panel-${t.value}`}
            tabIndex={active ? 0 : -1}
            className={cx(s.tab, active && s.tabActive)}
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => onKey(e, i)}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

export function TabPanel({ idPrefix, value, children }: { idPrefix: string; value: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${value}`} aria-labelledby={`${idPrefix}-tab-${value}`} tabIndex={0} style={{ outline: "none" }}>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ Progress */
export function ProgressBar({ value, label, valueText }: { value: number; label: string; valueText?: string }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div className={s.progress} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={v} aria-valuetext={valueText}>
      <div className={s.progressBar} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ------------------------------------------------------------------ Confirm dialog (native <dialog>) */
export function ConfirmDialog({
  open,
  title,
  children,
  actions,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** rendered in the footer; each button decides what happens */
  actions: ReactNode;
  /** Escape / backdrop */
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      {open ? (
        <>
          <h2 id={titleId} className={s.dialogTitle}>
            {title}
          </h2>
          <div className={s.dialogBody}>{children}</div>
          <div className={s.dialogActions}>{actions}</div>
        </>
      ) : null}
    </dialog>
  );
}

/* ------------------------------------------------------------------ small helpers */
export function PlainNumber({ value, decimals = 0 }: { value: string | number | null | undefined; decimals?: number }) {
  return <span className="num">{formatNumber(value, decimals)}</span>;
}

export { Button };
