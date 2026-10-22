import { APP } from "@/config/app";
import { isFixtureMode } from "@/lib/env";
import { NotConfiguredError } from "@/lib/errors";
import { log } from "@/lib/log";
import { addDays } from "@/lib/time";
import { cached } from "../cache";
import { finnhub, finnhubMode, type FinnhubIpo } from "../providers/keyed";

/**
 * IPO calendar (Market tab "IPOs"): companies that recently went public or plan to, from Finnhub's IPO calendar.
 * One upstream call per cache window serves every visitor (market.cache_entry, 6 hours); when Finnhub fails the last good list is
 * served flagged stale. Dates, prices and sizes are the provider's expectations and change until the deal prices.
 */
export type IpoStatus = "expected" | "filed" | "priced" | "withdrawn" | "other";

export interface IpoItem {
  /** the planned or actual pricing date, YYYY-MM-DD */
  date: string;
  name: string;
  symbol: string | null;
  exchange: string | null;
  status: IpoStatus;
  /** the offer price, or the low and high of the range; null when none is published yet */
  priceLow: number | null;
  priceHigh: number | null;
  shares: number | null;
  /** total value of the shares offered, USD */
  dealSizeUsd: number | null;
  /** the company's filings on SEC EDGAR (S-1 / prospectus) */
  filingsUrl: string;
}

export interface IpoMeta {
  asOf: string;
  stale: boolean;
  isFixture: boolean;
  source: string;
  notConfigured: string[];
  note?: string;
}

/** days back and ahead the list covers */
export const IPO_WINDOW = { back: 21, ahead: 120 } as const;

const STATUSES: IpoStatus[] = ["expected", "filed", "priced", "withdrawn"];
const toStatus = (s: string): IpoStatus => ((STATUSES as string[]).includes(s) ? (s as IpoStatus) : "other");

/** "16.00-18.00", "$16.00 - $18.00", "17" or "" -> low and high (equal for a single price) */
export function parsePrice(text: string): { low: number | null; high: number | null } {
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (nums.length === 0) return { low: null, high: null };
  const low = Math.min(nums[0], nums[nums.length - 1]);
  const high = Math.max(nums[0], nums[nums.length - 1]);
  return { low, high };
}

export const filingsUrl = (name: string) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=424B&dateb=&owner=include&count=40`;

export function normaliseIpos(rows: FinnhubIpo[]): IpoItem[] {
  const seen = new Set<string>();
  const out: IpoItem[] = [];
  for (const r of rows) {
    const key = `${r.symbol ?? r.name.toLowerCase()}|${r.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const p = parsePrice(r.price);
    out.push({
      date: r.date,
      name: r.name,
      symbol: r.symbol,
      exchange: r.exchange,
      status: toStatus(r.status),
      priceLow: p.low,
      priceHigh: p.high,
      shares: r.numberOfShares !== null && r.numberOfShares > 0 ? r.numberOfShares : null,
      dealSizeUsd: r.totalSharesValue !== null && r.totalSharesValue > 0 ? r.totalSharesValue : null,
      filingsUrl: filingsUrl(r.name),
    });
  }
  return out.sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.name.localeCompare(b.name)));
}

interface IpoBlob {
  source: string;
  isFixture: boolean;
  items: IpoItem[];
}

const today = () => new Date().toISOString().slice(0, 10);

async function fetchIpos(): Promise<IpoBlob> {
  const fixture = isFixtureMode();
  const from = addDays(today(), -IPO_WINDOW.back);
  const to = addDays(today(), IPO_WINDOW.ahead);
  const rows = await finnhub.ipoCalendar(from, to);
  // the fixture file is a fixed list, so the date window does not apply to it
  const inWindow = fixture ? rows : rows.filter((r) => r.date >= from && r.date <= to);
  return { source: fixture ? "fixture:finnhub (SYNTHETIC test data)" : "Finnhub", isFixture: fixture, items: normaliseIpos(inWindow) };
}

export async function getIpoCalendar(): Promise<{ data: { items: IpoItem[] }; meta: IpoMeta }> {
  if (finnhubMode() === "notConfigured") {
    return { data: { items: [] }, meta: { asOf: new Date().toISOString(), stale: false, isFixture: false, source: "Finnhub", notConfigured: ["finnhub"], note: "The IPO data source is not configured." } };
  }
  try {
    const r = await cached<IpoBlob>("ipo:calendar:v1", { ttlMs: APP.cacheTtl.ipoCalendarMs, swrMaxAgeMs: APP.cacheTtl.stockSlowSwrMs, fetch: fetchIpos });
    return {
      data: { items: r.value.items },
      meta: {
        asOf: r.fetchedAt.toISOString(),
        stale: r.stale,
        isFixture: r.value.isFixture,
        source: r.value.source,
        notConfigured: [],
        ...(r.stale ? { note: `Upstream refresh failed; showing the last good value.${r.refreshError ? ` (${r.refreshError})` : ""}` } : {}),
      },
    };
  } catch (e) {
    if (e instanceof NotConfiguredError) throw e;
    log.warn("ipo calendar unavailable", { message: e instanceof Error ? e.message : String(e) });
    throw e;
  }
}
