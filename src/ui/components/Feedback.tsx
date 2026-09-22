import type { CSSProperties, ReactNode } from "react";
import { cx } from "../lib/cx";
import { IconAlert, IconInfo } from "./Icons";
import s from "./ui.module.css";

/** Small inline spinner (announced politely when it carries a label). */
export function Spinner({ large, label }: { large?: boolean; label?: string }) {
  return (
    <span className={cx(s.spinner, large && s.spinnerLg)} role={label ? "status" : undefined} aria-label={label} aria-hidden={label ? undefined : true} />
  );
}

/** Loading placeholder block. Decorative: pair with an aria-busy container. */
export function Skeleton({ width, height = 16, radius, style, className }: { width?: number | string; height?: number | string; radius?: number | string; style?: CSSProperties; className?: string }) {
  return <span className={cx(s.skeleton, className)} aria-hidden="true" style={{ width: width ?? "100%", height, borderRadius: radius, ...style }} />;
}

export function SkeletonLines({ lines = 3, gap = 10 }: { lines?: number; gap?: number }) {
  return (
    <span style={{ display: "flex", flexDirection: "column", gap }} aria-hidden="true">
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} width={i === lines - 1 ? "62%" : "100%"} height={14} />
      ))}
    </span>
  );
}

/** A whole widget in its loading state: skeleton body + an accessible "Loading" status. */
export function LoadingBlock({ label = "Loading", height = 220, children }: { label?: string; height?: number; children?: ReactNode }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={{ minHeight: height, display: "flex", flexDirection: "column", gap: 12 }}>
      <span className="sr-only">{label}</span>
      {children ?? (
        <>
          <Skeleton height={20} width="40%" />
          <Skeleton height={height - 40} />
        </>
      )}
    </div>
  );
}

export function ErrorState({ title = "Something went wrong", message, onRetry, retryLabel = "Retry", compact }: { title?: string; message?: string; onRetry?: () => void; retryLabel?: string; compact?: boolean }) {
  return (
    <div className={cx(s.state, s.stateError)} role="alert" style={compact ? { minHeight: 0, padding: "var(--s-5) var(--s-4)" } : undefined}>
      <span className={s.stateIcon}>
        <IconAlert size={22} />
      </span>
      <p className={s.stateTitle}>{title}</p>
      {message ? <p className={s.stateMsg}>{message}</p> : null}
      {onRetry ? (
        <button type="button" className={cx(s.btn, s.secondary, s.sm)} onClick={onRetry}>
          {retryLabel}
        </button>
      ) : null}
    </div>
  );
}

export function EmptyState({ title, message, icon, action, compact }: { title: string; message?: ReactNode; icon?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={s.state} style={compact ? { minHeight: 0, padding: "var(--s-5) var(--s-4)" } : undefined}>
      <span className={s.stateIcon}>{icon ?? <IconInfo size={22} />}</span>
      <p className={s.stateTitle}>{title}</p>
      {message ? <p className={s.stateMsg}>{message}</p> : null}
      {action}
    </div>
  );
}

/** Inline note: info (default), warning (stale/delayed/fixture) or error. */
export function Note({ tone = "info", children, action }: { tone?: "info" | "warn" | "error"; children: ReactNode; action?: ReactNode }) {
  return (
    <div className={cx(s.note, tone === "warn" && s.noteWarn, tone === "error" && s.noteError)} role={tone === "error" ? "alert" : "note"}>
      <span className={s.noteIcon} style={{ color: tone === "warn" ? "var(--warn)" : tone === "error" ? "var(--neg)" : "var(--text-2)" }}>
        {tone === "info" ? <IconInfo size={16} /> : <IconAlert size={16} />}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {action}
    </div>
  );
}

/** Visible label for MOCKED endpoints (see src/ui/api/mock-registry.ts). */
export function DemoBadge({ title = "This section uses sample data because its backend endpoint is not live yet." }: { title?: string }) {
  return (
    <span className={s.demo} title={title}>
      Demo data
    </span>
  );
}
