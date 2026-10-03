"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useReducedMotion } from "./useReducedMotion";
import { useScrollOnce } from "./useScrollOnce";
import { useScrollReplay } from "./useScrollReplay";

const COUNT_UP_MS = 1100;

/**
 * Drives a count-up. `k` is how far along the count is (0 -> 1, eased), or `null` when it is at rest: show the real value then, so the
 * exact published digits are on screen whenever nothing is animating. Attach `ref` to the element and multiply the number by `k` while it
 * is not null.
 *  - when = "always": plays every time the element comes into view, scrolling down or up, and rewinds while it is off screen;
 *  - when = "once": waits at 0 and plays a single time, the first time the element is mostly on screen; it never repeats.
 * With reduced motion (or no IntersectionObserver) `k` stays null.
 */
export function useCountProgress<T extends HTMLElement>(when: "always" | "once"): { ref: RefObject<T | null>; k: number | null } {
  const reduced = useReducedMotion();
  const [k, setK] = useState<number | null>(null);
  const raf = useRef(0);

  const play = () => {
    cancelAnimationFrame(raf.current);
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_UP_MS);
      if (t < 1) {
        setK(1 - Math.pow(1 - t, 3)); // ease-out
        raf.current = requestAnimationFrame(tick);
      } else setK(null);
    };
    setK(0);
    raf.current = requestAnimationFrame(tick);
  };
  const rewind = () => {
    cancelAnimationFrame(raf.current);
    setK(0);
  };
  const noop = () => {};

  const always = when === "always";
  const refAlways = useScrollReplay<T>(always ? play : noop, always ? rewind : noop, [when]);
  const refOnce = useScrollOnce<T>(always ? noop : play, [when]);

  // "once": hold the number at 0 until its turn comes (it is not on screen yet, or is about to be)
  useEffect(() => {
    if (!always && !reduced && typeof IntersectionObserver !== "undefined") setK((cur) => cur ?? 0);
  }, [always, reduced]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { ref: always ? refAlways : refOnce, k };
}
