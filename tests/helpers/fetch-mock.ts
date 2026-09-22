import fs from "node:fs";
import path from "node:path";
import { vi } from "vitest";

export const FIXTURES = path.resolve(import.meta.dirname, "..", "fixtures");
export const fixture = (...p: string[]) => fs.readFileSync(path.join(FIXTURES, ...p), "utf8");

export type MockHandler = (url: string, init: RequestInit) => Response | Promise<Response> | undefined;

export interface FetchMock {
  calls: { url: string; method: string; body?: string }[];
  countHost(host: string): number;
  restore(): void;
}

/** Replace global fetch with a handler; unhandled URLs fail loudly so tests never hit the network by accident. */
export function mockFetch(handler: MockHandler): FetchMock {
  const calls: FetchMock["calls"] = [];
  const impl = async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input instanceof Request ? input.url : input);
    calls.push({ url, method: (init.method ?? "GET").toUpperCase(), body: typeof init.body === "string" ? init.body : undefined });
    const res = await handler(url, init);
    if (!res) throw new Error(`Unmocked fetch: ${url}`);
    return res;
  };
  vi.stubGlobal("fetch", impl);
  return {
    calls,
    countHost: (host) => calls.filter((c) => new URL(c.url).host === host).length,
    restore: () => vi.unstubAllGlobals(),
  };
}

export const text = (body: string, status = 200, type = "text/xml") => new Response(body, { status, headers: { "content-type": type } });
export const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Routes the recorded CBA / Frankfurter / fawazahmed0 fixtures. `failCba` simulates an outage. */
export function fxHandler(opts: { cba?: "ok" | "500" | "malformed" | "timeout"; frankfurter?: "ok" | "500"; fawaz?: "ok" | "500" } = {}): MockHandler {
  const { cba = "ok", frankfurter = "ok", fawaz = "ok" } = opts;
  return (url, init) => {
    const u = new URL(url);
    if (u.host === "api.cba.am") {
      if (cba === "500") return text("boom", 500);
      if (cba === "malformed") return text("<html><body>Service unavailable", 200);
      if (cba === "timeout") throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
      const action = String((init.headers as Record<string, string>)?.soapaction ?? "");
      if (action.includes("ExchangeRatesLatest")) return text(fixture("cba", "latest_2026-09-21.xml"));
      if (action.includes("ExchangeRatesByDateRangeByISO")) {
        const body = String(init.body ?? "");
        const from = /<DateFrom>([^<]+)</.exec(body)?.[1];
        const to = /<DateTo>([^<]+)</.exec(body)?.[1];
        if (from === "2026-08-20" && to === "2026-09-20") return text(fixture("cba", "range_2026-08-20_2026-09-20.xml"));
        return text(fixture("cba", "range_2025-07-01_2026-09-21.xml"));
      }
    }
    if (u.host === "api.frankfurter.dev") {
      if (frankfurter === "500") return text("nope", 500);
      const m = /\/v2\/rate\/([A-Z]{3})\/AMD/.exec(u.pathname);
      if (m) return text(fixture("frankfurter", `latest_${m[1]}.json`), 200, "application/json");
      if (u.pathname === "/v2/rates") {
        const base = u.searchParams.get("base")!;
        const from = u.searchParams.get("from")!;
        const to = u.searchParams.get("to")!;
        const rows = (JSON.parse(fixture("frankfurter", `range_${base}.json`)) as { date: string }[]).filter((r) => r.date >= from && r.date <= to);
        return jsonRes(rows);
      }
    }
    if (u.host === "cdn.jsdelivr.net" && u.pathname.includes("currency-api")) {
      if (fawaz === "500") return text("nope", 500);
      const cur = /currencies\/([a-z]{3})\.json/.exec(u.pathname)![1];
      return text(fixture("fawazahmed0", `${cur}.json`), 200, "application/json");
    }
    return undefined;
  };
}
