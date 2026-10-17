import { sendJson } from "./client";
import type { Confidence, SourceRef } from "../assistant/types";

/** The AI layer: answers a question the scripted assistant could not, from allowed official pages only. See research/ai-assistant-plan.md (3.0). */
export interface AssistantAnswer {
  status: Confidence;
  text: string;
  sources: SourceRef[];
  lang: "en" | "hy";
}

/** Rejects with an ApiError: 429 (too many questions, wait), 503 (the AI layer is not configured or unavailable), 401, 400. */
export const askAssistant = (question: string, signal?: AbortSignal): Promise<AssistantAnswer> => sendJson("POST", "/api/assistant", { body: { question }, signal });
