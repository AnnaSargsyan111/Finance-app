/**
 * Content for the "stock market in numbers" section under the sign-up form. Everything here is a fixed, sourced
 * fact with a date (no live data, nothing that can fail). Each item names its source and links to it.
 *
 * To update a figure, change it here and keep the year in the caption in step; tests/ui/market-facts.test.ts checks that
 * the per-day figure still follows from the yearly one and that every item has a source link.
 */

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

export const STATS: Stat[] = [
  {
    id: "annual",
    value: ANNUAL_TRADED_TRILLIONS,
    decimals: 1,
    prefix: "$",
    suffix: "T",
    label: "Traded on world stock exchanges in a year",
    caption: "Total value of shares traded in 2024",
    source: WFE_TRADING_SOURCE,
  },
  {
    id: "daily",
    value: dailyTradedBillions(),
    decimals: 0,
    prefix: "≈ $",
    suffix: "B",
    label: "Traded on an average trading day",
    caption: `Our calculation: the yearly figure divided by about ${TRADING_DAYS_PER_YEAR} trading days`,
    source: WFE_TRADING_SOURCE,
  },
  {
    id: "high",
    value: 812855,
    decimals: 0,
    prefix: "$",
    label: "Highest price ever for a single share",
    caption: "Berkshire Hathaway Class A, intraday high on 2 May 2025",
    source: { name: "Macrotrends", url: "https://pro.macrotrends.net/stocks/charts/BRK.A/berkshire-hathaway/stock-price-history" },
  },
  {
    id: "crash",
    value: 22.61,
    decimals: 2,
    prefix: "−", // true minus sign
    suffix: "%",
    tone: "neg",
    label: "Biggest one-day crash on record",
    caption: "Dow Jones, 19 October 1987, known as Black Monday (508 points)",
    source: {
      name: "Guinness World Records",
      url: "https://www.guinnessworldrecords.com/world-records/68807-largest-percentage-fall-on-the-dow-jones-industrial-average-in-one-day",
    },
  },
];

export const FACTS: Fact[] = [
  {
    id: "voc",
    tag: "1602 · Amsterdam",
    title: "The first stock market IPO",
    body: "The Dutch East India Company (VOC) was the first company to sell shares to the general public, with a minimum buy-in of 3,000 guilders. At its peak it is estimated to have been worth about $7.9 trillion in today's money, though inflation-adjusted figures like this are debated.",
    source: { name: "Visual Capitalist", url: "https://www.visualcapitalist.com/most-valuable-companies-all-time/" },
  },
  {
    id: "nvidia",
    tag: "October 2025",
    title: "$4 trillion to $5 trillion in 79 trading days",
    body: "On 29 October 2025 Nvidia became the first public company ever to be worth $5 trillion. Its climb from $4 trillion took just 79 trading days.",
    source: { name: "Yahoo Finance", url: "https://finance.yahoo.com/news/nvidia-started-5-trillion-club-172246928.html" },
  },
  {
    id: "growth",
    tag: "2025",
    title: "$23 trillion added in one year",
    body: "World stock markets grew 18.5% in 2025, adding over $23 trillion in value and ending the year worth $151.94 trillion in total.",
    source: WFE_2025_SOURCE,
  },
  {
    id: "ipos",
    tag: "2025",
    title: "1,471 companies went public",
    body: "That is 8.7% more than in 2024, or roughly four new listings every day. Each one followed the path the VOC started in 1602: offering shares to ordinary investors.",
    source: WFE_2025_SOURCE,
  },
];
