/**
 * Content for the left side of the LOGIN page: two groups of rules of thumb ("If I save, then..." and "If I buy stocks,
 * then..."), each rule with a short why and a source link. Fixed text, nothing fetched. The texts live in the English dictionary
 * (src/ui/i18n/dict/auth.en.ts, auth.loginRules) and are read through getters, so they follow the chosen language; the sources
 * (names and links) stay here.
 *
 * Every figure below was checked against the linked source:
 *  - 50/30/20: needs / wants / savings + debt repayment (Warren & Tyagi, "All Your Worth", via InCharge).
 *  - Save More Tomorrow: 3.5% -> 13.6% of income over 40 months, through the fourth pay raise (Thaler & Benartzi, JPE 2004).
 *  - Safety net: the CFPB gives NO fixed amount or number of months; it says to size it from your own past surprises and that
 *    even a small amount helps. (A "3-6 months" figure is widely repeated but is not the CFPB's, so it is not used here.)
 *  - Diversification and short-term goals: SEC wording.
 *  - Market timing: Schwab Center for Financial Research, 20 years of S&P 500 data ending 2024, $2,000 a year.
 */
import { tg } from "../i18n/translate";
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
    get lead() {
      return tg("auth.loginRules.save.lead");
    },
    rules: [
      {
        id: "pay-first",
        get title() {
          return tg("auth.loginRules.save.payFirst.title");
        },
        get body() {
          return tg("auth.loginRules.save.payFirst.body");
        },
        source: { name: "InCharge", url: "https://www.incharge.org/financial-literacy/budgeting-saving/50-30-20-rule/" },
      },
      {
        id: "automate",
        get title() {
          return tg("auth.loginRules.save.automate.title");
        },
        get body() {
          return tg("auth.loginRules.save.automate.body");
        },
        source: { name: "Journal of Political Economy, 2004", url: "https://econpapers.repec.org/paper/febnatura/00337.htm" },
      },
      {
        id: "safety-net",
        get title() {
          return tg("auth.loginRules.save.safetyNet.title");
        },
        get body() {
          return tg("auth.loginRules.save.safetyNet.body");
        },
        source: { name: "CFPB", url: "https://www.consumerfinance.gov/an-essential-guide-to-building-an-emergency-fund/" },
      },
    ],
  },
  {
    id: "stocks",
    get lead() {
      return tg("auth.loginRules.stocks.lead");
    },
    rules: [
      {
        id: "diversify",
        get title() {
          return tg("auth.loginRules.stocks.diversify.title");
        },
        get body() {
          return tg("auth.loginRules.stocks.diversify.body");
        },
        source: { name: "SEC", url: "https://www.sec.gov/about/reports-publications/investorpubsassetallocationhtm" },
      },
      {
        id: "no-timing",
        get title() {
          return tg("auth.loginRules.stocks.noTiming.title");
        },
        get body() {
          return tg("auth.loginRules.stocks.noTiming.body");
        },
        source: { name: "Schwab, via Yahoo Finance", url: "https://finance.yahoo.com/news/does-timing-market-actually-charles-130834962.html" },
      },
      {
        id: "money-not-needed",
        get title() {
          return tg("auth.loginRules.stocks.moneyNotNeeded.title");
        },
        get body() {
          return tg("auth.loginRules.stocks.moneyNotNeeded.body");
        },
        source: { name: "SEC", url: "https://www.sec.gov/about/reports-publications/investorpubsassetallocationhtm" },
      },
    ],
  },
];
