import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { resetCache } from "./helpers/db";
import { fxHandler, mockFetch, type FetchMock } from "./helpers/fetch-mock";
import { setNewsFetchers } from "@/market/news/service";
import * as jobsRoute from "@/app/api/jobs/[name]/route";

/**
 * Deployment readiness: Vercel Cron invokes a scheduled URL with GET and auto-attaches
 * `Authorization: Bearer $CRON_SECRET` once CRON_SECRET is set as a Vercel project env var - so the GET handler
 * must exist, must require the same secret as POST, and must refuse `universe` (too long for a cron-triggered
 * serverless invocation) while still running the fast jobs the same way POST does.
 */
const SECRET = "test-cron-secret-for-get-0123456789";
const get = (name: string, headers: Record<string, string> = {}) => call(jobsRoute.GET, "GET", `/api/jobs/${name}`, { headers, params: { name } });

let mock: FetchMock | undefined;
beforeAll(async () => {
  await useTestDb();
});
beforeEach(async () => {
  await resetCache();
  delete process.env.CRON_SECRET;
  delete process.env.KEYED_PROVIDER_MODE;
});
afterEach(() => {
  mock?.restore();
  setNewsFetchers(null);
  delete process.env.CRON_SECRET;
  delete process.env.KEYED_PROVIDER_MODE;
});

describe("GET /api/jobs/:name (Vercel Cron entry point)", () => {
  it("requires the CRON_SECRET bearer: no header, missing secret, and wrong secret are all 403; unknown job is 404", async () => {
    expect((await get("fx")).status).toBe(403); // CRON_SECRET unset entirely
    process.env.CRON_SECRET = SECRET;
    expect((await get("fx")).status).toBe(403); // no Authorization header at all (what a misconfigured cron would send)
    expect((await get("fx", { authorization: "Bearer wrong" })).status).toBe(403);
    expect((await get("fx", { authorization: SECRET })).status).toBe(403); // missing "Bearer " prefix
    expect((await get("nope", { authorization: `Bearer ${SECRET}` })).status).toBe(404);
  });

  it("refuses `universe` with a clear, stable error and touches no network - must never let a scheduler kick off the long batch", async () => {
    process.env.CRON_SECRET = SECRET;
    mock = mockFetch(() => {
      throw new Error("GET /api/jobs/universe must not make any outbound call");
    });
    const r = await get("universe", { authorization: `Bearer ${SECRET}` });
    expect(r.status).toBe(405);
    expect(r.body.error.code).toBe("METHOD_NOT_ALLOWED");
    expect(r.body.error.message).toMatch(/GitHub Actions|job:universe/);
    expect(mock.calls).toHaveLength(0);
    // POST still allows it (manual / GitHub Actions trigger) - unchanged behaviour
    mock.restore();
    mock = mockFetch(() => undefined); // no constituents CSV mocked -> the run fails, but it must be ATTEMPTED (not 405)
    const p = await call(jobsRoute.POST, "POST", "/api/jobs/universe", { headers: { authorization: `Bearer ${SECRET}` }, params: { name: "universe" }, json: { limit: 1 } });
    expect(p.status).not.toBe(405);
  });

  it("runs fx via GET exactly like POST (real forced refresh, no body needed)", async () => {
    process.env.CRON_SECRET = SECRET;
    mock = mockFetch(fxHandler());
    const r = await get("fx", { authorization: `Bearer ${SECRET}` });
    expect(r.status).toBe(200);
    expect(r.body.job).toBe("fx");
    expect(r.body.result.latestSourceDate).toBe("2026-09-18");
    expect(r.body.result.historyPoints).toBeGreaterThan(0);
  });

  it("runs news via GET exactly like POST", async () => {
    process.env.CRON_SECRET = SECRET;
    const feedXml =
      `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>t</title><link>https://example.test/</link><description>d</description>` +
      `<item><title>Synthetic cron job story: central bank holds interest rate steady</title><link>https://example.test/cron/job-story</link>` +
      `<pubDate>${new Date().toUTCString()}</pubDate></item></channel></rss>`;
    setNewsFetchers({
      now: () => new Date(),
      fetchFeed: async (f) => {
        if (f.id !== "yahoo") throw new Error("disabled for this test");
        return feedXml;
      },
    });
    const r = await get("news", { authorization: `Bearer ${SECRET}` });
    expect(r.status).toBe(200);
    expect(r.body.job).toBe("news");
    expect(r.body.result.items).toBeGreaterThanOrEqual(1);
  });

  it("runs stocks via GET exactly like POST (fixture mode: no network needed)", async () => {
    process.env.CRON_SECRET = SECRET;
    process.env.KEYED_PROVIDER_MODE = "fixture";
    mock = mockFetch(() => undefined); // fixture mode must not call fetch at all
    const r = await get("stocks", { authorization: `Bearer ${SECRET}` });
    expect(r.status).toBe(200);
    expect(r.body.job).toBe("stocks");
    expect(r.body.result.symbols).toEqual(["NVDA", "AAPL", "GOOGL", "MSFT", "AMZN"]);
    expect(mock.calls).toHaveLength(0);
  });
});
