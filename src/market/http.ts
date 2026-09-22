import { getEnv } from "@/lib/env";
import { UpstreamError } from "@/lib/errors";

/**
 * Polite outbound HTTP for every provider adapter:
 *  - descriptive User-Agent from env (never hard-coded contact details)
 *  - per-host minimum interval (SEC <= 10 req/s, others slower), enforced with slot scheduling so concurrent callers queue
 *  - timeout, and a small bounded retry ONLY for network errors / 5xx / 429 (honouring Retry-After up to 10 s)
 *  - OFFLINE=true refuses all calls
 * Callers must additionally cache aggressively (see cache.ts) - this layer is a safety net, not a cache.
 */
const HOST_INTERVAL_MS: Record<string, number> = {
  "data.sec.gov": 150, // SEC fair-use limit is 10 requests/second; we stay at ~6/s
  "www.sec.gov": 150,
  "api.cba.am": 500,
  "api.frankfurter.dev": 400,
  "cdn.jsdelivr.net": 400,
  "latest.currency-api.pages.dev": 400,
  "query1.finance.yahoo.com": 500,
  "query2.finance.yahoo.com": 500,
  "finance.yahoo.com": 800,
  "raw.githubusercontent.com": 500,
  "finnhub.io": 1100, // free plan: 60/min
  "api.twelvedata.com": 8000, // free plan: 8 credits/min
};
const DEFAULT_INTERVAL_MS = 700;

const nextSlot = new Map<string, number>();

function intervalFor(host: string): number {
  // tests must not sleep; set THROTTLE_IN_TESTS=1 to exercise the scheduler itself
  if (process.env.NODE_ENV === "test" && !process.env.THROTTLE_IN_TESTS) return 0;
  return HOST_INTERVAL_MS[host] ?? DEFAULT_INTERVAL_MS;
}

/** Reserve the next time slot for a host and wait for it. Exported for tests. */
export async function waitForSlot(host: string, now: () => number = Date.now): Promise<void> {
  const interval = intervalFor(host);
  if (interval === 0) return;
  const t = now();
  const slot = Math.max(t, nextSlot.get(host) ?? 0);
  nextSlot.set(host, slot + interval);
  const wait = slot - t;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
}

export interface PoliteFetchOptions {
  provider: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  retries?: number;
  /** override User-Agent (SEC requires its own contact string) */
  userAgent?: string;
  /** accept these non-2xx statuses without throwing */
  allowStatus?: number[];
}

export async function politeFetch(url: string, opts: PoliteFetchOptions): Promise<Response> {
  const env = getEnv();
  if (env.OFFLINE) throw new UpstreamError(opts.provider, "Outbound HTTP disabled (OFFLINE=true)", undefined, false);
  const host = new URL(url).host;
  const retries = opts.retries ?? 1;
  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await waitForSlot(host);
    try {
      const res = await fetch(url, {
        method: opts.method ?? "GET",
        headers: { "user-agent": opts.userAgent ?? env.HTTP_USER_AGENT, accept: "*/*", ...(opts.headers ?? {}) },
        body: opts.body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
        redirect: "follow",
      });
      if (res.ok || opts.allowStatus?.includes(res.status)) return res;
      const retriable = res.status === 429 || res.status >= 500;
      if (retriable && attempt < retries) {
        const ra = Number(res.headers.get("retry-after"));
        const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra, 10) * 1000 : 1000 * (attempt + 1);
        if (process.env.NODE_ENV !== "test") await new Promise((r) => setTimeout(r, waitMs));
        continue;
      }
      throw new UpstreamError(opts.provider, `${opts.provider} responded HTTP ${res.status}`, res.status, retriable);
    } catch (e) {
      if (e instanceof UpstreamError) throw e;
      lastErr = e;
      if (attempt < retries) {
        if (process.env.NODE_ENV !== "test") await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
    }
  }
  const msg = lastErr instanceof Error ? lastErr.message : "network error";
  throw new UpstreamError(opts.provider, `${opts.provider} request failed: ${msg}`);
}

export async function fetchText(url: string, opts: PoliteFetchOptions): Promise<string> {
  const res = await politeFetch(url, opts);
  return res.text();
}

export async function fetchJson<T = unknown>(url: string, opts: PoliteFetchOptions): Promise<T> {
  const text = await fetchText(url, { ...opts, headers: { accept: "application/json", ...(opts.headers ?? {}) } });
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new UpstreamError(opts.provider, `${opts.provider} returned invalid JSON`);
  }
}
