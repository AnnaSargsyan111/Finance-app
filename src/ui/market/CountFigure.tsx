"use client";

import { Figure } from "../components/Display";
import { useCountProgress } from "../hooks/useCountProgress";

/**
 * A figure that counts up from 0 to its value (see useCountProgress): `when` "always" = every time it comes into view, scrolling down or
 * up; "once" = a single time, the first time it is on screen. With reduced motion it simply shows the value. Screen readers get the final
 * figure once (`srText`), not every frame of the count.
 */
export function CountFigure({ value, decimals, prefix, srText, size = "md", when = "always" }: { value: string; decimals: number; prefix?: string; srText: string; size?: "sm" | "md" | "lg"; when?: "always" | "once" }) {
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
