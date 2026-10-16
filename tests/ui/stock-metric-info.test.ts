import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { STOCK_METRIC_INFO } from "@/ui/market/stock-metric-info";

const UI = path.resolve(import.meta.dirname, "..", "..", "src", "ui");

describe("stock card metric explanations", () => {
  it("covers the six numbers on a card, and each stays short enough for two lines of the popover", () => {
    expect(Object.keys(STOCK_METRIC_INFO).sort()).toEqual(["dividendYield", "eps", "marketCap", "pe", "previousClose", "range52w"]);
    for (const [k, v] of Object.entries(STOCK_METRIC_INFO)) {
      expect(v.text.length, k).toBeLessThanOrEqual(110); // about two lines at the 340px popover width
      expect(v.text.length, k).toBeGreaterThan(30);
    }
  });

  it("every metric label on the card has its explanation wired in", () => {
    const src = fs.readFileSync(path.join(UI, "market", "StocksSection.tsx"), "utf8");
    for (const k of Object.keys(STOCK_METRIC_INFO)) expect(src, k).toContain(`<Label k="${k}" />`);
  });

  it("gives no investment advice in the wording", () => {
    for (const v of Object.values(STOCK_METRIC_INFO)) expect(v.text).not.toMatch(/\b(buy|sell|should|good|bad|cheap|expensive|undervalued|overvalued)\b/i);
  });
});
