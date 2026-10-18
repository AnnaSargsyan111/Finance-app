import { APP } from "@/config/app";
import { getEnv } from "@/lib/env";
import { ApiError } from "@/lib/errors";
import { politeFetch } from "@/market/http";

/** Small helpers shared by the official-pages path (ask.ts) and the web paths (web.ts, websearch.ts). */

/** the same words, ignoring case, spacing, dashes and quote styles */
export const normalise = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‐-―−]/g, "-")
    .replace(/[‘’“”"'`]/g, "")
    .replace(/\s+/g, " ")
    .trim();

/** advice wording that must never be shown */
export const ADVICE = /\b(you should|you must|i recommend|i suggest|i advise|you ought to|buy now|sell now|guaranteed return)\b/i;

/** links and markdown removed, whitespace tidied, length capped */
export const clean = (s: string) => s.replace(/https?:\/\/\S+/gi, "").replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim().slice(0, APP.assistant.maxAnswerChars);

export function parseJson(content: string): unknown {
  const t = content.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(t);
  } catch {
    const m = /\{[\s\S]*\}/.exec(t);
    if (m) {
      try {
        return JSON.parse(m[0]);
      } catch {
        /* fall through */
      }
    }
    return null;
  }
}

/** one chat-completions call (OpenAI-compatible API, Gemini by default) that must answer with a JSON object */
export async function chatJson(messages: { role: "system" | "user"; content: string }[]): Promise<unknown> {
  const env = getEnv();
  if (!env.GEMINI_API_KEY) throw new ApiError("NOT_CONFIGURED", 503, "The AI assistant is not available right now.");
  const base = env.ASSISTANT_API_BASE.replace(/\/$/, "");
  const res = await politeFetch(`${base}/chat/completions`, {
    provider: "assistant-model",
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.GEMINI_API_KEY}` },
    body: JSON.stringify({ model: env.ASSISTANT_MODEL, temperature: 0, max_tokens: 2000, response_format: { type: "json_object" }, messages }),
    timeoutMs: APP.assistant.modelTimeoutMs,
    retries: 0,
  });
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return parseJson(data.choices?.[0]?.message?.content ?? "");
}
