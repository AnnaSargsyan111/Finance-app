"use client";

import { useEffect, useRef, type RefObject } from "react";
import { FLIP_AT_RATIO, SHOW_AHEAD_PX, decideCard, type ScrollDirection } from "../auth/flip-cards";
import { useReducedMotion } from "./useReducedMotion";

/**
 * Like useScrollReplay, but the animation plays ONLY when the visitor scrolls DOWN to the element (rules in auth/flip-cards.ts, shared
 * with the sign-up flip cards):
 *  - scrolled down to it: `onPlay`;
 *  - scrolled UP to it: `onShow` (show the finished state at once, no animation);
 *  - it left the screen below (the visitor scrolled back up past it): `onReset`, ready to play again on the next way down;
 *  - it left the screen above (the visitor scrolled down past it): it stays finished.
 * Does nothing with reduced motion or without IntersectionObserver, so those visitors just see the finished state.
 */
export function useScrollDownReplay<T extends HTMLElement>(onPlay: () => void, onShow: () => void, onReset: () => void, deps: unknown[] = []): RefObject<T | null> {
  const reduced = useReducedMotion();
  const ref = useRef<T>(null);
  const handlers = useRef({ onPlay, onShow, onReset });
  handlers.current = { onPlay, onShow, onReset };

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || typeof IntersectionObserver === "undefined") return;
    let direction: ScrollDirection = "down";
    let last = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      if (y > last) direction = "down";
      else if (y < last) direction = "up";
      last = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });

    let played = false;
    const io = new IntersectionObserver(
      ([entry]) => {
        const action = decideCard(
          played,
          { intersectionRatio: entry.intersectionRatio, isIntersecting: entry.isIntersecting, top: entry.boundingClientRect.top, viewportHeight: window.innerHeight },
          direction,
        );
        if (action === "flip") {
          played = true;
          handlers.current.onPlay();
        } else if (action === "show") {
          played = true;
          handlers.current.onShow();
        } else if (action === "reset") {
          played = false;
          handlers.current.onReset();
        }
      },
      { threshold: [0, FLIP_AT_RATIO], rootMargin: `${SHOW_AHEAD_PX}px 0px 0px 0px` },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reduced, ...deps]);

  return ref;
}
