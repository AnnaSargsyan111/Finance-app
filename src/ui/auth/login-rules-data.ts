/**
 * Content for the left side of the LOGIN page: two groups of rules of thumb ("If I save, then..." and "If I buy stocks,
 * then..."), each rule with a short why and a source link. Fixed text, nothing fetched.
 *
 * Every figure below was checked against the linked source:
 *  - 50/30/20: needs / wants / savings + debt repayment (Warren & Tyagi, "All Your Worth", via InCharge).
 *  - Save More Tomorrow: 3.5% -> 13.6% of income over 40 months, through the fourth pay raise (Thaler & Benartzi, JPE 2004).
 *  - Safety net: the CFPB gives NO fixed amount or number of months; it says to size it from your own past surprises and that
 *    even a small amount helps. (A "3-6 months" figure is widely repeated but is not the CFPB's, so it is not used here.)
 *  - Diversification and short-term goals: SEC wording.
 *  - Market timing: Schwab Center for Financial Research, 20 years of S&P 500 data ending 2024, $2,000 a year.
 */
import type { Source } from "./market-facts-data";

export interface Rule {
  id: string;
  /** a full first-person sentence, shown bold; the group heading ("If I save, then...") leads into it */
  title: string;
  body: string;
  source: Source;
}

export interface RuleGroup {
  id: string;
  /** the part before the faded "then..." */
  lead: string;
  rules: Rule[];
}

export const RULE_GROUPS: RuleGroup[] = [
  {
    id: "save",
    lead: "If I save, ",
    rules: [
      {
        id: "pay-first",
        title: "I pay myself first.",
        body: "I split take-home pay 50% needs, 30% wants, 20% savings and debts, and move the 20% before I spend.",
        source: { name: "InCharge", url: "https://www.incharge.org/financial-literacy/budgeting-saving/50-30-20-rule/" },
      },
      {
        id: "automate",
        title: "I automate it and grow it with every raise.",
        body: "Savers who committed part of each pay rise went from 3.5% to 13.6% of income in 40 months.",
        source: { name: "Journal of Political Economy, 2004", url: "https://econpapers.repec.org/paper/febnatura/00337.htm" },
      },
      {
        id: "safety-net",
        title: "I start a safety net today, even a small one.",
        body: "I look at past surprises, like a repair or a medical bill, and save enough to cover one.",
        source: { name: "CFPB", url: "https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/" },
      },
    ],
  },
  {
    id: "stocks",
    lead: "If I buy stocks, ",
    rules: [
      {
        id: "diversify",
        title: "I diversify.",
        body: "I spread my money across many investments, which may limit losses without giving up much potential gain.",
        source: { name: "SEC", url: "https://www.sec.gov/about/reports-publications/investorpubsassetallocationhtm" },
      },
      {
        id: "no-timing",
        title: "I invest regularly instead of timing the market.",
        body: "In a 20-year Schwab study, buying at the worst moment every year still ended with $151,343, against $47,357 in cash.",
        source: { name: "Schwab, via Yahoo Finance", url: "https://finance.yahoo.com/news/does-timing-market-actually-charles-130834962.html" },
      },
      {
        id: "money-not-needed",
        title: "I only invest money I won't need soon.",
        body: "The SEC calls a stock-heavy portfolio inappropriate for a short-term goal, like saving for a summer holiday.",
        source: { name: "SEC", url: "https://www.sec.gov/about/reports-publications/investorpubsassetallocationhtm" },
      },
    ],
  },
];
