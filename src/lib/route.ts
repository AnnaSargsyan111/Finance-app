import type { NextRequest } from "next/server";
import { ApiError } from "./errors";
import { log } from "./log";
import { getSessionUser, type SessionUser } from "@/auth/session";
import { assertSameOrigin, clientIp } from "@/auth/csrf";

/**
 * Route factory: the single place that applies the session guard, CSRF/origin check, JSON body handling,
 * error envelope and no-store caching. Every Route Handler in src/app/api is built with route().
 *
 * Envelopes (handover 1.5 / 10.4):
 *  - market + invest: { data, meta }            -> use envelope()
 *  - auth + pf:       bare JSON per the contract -> use json()
 *  - errors:          { error: { code, message, fields? } }
 */
export interface HandlerCtx<P> {
  req: NextRequest;
  params: P;
  user: SessionUser | null;
  ip: string;
  /** Parse the JSON body (requires Content-Type: application/json, <= 100 KB). */
  body: () => Promise<unknown>;
}

export interface HandlerResult {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** raw Set-Cookie header values to append */
  setCookies?: string[];
}

type Handler<P> = (ctx: HandlerCtx<P>) => Promise<HandlerResult | Response>;

const MAX_BODY_BYTES = 100_000;
const STATE_CHANGING = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export const json = (body: unknown, status = 200, extra?: Omit<HandlerResult, "body" | "status">): HandlerResult => ({
  status,
  body,
  ...extra,
});
export const noContent = (extra?: Omit<HandlerResult, "body" | "status">): HandlerResult => ({ status: 204, ...extra });
export const envelope = (data: unknown, meta: Record<string, unknown>, status = 200): HandlerResult => ({
  status,
  body: { data, meta },
});

export function errorResponse(e: ApiError, extraHeaders?: Record<string, string>): Response {
  const body: { error: { code: string; message: string; fields?: Record<string, string> } & Record<string, unknown> } = {
    error: { code: e.code, message: e.message },
  };
  if (e.fields) body.error.fields = e.fields;
  if (e.extra) Object.assign(body.error, e.extra);
  return new Response(JSON.stringify(body), {
    status: e.status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extraHeaders },
  });
}

function toResponse(r: HandlerResult): Response {
  const headers = new Headers({ "cache-control": "no-store", ...(r.headers ?? {}) });
  for (const c of r.setCookies ?? []) headers.append("set-cookie", c);
  if (r.status === 204 || r.body === undefined) return new Response(null, { status: r.status ?? 204, headers });
  headers.set("content-type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(r.body), { status: r.status ?? 200, headers });
}

export function route<P = Record<string, string>>(
  opts: { auth?: boolean; csrf?: boolean },
  handler: Handler<P>,
): (req: NextRequest, ctx?: { params: Promise<P> }) => Promise<Response> {
  const requireAuth = opts.auth ?? true;
  const checkCsrf = opts.csrf ?? true;
  return async (req, ctx) => {
    const refreshedCookies: string[] = [];
    try {
      if (checkCsrf && STATE_CHANGING.has(req.method)) assertSameOrigin(req);

      let user: SessionUser | null = null;
      // The session is resolved on every route (also public ones) so sliding-expiry cookies get refreshed.
      const found = await getSessionUser(req.headers);
      if (found) {
        user = found.user;
        refreshedCookies.push(...found.setCookies);
      }
      if (requireAuth && !user) throw new ApiError("UNAUTHENTICATED", 401, "Authentication required.");

      const params = (ctx?.params ? await ctx.params : {}) as P;
      const body = async () => {
        const ct = req.headers.get("content-type") ?? "";
        if (!ct.toLowerCase().startsWith("application/json")) {
          throw new ApiError("UNSUPPORTED_MEDIA_TYPE", 415, "Content-Type must be application/json.");
        }
        const text = await req.text();
        if (text.length > MAX_BODY_BYTES) throw new ApiError("VALIDATION_ERROR", 413, "Request body too large.");
        try {
          return text.length ? JSON.parse(text) : {};
        } catch {
          throw new ApiError("VALIDATION_ERROR", 400, "Malformed JSON body.");
        }
      };

      const result = await handler({ req, params, user, ip: clientIp(req.headers), body });
      if (result instanceof Response) {
        for (const c of refreshedCookies) result.headers.append("set-cookie", c);
        return result;
      }
      result.setCookies = [...(result.setCookies ?? []), ...refreshedCookies];
      return toResponse(result);
    } catch (e) {
      if (e instanceof ApiError) {
        const headers: Record<string, string> = {};
        const retry = e.extra?.retryAfterSeconds;
        if (typeof retry === "number") headers["retry-after"] = String(retry);
        return errorResponse(e, headers);
      }
      log.error("unhandled route error", { message: e instanceof Error ? e.message : String(e), path: req.nextUrl?.pathname });
      return errorResponse(new ApiError("INTERNAL_ERROR", 500, "Something went wrong."));
    }
  };
}
