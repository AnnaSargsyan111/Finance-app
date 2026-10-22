/**
 * The IPO calendar's shared types. Dates are plain "YYYY-MM-DD" strings.
 *  expected  - the company has a price range and an expected pricing date
 *  filed     - the company has filed its paperwork; it has NO IPO date yet (only the filing date)
 *  priced    - the price is set; `date` is the pricing date
 *  withdrawn - the company called the IPO off; `date` is the withdrawal date
 */
export type IpoStatus = "expected" | "filed" | "priced" | "withdrawn" | "other";

/** one row from one data source, before the sources are merged */
export interface IpoRaw {
  source: "nasdaq" | "finnhub";
  symbol: string | null;
  name: string;
  exchange: string | null;
  status: IpoStatus;
  /** expected / actual pricing date, or the withdrawal date; null for `filed` */
  date: string | null;
  /** when the paperwork was filed (known for `filed`, sometimes for the others) */
  filedDate: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  shares: number | null;
  /** total value of the shares offered, USD */
  dealSizeUsd: number | null;
}

export interface IpoItem {
  date: string | null;
  filedDate: string | null;
  name: string;
  symbol: string | null;
  exchange: string | null;
  status: IpoStatus;
  priceLow: number | null;
  priceHigh: number | null;
  shares: number | null;
  dealSizeUsd: number | null;
  /** the company's filings on SEC EDGAR (S-1 / prospectus) */
  filingsUrl: string;
}

/** a recent headline about a company's IPO plans (headline and link only) */
export interface IpoNewsItem {
  title: string;
  url: string;
  outlet: string | null;
  publishedAt: string;
}
