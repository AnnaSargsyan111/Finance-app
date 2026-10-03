"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useScrollDownReplay } from "./useScrollDownReplay";
import { useScrollReplay } from "./useScrollReplay";

const COUNT_UP_MS = 1100;

/**
 * Drives a count-up for everything inside one element. `k` is how far along the count is (0 -> 1, eased), or `null` when it is at
 * rest: show the real values then, so the exact published digits are on screen whenever nothing is animating. Attach `ref` to the
 * element; multiply each number by `k` while it is not null.
 *  - when = "always": plays every time the element comes into view, scrolling down or up;
 *  - when = "down": plays only when the visitor scrolls DOWN to it; scrolling up shows the finished values at once.
 * It rewinds (k = 0) while the element is off screen, ready to play again. With reduced motion `k` stays null.
 */
export function useCountProgress<T extends HTMLElement>(when: "always" | "down"): { ref: RefObject<T | null>; k: number | null } {
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
  const showFinal = () => {
    cancelAnimationFrame(raf.current);
    setK(null);
  };
  const noop = () => {};

  const always = when === "always";
  const refAlways = useScrollReplay<T>(always ? play : noop, always ? rewind : noop, [when]);
  const refDown = useScrollDownReplay<T>(always ? noop : play, always ? noop : showFinal, always ? noop : rewind, [when]);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return { ref: always ? refAlways : refDown, k };
}
