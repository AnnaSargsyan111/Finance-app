/**
 * Content for the "stock market in numbers" section under the sign-up form. Everything here is a fixed, sourced
 * fact with a date (no live data, nothing that can fail). Each item names its source and links to it.
 *
 * To update a figure, change it here and keep the year in the caption (dictionary: auth.marketFacts) in step; tests/ui/market-facts.test.ts checks that
 * the per-day figure still follows from the yearly one and that every item has a source link.
 */
import { tg } from "../i18n/translate";

export interface Source {
  name: string;
  url: string;
}

export interface Stat {
  id: string;
  value: number;
  decimals: number;
  prefix?: string;
  suffix?: string;
  /** "neg" colours the figure with the app's negative colour (always shown with a minus sign) */
  tone?: "neg";
  label: string;
  caption: string;
  source: Source;
}

export interface Fact {
  id: string;
  tag: string;
  title: string;
  body: string;
  source: Source;
}

export const WFE_TRADING_SOURCE: Source = {
  name: "World Federation of Exchanges",
  url: "https://focus.world-exchanges.org/statistics/articles/trends-value-share-trading-through-electronic-order-books-eob",
};
export const WFE_2025_SOURCE: Source = {
  name: "World Federation of Exchanges",
  url: "https://www.world-exchanges.org/news/articles/new-wfe-data-public-markets-post-strong-growth-2025-despite-geopolitical-instability",
};

/** value of shares traded on WFE member exchanges through electronic order books in 2024, USD trillions */
export const ANNUAL_TRADED_TRILLIONS = 148.48;
/** trading days in a typical year, used for the per-day figure (a calculation, not a reported number) */
export const TRADING_DAYS_PER_YEAR = 252;
/** average value traded per trading day, USD billions */
export const dailyTradedBillions = (): number => Math.round((ANNUAL_TRADED_TRILLIONS * 1000) / TRADING_DAYS_PER_YEAR);

/*
 * The texts (label, caption, tag, title, body) are read from the English/Armenian dictionary (auth.marketFacts) through getters,
 * so they follow the chosen language; ids, figures and sources (names and links) stay here.
 */
export const STATS: Stat[] = [
  {
    id: "annual",
    value: ANNUAL_TRADED_TRILLIONS,
    decimals: 1,
    prefix: "$",
    get suffix() {
      return tg("auth.marketFacts.trillionSuffix");
    },
    get label() {
      return tg("auth.marketFacts.stats.annual.label");
    },
    get caption() {
      return tg("auth.marketFacts.stats.annual.caption");
    },
    source: WFE_TRADING_SOURCE,
  },
  {
    id: "daily",
    value: dailyTradedBillions(),
    decimals: 0,
    prefix: "≈ $",
    get suffix() {
      return tg("auth.marketFacts.billionSuffix");
    },
    get label() {
      return tg("auth.marketFacts.stats.daily.label");
    },
    get caption() {
      return tg("auth.marketFacts.stats.daily.caption", { days: TRADING_DAYS_PER_YEAR });
    },
    source: WFE_TRADING_SOURCE,
  },
  {
    id: "high",
    value: 812855,
    decimals: 0,
    prefix: "$",
    get label() {
      return tg("auth.marketFacts.stats.high.label");
    },
    get caption() {
      return tg("auth.marketFacts.stats.high.caption");
    },
    source: { name: "Macrotrends", url: "https://pro.macrotrends.net/stocks/charts/BRK.A/berkshire-hathaway/stock-price-history" },
  },
  {
    id: "crash",
    value: 22.61,
    decimals: 2,
    prefix: "−", // true minus sign
    suffix: "%",
    tone: "neg",
    get label() {
      return tg("auth.marketFacts.stats.crash.label");
    },
    get caption() {
      return tg("auth.marketFacts.stats.crash.caption");
    },
    source: {
      name: "Guinness World Records",
      url: "https://www.guinnessworldrecords.com/world-records/68807-largest-percentage-fall-on-the-dow-jones-industrial-average-in-one-day",
    },
  },
];

export const FACTS: Fact[] = [
  {
    id: "voc",
    get tag() {
      return tg("auth.marketFacts.facts.voc.tag");
    },
    get title() {
      return tg("auth.marketFacts.facts.voc.title");
    },
    get body() {
      return tg("auth.marketFacts.facts.voc.body");
    },
    source: { name: "Visual Capitalist", url: "https://www.visualcapitalist.com/most-valuable-companies-all-time/" },
  },
  {
    id: "nvidia",
    get tag() {
      return tg("auth.marketFacts.facts.nvidia.tag");
    },
    get title() {
      return tg("auth.marketFacts.facts.nvidia.title");
    },
    get body() {
      return tg("auth.marketFacts.facts.nvidia.body");
    },
    source: { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/nvidia-started-5-trillion-club-172246928.html" },
  },
  {
    id: "growth",
    get tag() {
      return tg("auth.marketFacts.facts.growth.tag");
    },
    get title() {
      return tg("auth.marketFacts.facts.growth.title");
    },
    get body() {
      return tg("auth.marketFacts.facts.growth.body");
    },
    source: WFE_2025_SOURCE,
  },
  {
    id: "ipos",
    get tag() {
      return tg("auth.marketFacts.facts.ipos.tag");
    },
    get title() {
      return tg("auth.marketFacts.facts.ipos.title");
    },
    get body() {
      return tg("auth.marketFacts.facts.ipos.body");
    },
    source: WFE_2025_SOURCE,
  },
];
