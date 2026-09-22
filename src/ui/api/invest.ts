import { getEnveloped, request, sendEnveloped } from "./client";
import type {
  ComparisonRequest,
  ComparisonResult,
  ConvertResult,
  Enveloped,
  HistoryList,
  Horizon,
  RecMode,
  RecommendationRequest,
  RecommendationResult,
  Risk,
  SavedRecommendation,
  SavedSummary,
} from "./types";
import { formatDateLong } from "../lib/format";

/**
 * Investment endpoints (all LIVE, see mock-registry). The recommendation request is built by `toRecommendationBody`,
 * a whitelist: nothing but the five contract fields can ever leave the browser (AC-F6). This module never touches
 * any other part of the app's state.
 */
export const REQUEST_FIELDS = ["amountAmd", "risk", "horizon", "mode", "notNeededForEmergencies"] as const;

export function toRecommendationBody(input: { amountAmd: number; risk: Risk; horizon: Horizon; mode: RecMode }): RecommendationRequest {
  return { amountAmd: input.amountAmd, risk: input.risk, horizon: input.horizon, mode: input.mode, notNeededForEmergencies: true };
}

export const getConvert = (amountAmd: number, signal?: AbortSignal): Promise<Enveloped<ConvertResult>> =>
  getEnveloped("/api/invest/convert", { query: { amountAmd: String(Math.trunc(amountAmd)) }, signal });

export const getRecommendation = (input: { amountAmd: number; risk: Risk; horizon: Horizon; mode: RecMode }, signal?: AbortSignal): Promise<Enveloped<RecommendationResult>> =>
  sendEnveloped("POST", "/api/invest/recommendation", { body: toRecommendationBody(input), signal });

export const getComparison = (body: ComparisonRequest, signal?: AbortSignal): Promise<Enveloped<ComparisonResult>> =>
  sendEnveloped("POST", "/api/invest/comparison", { body, signal });

/* ------------------------------------------------------------------ history (explicit "Add" only) */

/** POST /api/invest/history -> 201 created | 200 already saved (idempotent) */
export async function addToHistory(saveToken: string, result: RecommendationResult): Promise<{ item: SavedSummary; created: boolean }> {
  const { status, json } = await request("POST", "/api/invest/history", { body: { saveToken, result } });
  return { item: (json as { data: SavedSummary }).data, created: status === 201 };
}

const withLabels = (list: HistoryList): HistoryList => ({ ...list, groups: list.groups.map((g) => ({ ...g, label: g.label || formatDateLong(g.date) })) });

export async function listHistory(signal?: AbortSignal): Promise<HistoryList> {
  const r = await getEnveloped<HistoryList>("/api/invest/history", { query: { page: 1, pageSize: 50 }, signal });
  return withLabels(r.data);
}

export async function getHistoryItem(id: string, signal?: AbortSignal): Promise<SavedRecommendation> {
  return (await getEnveloped<SavedRecommendation>(`/api/invest/history/${encodeURIComponent(id)}`, { signal })).data;
}

export async function deleteHistoryItem(id: string): Promise<void> {
  await request("DELETE", `/api/invest/history/${encodeURIComponent(id)}`);
}
