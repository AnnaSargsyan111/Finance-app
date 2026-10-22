import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { useTestDb } from "@/lib/db";
import { cached } from "@/market/cache";
import { resetCache } from "./helpers/db";

/** stale-while-revalidate: an expired copy is shown at once while the refresh runs in the background */
let clock = new Date("2026-10-22T10:00:00Z");
const now = () => clock;
const advance = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 100 && !cond(); i++) await new Promise((r) => setTimeout(r, 20));
  expect(cond()).toBe(true);
};

beforeAll(async () => {
  await useTestDb();
});
beforeEach(async () => {
  await resetCache();
  clock = new Date("2026-10-22T10:00:00Z");
});

describe("cached() with swrMaxAgeMs", () => {
  it("expired but young enough: answers at once with the old value, refreshes in the background, then serves the new one", async () => {
    let calls = 0;
    const fetch = async () => `v${++calls}`;
    const opts = { ttlMs: 1000, swrMaxAgeMs: 60_000, fetch, now };
    expect((await cached("swr:a", opts)).value).toBe("v1");
    advance(5000);
    const r = await cached("swr:a", opts);
    expect(r).toMatchObject({ value: "v1", stale: false, source: "revalidating" });
    await until(() => calls === 2);
    await new Promise((r) => setTimeout(r, 150));
    const next = await cached("swr:a", opts);
    expect(next).toMatchObject({ value: "v2", stale: false });
    expect(calls).toBe(2);
  });

  it("older than the limit: waits for the refresh, as without it", async () => {
    let calls = 0;
    const opts = { ttlMs: 1000, swrMaxAgeMs: 10_000, fetch: async () => `v${++calls}`, now };
    await cached("swr:b", opts);
    advance(60_000);
    const r = await cached("swr:b", opts);
    expect(r).toMatchObject({ value: "v2", source: "refreshed" });
  });

  it("many visitors at once start one refresh", async () => {
    let calls = 0;
    const opts = { ttlMs: 1000, swrMaxAgeMs: 60_000, fetch: async () => `v${++calls}`, now };
    await cached("swr:c", opts);
    advance(5000);
    const rs = await Promise.all(Array.from({ length: 8 }, () => cached("swr:c", opts)));
    expect(rs.every((r) => r.value === "v1")).toBe(true);
    await until(() => calls >= 2);
    await new Promise((r) => setTimeout(r, 200));
    expect(calls).toBe(2);
  });

  it("a refresh that fails is not hidden: the next visitor gets the saved copy flagged stale", async () => {
    let fail = false;
    let calls = 0;
    const opts = {
      ttlMs: 1000,
      swrMaxAgeMs: 60_000,
      fetch: async () => {
        calls++;
        if (fail) throw new Error("feeds down");
        return "good";
      },
      now,
    };
    await cached("swr:d", opts);
    fail = true;
    advance(5000);
    expect((await cached("swr:d", opts)).source).toBe("revalidating");
    await until(() => calls === 2);
    await new Promise((r) => setTimeout(r, 200));
    const r = await cached("swr:d", opts);
    expect(r).toMatchObject({ value: "good", stale: true, source: "stale-fallback" });
    expect(r.refreshError).toContain("feeds down");
    expect(calls).toBe(2); // the back-off stops it from hammering the upstream
  });

  it("a forced refresh still waits for the new value", async () => {
    let calls = 0;
    const opts = { ttlMs: 1000, swrMaxAgeMs: 60_000, fetch: async () => `v${++calls}`, now };
    await cached("swr:e", opts);
    advance(5000);
    const r = await cached("swr:e", { ...opts, forceRefresh: true });
    expect(r).toMatchObject({ value: "v2", source: "refreshed" });
  });
});
