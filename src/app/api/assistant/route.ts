import { z } from "zod";
import { APP } from "@/config/app";
import { ApiError, validationError } from "@/lib/errors";
import { json, route } from "@/lib/route";
import { enforceLimit, recordEvent } from "@/auth/rate-limit";
import { answerQuestion } from "@/assistant/ask";
import { getEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const body = z.object({ question: z.string().trim().min(1).max(APP.assistant.questionMaxChars) });

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * POST /api/assistant  { question } -> { status: "confirmed"|"partial"|"none", text, sources[], lang }
 * The AI layer of the assistant: an answer from the allowed official pages only, with a confidence decided by the server
 * (src/assistant/ask.ts). 503 NOT_CONFIGURED without a key (the screen then shows its written answer), 429 when asking too often.
 * The question text is never stored or logged.
 */
export const POST = route({ auth: true }, async ({ body: readBody, user }) => {
  const parsed = body.safeParse(await readBody());
  if (!parsed.success) throw validationError("Ask a question of 1 to 400 characters.", { question: "Ask a question of 1 to 400 characters." });
  if (!getEnv().GEMINI_API_KEY) throw new ApiError("NOT_CONFIGURED", 503, "The AI assistant is not available right now.");

  // costs are capped per user and for everybody together; every question counts, whether or not it succeeds
  const userKey = user!.id;
  await enforceLimit({ scope: "assistant-user-hour", key: userKey, limit: APP.assistant.perUserPerHour, windowMs: HOUR });
  await enforceLimit({ scope: "assistant-user-day", key: userKey, limit: APP.assistant.perUserPerDay, windowMs: DAY });
  await enforceLimit({ scope: "assistant-global-day", key: "all", limit: APP.assistant.globalPerDay, windowMs: DAY });
  await Promise.all([recordEvent("assistant-user-hour", userKey), recordEvent("assistant-user-day", userKey), recordEvent("assistant-global-day", "all")]);

  return json(await answerQuestion(parsed.data.question));
});
