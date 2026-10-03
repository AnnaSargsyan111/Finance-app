import { describe, expect, it } from "vitest";
import { ANNUAL_TRADED_TRILLIONS, FACTS, STATS, TRADING_DAYS_PER_YEAR, dailyTradedBillions } from "@/ui/auth/market-facts-data";
import { SPENDING_IDEAS } from "@/ui/auth/spending-psychology-data";

describe("sign-up page: 'The stock market in numbers' content", () => {
  it("the per-day figure is derived from the yearly one (so editing one cannot leave the other stale)", () => {
    const daily = STATS.find((s) => s.id === "daily")!;
    expect(daily.value).toBe(dailyTradedBillions());
    expect(daily.value).toBe(Math.round((ANNUAL_TRADED_TRILLIONS * 1000) / TRADING_DAYS_PER_YEAR));
    expect(STATS.find((s) => s.id === "annual")!.value).toBe(ANNUAL_TRADED_TRILLIONS);
  });

  it("shows four statistics and four facts, each with a unique id, readable text and an https source link", () => {
    expect(STATS).toHaveLength(4);
    expect(FACTS).toHaveLength(4);
    for (const group of [STATS, FACTS] as { id: string; source: { name: string; url: string } }[][]) {
      expect(new Set(group.map((i) => i.id)).size).toBe(group.length);
      for (const item of group) {
        expect(item.source.name.length).toBeGreaterThan(2);
        expect(item.source.url).toMatch(/^https:\/\//);
      }
    }
    for (const f of FACTS) {
      expect(f.title.length).toBeGreaterThan(5);
      expect(f.body.length).toBeGreaterThan(40);
    }
  });

  it("the record-low stat is the 1987 crash, shown with a true minus sign (negative colour is never used without one)", () => {
    const crash = STATS.find((s) => s.id === "crash")!;
    expect(crash.value).toBeCloseTo(22.61, 2);
    expect(crash.prefix).toBe("−");
    expect(crash.tone).toBe("neg");
    expect(STATS.filter((s) => s.tone === "neg").every((s) => s.prefix === "−")).toBe(true);
  });
});

describe("sign-up page: 'The psychology of spending' content", () => {
  it("has the four requested ideas, each with a unique id, a description, an example and https source links", () => {
    expect(SPENDING_IDEAS.map((i) => i.id)).toEqual(["pain-of-paying", "diderot-effect", "latte-factor", "mental-accounting"]);
    expect(new Set(SPENDING_IDEAS.map((i) => i.id)).size).toBe(SPENDING_IDEAS.length);
    for (const idea of SPENDING_IDEAS) {
      expect(idea.title.length).toBeGreaterThan(5);
      expect(idea.body.length).toBeGreaterThan(80);
      expect(idea.example.label.length).toBeGreaterThan(3);
      expect(idea.example.text.length).toBeGreaterThan(40);
      expect(idea.sources.length).toBeGreaterThan(0);
      for (const source of idea.sources) {
        expect(source.name.length).toBeGreaterThan(2);
        expect(source.url).toMatch(/^https:\/\//);
      }
    }
  });

  it("keeps the Latte Factor honest: the card shows the criticism, not just the slogan", () => {
    const latte = SPENDING_IDEAS.find((i) => i.id === "latte-factor")!;
    expect(latte.tag).toMatch(/debated/i);
    expect(latte.example.label).toMatch(/criticism/i);
  });

  it("quotes the Celtics experiment the way the MIT source does (more than twice as much), not as invented dollar figures", () => {
    const pain = SPENDING_IDEAS.find((i) => i.id === "pain-of-paying")!;
    expect(pain.example.text).toMatch(/more than twice as much/);
    expect(pain.example.text).not.toMatch(/\$\d/);
  });
});
