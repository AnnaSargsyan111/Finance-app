import { describe, expect, it } from "vitest";
import { carriedRuns } from "@/ui/market/fx-utils";
import { FX_PERIODS, normaliseNews } from "@/ui/api/market";
import type { FxPoint } from "@/ui/api/types";

const pt = (date: string, cf: boolean): FxPoint => ({ date, rate: "363.44", isCarriedForward: cf, sourceDate: "2026-09-18" });

describe("market helpers", () => {
  it("groups weekend/holiday points into shaded runs that start at the last real rate", () => {
    const s = [pt("2026-09-17", false), pt("2026-09-18", false), pt("2026-09-19", true), pt("2026-09-20", true), pt("2026-09-21", true)];
    expect(carriedRuns(s)).toEqual([{ x1: "2026-09-18", x2: "2026-09-21" }]);
    expect(carriedRuns([pt("a", false), pt("b", false)])).toEqual([]);
    expect(carriedRuns([pt("2026-09-01", true), pt("2026-09-02", false), pt("2026-09-03", true), pt("2026-09-04", false)])).toEqual([
      { x1: "2026-09-01", x2: "2026-09-01" },
      { x1: "2026-09-02", x2: "2026-09-03" },
    ]);
  });

  it("FX period chips map to 7/30/90/180/365 days, default 1M", () => {
    expect(FX_PERIODS.map((p) => [p.label, p.days])).toEqual([["1W", 7], ["1M", 30], ["3M", 90], ["6M", 180], ["1Y", 365]]);
  });

  it("normalises news items from older or newer backend builds", () => {
    const base = { id: "a".repeat(16), title: "T", source: "BBC", url: "https://x.test/a", publishedAt: "2026-09-21T10:00:00Z" };
    expect(normaliseNews({ ...base, topic: "tech_ai" }).category).toBe("Technology");
    expect(normaliseNews({ ...base, region: "armenia" }).category).toBe("Armenia");
    expect(normaliseNews({ ...base, category: "Markets" }).category).toBe("Markets");
    expect(normaliseNews(base).summary).toBeNull();
    expect(normaliseNews({ ...base, imageUrl: "http://insecure.test/i.jpg" }).imageUrl).toBeNull(); // https only
    expect(normaliseNews({ ...base, imageUrl: "https://ok.test/i.jpg" }).imageUrl).toBe("https://ok.test/i.jpg");
  });
});
