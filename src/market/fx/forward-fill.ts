import { addDays } from "@/lib/time";
import type { FxObservation } from "./types";

export interface FxSeriesPoint {
  date: string;
  rate: string;
  /** true when `date` had no CBA publication (weekend / public holiday) and the last working-day rate is shown */
  isCarriedForward: boolean;
  /** the CBA working day the rate really comes from */
  sourceDate: string;
}

/**
 * Data-driven forward fill (handover 4.4) - holiday-proof because it needs no holiday calendar:
 * for every calendar day d in [from, to], value(d) = the observation with the greatest date <= d.
 * Days before the first known observation are omitted (callers fetch a padded window so this does not happen).
 */
export function forwardFill(observations: FxObservation[], iso: string, from: string, to: string): FxSeriesPoint[] {
  const rows = observations.filter((o) => o.iso === iso).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const out: FxSeriesPoint[] = [];
  let i = -1; // index of last row with date <= d
  // advance to the first row that is <= from
  while (i + 1 < rows.length && rows[i + 1].date <= from) i++;
  for (let d = from; d <= to; d = addDays(d, 1)) {
    while (i + 1 < rows.length && rows[i + 1].date <= d) i++;
    if (i >= 0) {
      const r = rows[i];
      out.push({ date: d, rate: r.rate, isCarriedForward: r.date !== d, sourceDate: r.date });
    }
  }
  return out;
}
