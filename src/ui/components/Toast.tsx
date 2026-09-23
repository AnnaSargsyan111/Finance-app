"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cx } from "../lib/cx";
import { IconCheck, IconClose } from "./Icons";
import s from "./toast.module.css";

export interface ToastItem {
  id: number;
  message: string;
  tone: "success" | "error";
}

let seq = 0;

/**
 * Generic toast queue. Any page can call `push(message)` to show a top-right, auto-dismissing confirmation; each
 * toast has its own independent timer, so two firing close together stack instead of one clobbering the other.
 * Not tied to Settings — reusable anywhere a success (or other brief) confirmation shouldn't block the page.
 */
export function useToasts(durationMs = 3000) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setToasts((t) => t.filter((x) => x.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    (message: string, tone: ToastItem["tone"] = "success") => {
      const id = ++seq;
      setToasts((t) => [...t, { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), durationMs),
      );
      return id;
    },
    [dismiss, durationMs],
  );

  // clear any pending timers if the page unmounts mid-toast
  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  return { toasts, push, dismiss };
}

/**
 * Fixed top-right stack. `role="status"`/`aria-live="polite"` announce each toast without stealing focus; the
 * viewport itself ignores pointer events so the page underneath stays fully interactive, and only the cards (and
 * their close buttons) capture clicks.
 */
export function ToastViewport({ toasts, onDismiss }: { toasts: ToastItem[]; onDismiss: (id: number) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div className={s.viewport} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx(s.toast, t.tone === "error" && s.toastError)}>
          <span className={s.icon} aria-hidden="true">
            <IconCheck size={16} />
          </span>
          <span className={s.msg}>{t.message}</span>
          <button type="button" className={s.close} onClick={() => onDismiss(t.id)} aria-label="Dismiss notification">
            <IconClose size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
