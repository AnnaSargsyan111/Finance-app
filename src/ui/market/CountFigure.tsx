"use client";

import { Figure } from "../components/Display";
import { useCountProgress } from "../hooks/useCountProgress";

/**
 * A figure that counts up from 0 to its value when it comes into view and rewinds when it has left the screen (see useCountProgress):
 * `when` "always" = every time, scrolling down or up; "down" = only when scrolling down. With reduced motion it simply shows the value.
 * Screen readers get the final figure once (`srText`), not every frame of the count.
 */
export function CountFigure({ value, decimals, prefix, srText, size = "md", when = "always" }: { value: string; decimals: number; prefix?: string; srText: string; size?: "sm" | "md" | "lg"; when?: "always" | "down" }) {
  const { ref, k } = useCountProgress<HTMLSpanElement>(when);
  const target = Number(value);
  return (
    <span ref={ref}>
      <span className="sr-only">{srText}</span>
      <span aria-hidden="true">
        <Figure value={k === null || !Number.isFinite(target) ? value : target * k} decimals={decimals} prefix={prefix} size={size} />
      </span>
    </span>
  );
}
