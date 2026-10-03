"use client";

import { useEffect, useRef, type RefObject } from "react";
import { PLAY_AT_RATIO } from "../auth/count-up";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Calls `onPlay` ONCE: the first time the element is mostly on screen (>= 60%). After that it never fires again, however much the visitor
 * scrolls. Does nothing with reduced motion or without IntersectionObserver.
 */
export function useScrollOnce<T extends HTMLElement>(onPlay: () => void, deps: unknown[] = []): RefObject<T | null> {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const handler = useRef(onPlay);
  handler.current = onPlay;

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.intersectionRatio >= PLAY_AT_RATIO) {
          io.disconnect();
          handler.current();
        }
      },
      { threshold: [0, PLAY_AT_RATIO] },
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);

  return ref;
}
