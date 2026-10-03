"use client";

import { useEffect, useRef, useState } from "react";
import { Figure } from "../components/Display";
import { nextCountAction } from "../auth/count-up";
import { useReducedMotion } from "../hooks/useReducedMotion";
import { formatFx } from "../lib/format";

const COUNT_UP_MS = 1100;

/**
 * A rate that counts up from 0 to its value each time it comes into view (>= 60% visible), and rewinds once it has left the screen
 * completely, so it replays whenever the visitor scrolls back to it, down or up (the rules are shared with the sign-up page:
 * auth/count-up.ts). With reduced motion, or without IntersectionObserver, it simply shows the value. Screen readers get the final
 * rate once, not every frame of the count.
 */
export function CountFigure({ value, pair, decimals }: { value: string; pair: string; decimals: number }) {
  const reduced = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  /** null = show the real value as published (exact digits); a number = a frame of the count */
  const [frame, setFrame] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    const target = Number(value);
    if (!Number.isFinite(target)) return;
    let raf = 0;
    let armed = true; // true while the figure is off screen: the next time it is mostly visible, it plays
    const io = new IntersectionObserver(
      ([entry]) => {
        const next = nextCountAction(armed, entry);
        armed = next.armed;
        if (next.action === "play") {
          cancelAnimationFrame(raf);
          const start = performance.now();
          const tick = (now: number) => {
            const t = Math.min(1, (now - start) / COUNT_UP_MS);
            if (t < 1) {
              setFrame(target * (1 - Math.pow(1 - t, 3))); // ease-out
              raf = requestAnimationFrame(tick);
            } else setFrame(null);
          };
          setFrame(0);
          raf = requestAnimationFrame(tick);
        } else if (next.action === "reset") {
          // fully off screen: stop any count in progress and rewind, ready for the next time it comes into view
          cancelAnimationFrame(raf);
          setFrame(0);
        }
      },
      { threshold: [0, 0.6] },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, reduced]);

  return (
    <span ref={ref}>
      <span className="sr-only">{formatFx(value, pair)}</span>
      <span aria-hidden="true">
        <Figure value={frame ?? value} decimals={decimals} size="md" />
      </span>
    </span>
  );
}
