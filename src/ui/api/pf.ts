import { getJson, sendJson } from "./client";
import type { PeriodListItem, PeriodRef, PeriodView, PutPeriodBody } from "./types";

/** Personal Finance endpoints answer bare JSON. Every period is stored separately server-side. */
function periodQuery(ref: PeriodRef): Record<string, string | undefined> {
  return ref.kind === "month" ? { kind: "month", month: ref.month } : { kind: "custom", start: ref.start, end: ref.end };
}

export const listPeriods = (signal?: AbortSignal): Promise<PeriodListItem[]> => getJson("/api/pf/periods", { signal });

export const getPeriod = (ref: PeriodRef, signal?: AbortSignal): Promise<PeriodView> => getJson("/api/pf/period", { query: periodQuery(ref), signal });

export const putPeriod = (body: PutPeriodBody): Promise<PeriodView> => sendJson("PUT", "/api/pf/period", { body });

export const deletePeriod = (ref: PeriodRef): Promise<void> => sendJson("DELETE", "/api/pf/period", { query: periodQuery(ref) });
