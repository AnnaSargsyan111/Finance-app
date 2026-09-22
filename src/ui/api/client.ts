/**
 * Thin fetch wrapper for Finova's OWN API (relative URLs only; the browser sends the right Origin and the session
 * cookie). Never calls a third-party origin. Errors follow the standard envelope `{error:{code,message,fields?}}`.
 * A 401 anywhere (except on the auth screens themselves) sends the user to /auth?mode=login&next=<current route>.
 */
import type { Enveloped, Meta } from "./types";

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly retryAfterSeconds?: number,
    /** any additional error keys the server sent (e.g. NO_ELIGIBLE_STOCK: reason, suggestion) */
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const isApiError = (e: unknown): e is ApiError => e instanceof ApiError;
export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

export function errorMessage(e: unknown, fallback = "Something went wrong. Please try again."): string {
  if (isApiError(e)) {
    if (e.code === "NETWORK") return "Can't reach Finova. Check your connection and try again.";
    return e.message || fallback;
  }
  return fallback;
}

interface RequestOptions {
  query?: Record<string, string | number | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
  /** do not redirect on 401 (sign-in / sign-up / session probes) */
  noAuthRedirect?: boolean;
}

/** Only same-app relative paths are accepted as a post-login target. */
export function safeNext(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return null;
  if (next.startsWith("/auth")) return null;
  return next;
}

export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  const here = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith("/auth")) return;
  const next = safeNext(here);
  window.location.assign(`/auth?mode=login${next ? `&next=${encodeURIComponent(next)}` : ""}`);
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  if (!path.startsWith("/api/")) throw new Error(`Refusing non-API path: ${path}`);
  if (!query) return path;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${path}?${s}` : path;
}

export async function request(method: string, path: string, opts: RequestOptions = {}): Promise<{ status: number; json: unknown }> {
  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method,
      credentials: "same-origin",
      cache: "no-store",
      signal: opts.signal,
      headers: opts.body !== undefined ? { "content-type": "application/json", accept: "application/json" } : { accept: "application/json" },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    if (isAbort(e)) throw e;
    throw new ApiError("NETWORK", 0, "Can't reach Finova. Check your connection and try again.");
  }

  let json: unknown = null;
  if (res.status !== 204) {
    const text = await res.text();
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
  }

  if (res.ok) return { status: res.status, json };

  const err = (json as { error?: { code?: string; message?: string; fields?: Record<string, string>; retryAfterSeconds?: number } & Record<string, unknown> } | null)?.error;
  const headerRetry = Number(res.headers.get("retry-after"));
  const retryAfter = typeof err?.retryAfterSeconds === "number" ? err.retryAfterSeconds : Number.isFinite(headerRetry) && headerRetry > 0 ? headerRetry : undefined;
  if (res.status === 401 && !opts.noAuthRedirect) redirectToLogin();
  throw new ApiError(
    err?.code ?? (res.status === 401 ? "UNAUTHENTICATED" : res.status >= 500 ? "INTERNAL_ERROR" : "REQUEST_FAILED"),
    res.status,
    err?.message ?? (res.status >= 500 ? "Something went wrong on our side. Please try again." : `Request failed (${res.status}).`),
    err?.fields,
    retryAfter,
    err ? Object.fromEntries(Object.entries(err).filter(([k]) => !["code", "message", "fields"].includes(k))) : undefined,
  );
}

/** bare JSON (auth + personal finance) */
export async function getJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  return (await request("GET", path, opts)).json as T;
}
export async function sendJson<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, opts: RequestOptions = {}): Promise<T> {
  return (await request(method, path, opts)).json as T;
}

/** `{data, meta}` (market + invest) */
export async function getEnveloped<T>(path: string, opts: RequestOptions = {}): Promise<Enveloped<T>> {
  return unwrap<T>((await request("GET", path, opts)).json);
}
export async function sendEnveloped<T>(method: "POST" | "PUT" | "DELETE", path: string, opts: RequestOptions = {}): Promise<Enveloped<T>> {
  return unwrap<T>((await request(method, path, opts)).json);
}

function unwrap<T>(json: unknown): Enveloped<T> {
  const j = json as { data?: T; meta?: Meta } | null;
  if (!j || typeof j !== "object" || !("data" in j)) throw new ApiError("BAD_RESPONSE", 200, "Unexpected response from the server.");
  return { data: j.data as T, meta: j.meta ?? {} };
}

/** Map `fields` like {"expenses.3.amount": "..."} or {"password": "..."} to friendlier lookups. */
export function fieldError(e: unknown, name: string): string | undefined {
  return isApiError(e) ? e.fields?.[name] : undefined;
}
