import { describe, expect, it } from "vitest";
import { LABELS, FACTOR_LABELS } from "@/invest/explain";
import { EN } from "@/ui/i18n/dict/en";
import { translate } from "@/ui/i18n/translate";
import { driverLabel, localizeExplanation, localizeServer, amountProblem } from "@/ui/invest/labels";
import type { Driver } from "@/ui/api/types";

const t = (key: string, params?: Record<string, string | number>) => translate("en", key, params);
const tt = t as unknown as Parameters<typeof localizeServer>[0];

describe("Investment texts: English output is exactly what the server sent", () => {
  it("every driver label of the server has a dictionary entry with the same English text", () => {
    for (const { label } of Object.values(LABELS)) expect(driverLabel(tt, label)).toBe(label);
    const fromDict = new Set<string>(Object.values(EN.invest.driver));
    for (const { label } of Object.values(LABELS)) expect(fromDict.has(label)).toBe(true);
  });

  it("factor names match the server's", () => {
    expect(Object.values(EN.invest.factor).sort()).toEqual(Object.values(FACTOR_LABELS).sort());
  });

  it("server sentences (exact and with numbers) come back unchanged in English", () => {
    const samples = [
      "Match score",
      "How closely this selection fits your risk and horizon under Finova's scoring method. It is not a forecast of returns.",
      "Informational only, not personal investment advice. Nothing here is an offer or a recommendation to buy or sell.",
      "Finova executes no trades and connects to no broker.",
      "Selections come from a rules-based method (see methodologyVersion) applied to public data; they are not predictions.",
      "Prices are end-of-day / delayed values from free public sources and may differ from what a broker shows.",
      "Shares can lose value over horizons under 2 years. For a short horizon with low risk tolerance, deposits or bonds are other options to consider. This result is shown for information.",
      "High risk combined with a short horizon means large price swings can occur before the horizon ends.",
      "With less than about $50 the amount is too small to diversify meaningfully.",
      "The underlying data is from 2026-10-12 (6 days old).",
      "The USD/AMD rate could not be refreshed; the last known CBA rate is used.",
      "A single stock is undiversified. In the last year this stock fell as much as 31.2% from a peak and its volatility was 28.4%.",
      "Some inputs were unavailable for AAPL (Low risk); the score uses the remaining factors.",
      "Only 3 holdings were possible for this amount (target 5); the portfolio is less diversified than intended.",
      "Because only whole shares are allocated, 12 higher-priced candidates were skipped for this amount; small amounts favour lower-priced shares.",
      "With 3 holdings a 35% per-position cap cannot hold, so weights are close to equal.",
      "Because only whole shares can be bought, AAPL (35.0%), MSFT (31.2%) ended up above the 30% per-position guide for Medium risk. The target weights stay within it; the difference comes from rounding to whole shares.",
      "To reach 5 holdings, the correlation filter had to be relaxed.",
      "To reach 5 holdings, the sector cap had to be relaxed.",
      "To reach 5 holdings, the correlation filter and sector cap had to be relaxed.",
      "Estimated portfolio volatility (22.1%) is above the 18.0% guide for Low risk.",
      "The benchmark comparison could not be computed from stored prices.",
      "5 holdings for a budget of about $5,000 (methodology rule: 5 holdings at this size, at least $200 per position).",
      "Weights are proportional to each stock's match score divided by its 1-year volatility, limited to 30% per position and at least 5%, then rounded to whole shares (target and actual percentages are both shown).",
      "At most 2 holdings per sector and no pair of holdings with average return correlation above 0.8 where alternatives existed.",
      "No stock in the current universe passes the risk rules for this risk level and horizon.",
      "The amount is smaller than the cheapest eligible share ($152.30).",
      "An amount of at least about 59000 AMD is needed for one share.",
      "Try a higher risk level or a longer horizon.",
      "No combination of eligible stocks fits this amount as whole shares.",
      "Try a larger amount.",
      "No stock fits these inputs.",
      "Recommendation data is not available yet: the universe snapshot has not been built.",
      "7 holdings",
      "Unknown",
      "Something the dictionary does not know.",
    ];
    for (const text of samples) expect(localizeServer(tt, text)).toBe(text);
  });

  it("the sentence that explains a pick is rebuilt from its drivers, identically in English", () => {
    const drivers: Driver[] = [
      { label: "Return on equity", value: "31.0%", rawValue: 0.31, percentile: 97, topPercent: 3 },
      { label: "Pays a dividend", value: "yes", rawValue: 1, percentile: 80, topPercent: 20 },
    ];
    const text = "Return on equity 31.0% (top 3% of eligible stocks) · Pays a dividend. Scoring weights for Low risk and Short horizon: Quality 30%, Low risk 40%, Income 30%.";
    expect(localizeExplanation(tt, text, drivers)).toBe(text);
    // a sentence that does not match the drivers is left as the server sent it
    expect(localizeExplanation(tt, text, [drivers[0]])).toBe(text);
  });

  it("the amount messages keep their English wording", () => {
    expect(amountProblem("")).toBe("Enter the amount you would like to invest.");
    expect(amountProblem("12.5")).toBe("Use whole numbers only.");
    expect(amountProblem("999")).toBe("The amount must be at least 1,000 AMD.");
    expect(amountProblem("1000000001")).toBe("The amount can be at most 1,000,000,000 AMD.");
  });
});
