"use client";

import { forwardRef, useId, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { cx } from "../lib/cx";
import { cleanAmountInput, groupDigits } from "../lib/format";
import { IconAlert, IconEye, IconEyeOff } from "./Icons";
import s from "./ui.module.css";

interface FieldShellProps {
  label: string;
  error?: string | null;
  hint?: ReactNode;
  hideLabel?: boolean;
}

interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id">, FieldShellProps {
  id?: string;
  adornment?: ReactNode;
  trailing?: ReactNode;
}

/** Label is bound to the input; the error is announced (role=alert) and linked with aria-describedby. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField({ label, error, hint, hideLabel, adornment, trailing, id, className, ...rest }, ref) {
  const gen = useId();
  const inputId = id ?? gen;
  const errId = `${inputId}-err`;
  const hintId = `${inputId}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  return (
    <div className={cx(s.field, className)}>
      <label htmlFor={inputId} className={hideLabel ? "sr-only" : s.label}>
        {label}
      </label>
      <div className={cx(s.control, error && s.controlInvalid)}>
        <input ref={ref} id={inputId} className={s.input} aria-invalid={error ? true : undefined} aria-describedby={describedBy} {...rest} />
        {adornment ? <span className={s.adorn}>{adornment}</span> : null}
        {trailing}
      </div>
      {hint ? (
        <span id={hintId} className={s.hint}>
          {hint}
        </span>
      ) : null}
      {error ? (
        <span id={errId} className={s.error} role="alert">
          <IconAlert size={14} style={{ marginTop: 2, flex: "none" }} />
          <span>{error}</span>
        </span>
      ) : null}
    </div>
  );
});

/** Password input with a Show / Hide toggle. */
export const PasswordField = forwardRef<HTMLInputElement, Omit<TextFieldProps, "type" | "trailing">>(function PasswordField(props, ref) {
  const [shown, setShown] = useState(false);
  return (
    <TextField
      ref={ref}
      {...props}
      type={shown ? "text" : "password"}
      trailing={
        <button type="button" className={s.adornBtn} onClick={() => setShown((v) => !v)} aria-pressed={shown} aria-label={shown ? "Hide password" : "Show password"}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            {shown ? <IconEyeOff size={16} /> : <IconEye size={16} />}
            {shown ? "Hide" : "Show"}
          </span>
        </button>
      }
    />
  );
});

interface AmountFieldProps extends FieldShellProps {
  value: string;
  onChange: (raw: string) => void;
  /** currency / unit shown after the number */
  unit?: string;
  placeholder?: string;
  id?: string;
  name?: string;
  maxDecimals?: number;
  autoFocus?: boolean;
  onBlur?: () => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Money input. While focused it shows the raw digits; when not focused it shows thousands separators.
 * Pasting "850,000 AMD" or " 1 200.5 " is cleaned. The parent keeps the raw string ("850000").
 */
export function AmountField({ label, error, hint, hideLabel, value, onChange, unit, placeholder, id, name, maxDecimals = 2, autoFocus, onBlur, disabled, className }: AmountFieldProps) {
  const gen = useId();
  const inputId = id ?? gen;
  const [focused, setFocused] = useState(false);
  const shown = focused || !value ? value : formatRaw(value);
  return (
    <TextField
      id={inputId}
      name={name}
      className={className}
      label={label}
      hideLabel={hideLabel}
      error={error}
      hint={hint}
      inputMode="decimal"
      autoComplete="off"
      autoFocus={autoFocus}
      disabled={disabled}
      placeholder={placeholder}
      value={shown}
      adornment={unit}
      onFocus={() => setFocused(true)}
      onBlur={() => {
        setFocused(false);
        onBlur?.();
      }}
      onChange={(e) => {
        let cleaned = cleanAmountInput(e.target.value);
        if (maxDecimals >= 0) {
          const dot = cleaned.indexOf(".");
          if (maxDecimals === 0 && dot >= 0) cleaned = cleaned.slice(0, dot);
          else if (dot >= 0 && cleaned.length - dot - 1 > maxDecimals) cleaned = cleaned.slice(0, dot + 1 + maxDecimals);
        }
        onChange(cleaned);
      }}
    />
  );
}

export function formatRaw(raw: string): string {
  if (!raw) return "";
  const [i, f] = raw.split(".");
  return `${groupDigits(i || "0")}${f !== undefined ? `.${f}` : ""}`;
}

export function Checkbox({ label, checked, onChange, error, id, describedBy }: { label: ReactNode; checked: boolean; onChange: (v: boolean) => void; error?: string | null; id?: string; describedBy?: string }) {
  const gen = useId();
  const inputId = id ?? gen;
  const errId = `${inputId}-err`;
  return (
    <div className={s.field}>
      <label htmlFor={inputId} style={{ display: "flex", gap: 12, alignItems: "flex-start", cursor: "pointer", color: "var(--text)" }}>
        <input
          id={inputId}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={[error ? errId : null, describedBy].filter(Boolean).join(" ") || undefined}
          style={{ width: 20, height: 20, marginTop: 1, accentColor: "var(--accent)", flex: "none" }}
        />
        <span>{label}</span>
      </label>
      {error ? (
        <span id={errId} className={s.error} role="alert">
          <IconAlert size={14} style={{ marginTop: 2, flex: "none" }} />
          <span>{error}</span>
        </span>
      ) : null}
    </div>
  );
}
