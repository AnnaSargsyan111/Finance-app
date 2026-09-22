"use client";

import { useEffect, useId, useRef, type ReactNode, type RefObject } from "react";
import s from "./ui.module.css";

/**
 * Generic modal dialog (native <dialog>), styled like the existing ConfirmDialog but built for form content: it
 * moves focus into the dialog on open (to `initialFocusRef`, or the first focusable element), returns focus to
 * whatever triggered it on close, and closes on Escape or a backdrop click. Content outside a native <dialog> opened
 * with showModal() is made inert by the browser, so Tab already stays inside the dialog.
 *
 * Focus restoration prefers `restoreFocusRef` (the trigger button, captured by the caller via `e.currentTarget` at
 * click time) over `document.activeElement`: some browsers (notably Safari) never move focus to a button on a mouse
 * click, so relying on `document.activeElement` alone silently drops focus back to <body> on close in those cases.
 */
export function Modal<T extends HTMLElement = HTMLElement>({
  open,
  title,
  children,
  onClose,
  initialFocusRef,
  restoreFocusRef,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  /** Escape / backdrop click */
  onClose: () => void;
  initialFocusRef?: RefObject<T | null>;
  /** the element to refocus on close; falls back to document.activeElement at open time when omitted */
  restoreFocusRef?: RefObject<HTMLElement | null>;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const restoreFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      restoreFocus.current = restoreFocusRef?.current ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
      d.showModal();
      requestAnimationFrame(() => {
        (initialFocusRef?.current ?? d.querySelector<HTMLElement>("input, button, select, textarea, [tabindex]"))?.focus();
      });
    } else if (!open && d.open) {
      d.close();
      restoreFocus.current?.focus();
      restoreFocus.current = null;
    }
  }, [open, initialFocusRef, restoreFocusRef]);

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      aria-labelledby={titleId}
      onCancel={(e) => {
        // Escape: keep control in React state rather than letting the browser close it directly
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
          {children}
        </>
      ) : null}
    </dialog>
  );
}
