import type { FxPoint } from "../api/types";

/** contiguous runs of carried-forward points, extended one point back to the last real working-day value */
export function carriedRuns(series: FxPoint[]): { x1: string; x2: string }[] {
  const runs: { x1: string; x2: string }[] = [];
  let start = -1;
  for (let i = 0; i <= series.length; i++) {
    const cf = i < series.length && series[i].isCarriedForward;
    if (cf && start < 0) start = i;
    if (!cf && start >= 0) {
      runs.push({ x1: series[Math.max(0, start - 1)].date, x2: series[i - 1].date });
      start = -1;
    }
  }
  return runs;
}
