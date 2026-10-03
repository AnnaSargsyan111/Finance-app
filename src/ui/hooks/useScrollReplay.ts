"use client";

import { useEffect, useRef, type RefObject } from "react";
import { nextCountAction, PLAY_AT_RATIO } from "../auth/count-up";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Calls `onPlay` each time the element is mostly on screen (>= 60%) after having been completely off screen, and `onReset` when it has
 * left the screen completely, so whatever it drives replays every time the visitor scrolls to it, downwards or upwards. The rules are in
 * auth/count-up.ts (shared with the sign-up page). Does nothing with reduced motion or without IntersectionObserver; `onReset` should put
 * the element back to its resting look, so those visitors simply see the finished state.
 */
export function useScrollReplay<T extends HTMLElement | SVGElement>(onPlay: () => void, onReset: () => void, deps: unknown[] = []): RefObject<T | null> {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const handlers = useRef({ onPlay, onReset });
  handlers.current = { onPlay, onReset };

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    let armed = true; // true while the element is off screen: the next time it is mostly visible, it plays
    const io = new IntersectionObserver(
      ([entry]) => {
        const next = nextCountAction(armed, entry);
        armed = next.armed;
        if (next.action === "play") handlers.current.onPlay();
        else if (next.action === "reset") handlers.current.onReset();
      },
      { threshold: [0, PLAY_AT_RATIO] },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);

  return ref;
}
