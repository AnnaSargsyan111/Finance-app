/**
 * One short plain-language line for each number on a stock card (the "i" next to it). Kept to about two lines in the popover,
 * and deliberately free of advice: it says what the number is, not whether it is good.
 */
export const STOCK_METRIC_INFO = {
  previousClose: { title: "Previous close", text: "The price at the end of the last trading day. The change shown on the card is measured against it." },
  range52w: { title: "52-week range", text: "The lowest and highest price over the past year. It shows how far the price has moved." },
  marketCap: { title: "Market cap", text: "The company's total value on the market: share price times the number of shares." },
  pe: { title: "P/E (TTM)", text: "Share price divided by earnings per share over 12 months: what you pay for $1 of profit." },
  eps: { title: "EPS (TTM)", text: "Earnings per share: the company's profit over the last 12 months divided by its number of shares." },
  dividendYield: { title: "Dividend yield", text: "The yearly dividend as a share of the price. A dash means none is paid, or no data." },
} as const;

export type StockMetricKey = keyof typeof STOCK_METRIC_INFO;
