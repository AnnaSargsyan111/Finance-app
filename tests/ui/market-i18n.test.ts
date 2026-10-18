import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { EN } from "@/ui/i18n/dict/en";
import { STOCK_METRIC_INFO } from "@/ui/market/stock-metric-info";
import { translate } from "@/ui/i18n";

const MARKET = path.resolve(import.meta.dirname, "..", "..", "src", "ui", "market");

describe("market texts in the dictionary", () => {
  it("the six stock-metric explanations equal STOCK_METRIC_INFO (the assistant reads the English ones from there)", () => {
    expect(Object.keys(EN.market.stockMetric).sort()).toEqual(Object.keys(STOCK_METRIC_INFO).sort());
    for (const [k, v] of Object.entries(STOCK_METRIC_INFO)) {
      expect(translate("en", `market.stockMetric.${k}.title`), k).toBe(v.title);
      expect(translate("en", `market.stockMetric.${k}.text`), k).toBe(v.text);
    }
  });

  it("English output is unchanged for the sentences built from numbers", () => {
    expect(translate("en", "market.fx.legendCarried", { n: 1 })).toBe("Weekend / holiday: last working-day rate carried forward (1 day)");
    expect(translate("en", "market.fx.legendCarried", { n: 4 })).toBe("Weekend / holiday: last working-day rate carried forward (4 days)");
    expect(translate("en", "market.news.refreshIn", { n: 12 })).toBe("Refresh in 12s");
    expect(translate("en", "market.news.onlyFew", { n: 3 })).toBe("Only 3 trustworthy articles are available right now.");
    expect(translate("en", "market.meta.updated", { when: "5 min ago" })).toBe("Updated 5 min ago");
    expect(translate("en", "market.stocks.monthUp", { pct: "3.2%" })).toBe("1 month: up 3.2%");
  });

  it("the market screens keep the stock-card labels the metric test looks for and read texts through the translator", () => {
    for (const f of ["MarketPage", "FxSection", "BankRates", "StocksSection", "NewsSection", "NewsDetailPage", "MetaLine", "NewsParts"]) {
      const src = fs.readFileSync(path.join(MARKET, `${f}.tsx`), "utf8");
      expect(src, f).toMatch(/useT\(\)/);
    }
  });
});
