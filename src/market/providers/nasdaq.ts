import fs from "node:fs";
import path from "node:path";
import { isFixtureMode } from "@/lib/env";
import { UpstreamError } from "@/lib/errors";
import { fetchJson } from "../http";
import type { IpoRaw } from "../ipo/types";
import { cleanStr, parseAmount, parsePrice, usDateToIso } from "../ipo/parse";

/**
 * Nasdaq's public IPO calendar (https://www.nasdaq.com/market-activity/ipos), the JSON the page itself reads. It is NOT an official API:
 * no key, no published terms or guarantees, so the calendar treats it as one source among two and keeps working without it.
 * One call per month answers with four lists: priced, upcoming (price range and expected date), filed (paperwork only) and withdrawn.
 */
type Row = Record<string, unknown>;

const rowsOf = (v: unknown): Row[] => (Array.isArray((v as { rows?: unknown })?.rows) ? ((v as { rows: Row[] }).rows) : []);

const base = (r: Row, status: IpoRaw["status"]): IpoRaw | null => {
  const name = cleanStr(r.companyName);
  if (!name) return null;
  const price = parsePrice(typeof r.proposedSharePrice === "string" ? r.proposedSharePrice : "");
  return {
    source: "nasdaq",
    symbol: cleanStr(r.proposedTickerSymbol),
    name,
    exchange: cleanStr(r.proposedExchange),
    status,
    date: null,
    filedDate: usDateToIso(r.filedDate),
    priceLow: price.low,
    priceHigh: price.high,
    shares: parseAmount(r.sharesOffered),
    dealSizeUsd: parseAmount(r.dollarValueOfSharesOffered),
  };
};

/** the answer of one month -> rows; a month with no deals ("No record found") gives an empty list */
export function parseNasdaqMonth(json: unknown): IpoRaw[] {
  const d = (json as { data?: Record<string, unknown> } | null)?.data;
  if (!d || typeof d !== "object") throw new UpstreamError("nasdaq", "nasdaq: unexpected answer");
  const out: IpoRaw[] = [];
  const add = (r: Row, status: IpoRaw["status"], date: unknown) => {
    const x = base(r, status);
    if (!x) return;
    x.date = status === "filed" ? null : usDateToIso(date);
    // a deal that is neither filed nor dated cannot be placed on a calendar
    if (status !== "filed" && !x.date) return;
    out.push(x);
  };
  for (const r of rowsOf(d.priced)) add(r, "priced", r.pricedDate);
  for (const r of rowsOf((d.upcoming as { upcomingTable?: unknown } | undefined)?.upcomingTable)) add(r, "expected", r.expectedPriceDate);
  for (const r of rowsOf(d.filed)) add(r, "filed", null);
  for (const r of rowsOf(d.withdrawn)) add(r, "withdrawn", r.withdrawDate);
  return out;
}

export const nasdaqIpo = {
  name: "nasdaq" as const,
  /** one month, "YYYY-MM" */
  async month(ym: string): Promise<IpoRaw[]> {
    if (isFixtureMode()) {
      // the fixture holds one synthetic month; other months are empty
      const file = path.join(process.cwd(), "tests", "fixtures", "providers", "nasdaq", `ipo_${ym}.json`);
      if (!fs.existsSync(file)) return [];
      return parseNasdaqMonth(JSON.parse(fs.readFileSync(file, "utf8")));
    }
    const json = await fetchJson<unknown>(`https://api.nasdaq.com/api/ipo/calendar?date=${ym}`, {
      provider: "nasdaq",
      timeoutMs: 10_000,
      retries: 1,
      headers: { origin: "https://www.nasdaq.com", referer: "https://www.nasdaq.com/" },
    });
    return parseNasdaqMonth(json);
  },
};
