import { ApiError } from "@/lib/errors";
import { getEnv } from "@/lib/env";

/** Allowed origins for state-changing browser requests: APP_BASE_URL + TRUSTED_ORIGINS (+ localhost in dev). */
export function allowedOrigins(): Set<string> {
  const env = getEnv();
  const set = new Set<string>();
  const add = (u: string) => {
    try {
      set.add(new URL(u).origin);
    } catch {
      /* ignore malformed */
    }
  };
  add(env.APP_BASE_URL);
  for (const o of (env.TRUSTED_ORIGINS ?? "").split(",")) if (o.trim()) add(o.trim());
  if (env.NODE_ENV !== "production") {
    for (const port of [3000, 3001, 3002]) add(`http://localhost:${port}`);
  }
  return set;
}

/**
 * CSRF defence for cookie-authenticated state-changing routes (in addition to SameSite=Lax cookies and the
 * JSON-only Content-Type requirement):
 *  - `Origin` present  -> must be an allowed origin.
 *  - `Origin` absent   -> allowed unless the browser says it is cross-site (`Sec-Fetch-Site`).
 *    (curl / server-to-server clients send no Origin; browsers always send it on cross-origin POSTs.)
 */
export function assertSameOrigin(req: Request): void {
  const origin = req.headers.get("origin");
  if (origin) {
    if (!allowedOrigins().has(origin)) {
      throw new ApiError("CSRF_ORIGIN_MISMATCH", 403, "Cross-origin request rejected.");
    }
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    throw new ApiError("CSRF_ORIGIN_MISMATCH", 403, "Cross-origin request rejected.");
  }
}

/** Client IP: first X-Forwarded-For hop (set by the platform, e.g. Vercel), else X-Real-IP. Spoofable behind other proxies. */
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim() || "unknown";
  return headers.get("x-real-ip")?.trim() || "unknown";
}
