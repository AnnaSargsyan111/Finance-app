"use client";

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconInfo } from "./Icons";
import { cx } from "../lib/cx";
import s from "./infotip.module.css";

export interface InfoSection {
  label: string;
  text: string;
  /** the "in this result" line: set apart with an accent edge */
  highlight?: boolean;
}

/** only one popover is open at a time: opening one closes the previous */
let closeCurrent: (() => void) | null = null;

const WIDTH = 340;
const MARGIN = 12;
const GAP = 8;

/**
 * An "i" button that opens a small popover next to it with an explanation. Click (or Enter / Space) opens it; a click elsewhere, Esc, the
 * close button or opening another popover closes it. It is positioned next to the icon and kept inside the screen, below the icon or above it
 * when there is no room below, and follows the icon when the page scrolls.
 */
export function InfoTip({ title, sections, className }: { title: string; sections: InfoSection[]; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  const close = useCallback(() => {
    setOpen(false);
    setPos(null);
    if (closeCurrent === close) closeCurrent = null;
  }, []);

  const place = useCallback(() => {
    const b = btn.current;
    const p = panel.current;
    if (!b || !p) return;
    const r = b.getBoundingClientRect();
    const width = Math.min(WIDTH, window.innerWidth - MARGIN * 2);
    const height = p.offsetHeight;
    const left = Math.max(MARGIN, Math.min(r.left + r.width / 2 - width / 2, window.innerWidth - width - MARGIN));
    const below = r.bottom + GAP;
    const above = r.top - GAP - height;
    // below the icon if it fits, else above it; if neither fits (a tall explanation on a short screen) slide it up so all of it is visible
    const top = below + height <= window.innerHeight - MARGIN ? below : above >= MARGIN ? above : Math.max(MARGIN, window.innerHeight - height - MARGIN);
    setPos({ top, left, width });
  }, []);

  // position once the panel exists (it is first drawn hidden so its height can be measured), and keep it next to the icon
  useLayoutEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !btn.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        close();
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    panel.current?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  useEffect(() => () => {
    if (closeCurrent === close) closeCurrent = null;
  }, [close]);

  const toggle = () => {
    if (open) return close();
    closeCurrent?.();
    closeCurrent = close;
    setOpen(true);
  };

  return (
    <>
      <button ref={btn} type="button" className={cx(s.btn, open && s.btnOpen, className)} aria-label={`What is ${title}?`} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? id : undefined} onClick={toggle}>
        <IconInfo size={15} />
      </button>
      {open
        ? createPortal(
            <div
              ref={panel}
              id={id}
              role="dialog"
              aria-label={title}
              tabIndex={-1}
              className={s.panel}
              style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, width: Math.min(WIDTH, window.innerWidth - MARGIN * 2), visibility: "hidden" }}
            >
              <div className={s.head}>
                <p className={s.title}>{title}</p>
                <button type="button" className={s.close} aria-label="Close explanation" onClick={() => { close(); btn.current?.focus(); }}>
                  <span aria-hidden="true">×</span>
                </button>
              </div>
              {sections.map((x) => (
                <div key={x.label} className={cx(s.sec, x.highlight && s.secHighlight)}>
                  <span className={s.secLabel}>{x.label}</span>
                  <p className={s.secText}>{x.text}</p>
                </div>
              ))}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
