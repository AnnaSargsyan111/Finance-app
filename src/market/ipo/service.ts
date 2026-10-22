import { APP } from "@/config/app";
import { isFixtureMode } from "@/lib/env";
import { NotConfiguredError, upstreamUnavailable } from "@/lib/errors";
import { log } from "@/lib/log";
import { addDays, todayIn } from "@/lib/time";
import { cached } from "../cache";
import { finnhub, finnhubMode, type FinnhubIpo } from "../providers/keyed";
import { nasdaqIpo } from "../providers/nasdaq";
import { fetchIpoNews } from "./news";
import { cleanStr, parsePrice } from "./parse";
import type { IpoItem, IpoNewsItem, IpoRaw, IpoStatus } from "./types";

export type { IpoItem, IpoNewsItem, IpoStatus } from "./types";
export { parsePrice } from "./parse";

/**
 * IPO calendar (Market tab "IPOs"): companies that recently went public or plan to. Two sources are merged:
 *   Nasdaq  - its public calendar (price range, shares, deal size, filed / withdrawn lists), no key
 *   Finnhub - the keyed calendar (the key is optional here)
 * Either can fail or be missing; the calendar uses whatever answers and says which sources it used. One refresh per 6 hours serves every
 * visitor (market.cache_entry). A "filed" company has only a filing date, never an IPO date: it is not placed on the calendar.
 */
export interface IpoMeta {
  asOf: string;
  stale: boolean;
  isFixture: boolean;
  source: string;
  /** which sources answered ("nasdaq", "finnhub") */
  sources: string[];
  notConfigured: string[];
  note?: string;
}

/** days back and ahead the list covers */
export const IPO_WINDOW = { back: 21, ahead: 120 } as const;
/** Nasdaq lists deals by month; it only knows a deal's price range and date a few weeks ahead, so four months ahead is plenty */
const NASDAQ_MONTHS_AHEAD = 4;

const STATUSES: IpoStatus[] = ["expected", "filed", "priced", "withdrawn"];
const toStatus = (s: string): IpoStatus => ((STATUSES as string[]).includes(s) ? (s as IpoStatus) : "other");

export const filingsUrl = (name: string) => `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=${encodeURIComponent(name)}&type=424B&dateb=&owner=include&count=40`;

/** a Finnhub row: for "filed" its date is the FILING date, not an IPO date */
export function fromFinnhub(r: FinnhubIpo): IpoRaw {
  const status = toStatus(r.status);
  const p = parsePrice(r.price);
  return {
    source: "finnhub",
    symbol: r.symbol,
    name: r.name,
    exchange: cleanStr(r.exchange),
    status,
    date: status === "filed" ? null : r.date,
    filedDate: status === "filed" ? r.date : null,
    priceLow: p.low,
    priceHigh: p.high,
    shares: r.numberOfShares !== null && r.numberOfShares > 0 ? r.numberOfShares : null,
    dealSizeUsd: r.totalSharesValue !== null && r.totalSharesValue > 0 ? r.totalSharesValue : null,
  };
}

const RANK: Record<IpoStatus, number> = { priced: 4, expected: 3, withdrawn: 2, filed: 1, other: 0 };
const nameKey = (n: string) => n.toLowerCase().replace(/\b(inc|corp|corporation|ltd|limited|plc|holdings?|co|company|the)\b/g, "").replace(/[^a-z0-9]+/g, "");
const companyKey = (r: IpoRaw) => (r.symbol ? `s:${r.symbol.toUpperCase()}` : `n:${nameKey(r.name)}`);

/** which of two rows about the same company is the newer state: the later date, then the further stage (filed < expected < priced) */
function newer(a: IpoRaw, b: IpoRaw): IpoRaw {
  const da = a.date ?? "";
  const db = b.date ?? "";
  if (da !== db) return da > db ? a : b;
  if (RANK[a.status] !== RANK[b.status]) return RANK[a.status] > RANK[b.status] ? a : b;
  return a.source === "nasdaq" ? a : b;
}

/** one row per company; fields the newest row lacks are filled from the others; Nasdaq's wording wins ties */
export function mergeIpos(rows: IpoRaw[]): IpoItem[] {
  const groups = new Map<string, IpoRaw[]>();
  for (const r of rows) {
    const k = companyKey(r);
    groups.set(k, [...(groups.get(k) ?? []), r]);
  }
  const out: IpoItem[] = [];
  for (const list of groups.values()) {
    const best = list.reduce(newer);
    const rest = list.filter((r) => r !== best).sort((a, b) => (a.source === "nasdaq" ? -1 : 1) - (b.source === "nasdaq" ? -1 : 1));
    const pick = <K extends keyof IpoRaw>(k: K): IpoRaw[K] => (best[k] ?? rest.find((r) => r[k] !== null && r[k] !== undefined)?.[k] ?? best[k]) as IpoRaw[K];
    const priceFrom = best.priceLow !== null ? best : (rest.find((r) => r.priceLow !== null) ?? best);
    out.push({
      date: best.date,
      filedDate: pick("filedDate"),
      name: best.name,
      symbol: pick("symbol"),
      exchange: pick("exchange"),
      status: best.status,
      priceLow: priceFrom.priceLow,
      priceHigh: priceFrom.priceHigh,
      shares: pick("shares"),
      dealSizeUsd: pick("dealSizeUsd"),
      filingsUrl: filingsUrl(best.name),
    });
  }
  return out.sort((a, b) => ((a.date ?? a.filedDate ?? "") < (b.date ?? b.filedDate ?? "") ? -1 : 1));
}

interface IpoBlob {
  isFixture: boolean;
  sources: string[];
  items: IpoItem[];
}

const today = () => todayIn(); // the Yerevan calendar day, like the rest of the app

function months(from: string, to: string): string[] {
  const out: string[] = [];
  let [y, m] = from.slice(0, 7).split("-").map(Number);
  const end = to.slice(0, 7);
  for (;;) {
    const ym = `${y}-${String(m).padStart(2, "0")}`;
    out.push(ym);
    if (ym >= end) break;
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
  }
  return out;
}

async function fetchCalendar(): Promise<IpoBlob> {
  const fixture = isFixtureMode();
  const from = addDays(today(), -IPO_WINDOW.back);
  const to = addDays(today(), IPO_WINDOW.ahead);
  const nasdaqTo = addDays(today(), NASDAQ_MONTHS_AHEAD * 31);
  const nasdaqMonths = fixture ? ["2026-10", "2026-11"] : months(from, nasdaqTo);

  const [nas, fin] = await Promise.allSettled([
    Promise.all(nasdaqMonths.map((m) => nasdaqIpo.month(m))).then((l) => l.flat()),
    finnhub.ipoCalendar(from, to).then((l) => l.map(fromFinnhub)),
  ]);
  const sources: string[] = [];
  const rows: IpoRaw[] = [];
  if (nas.status === "fulfilled") {
    sources.push("nasdaq");
    rows.push(...nas.value);
  } else log.warn("nasdaq ipo calendar failed", { message: nas.reason instanceof Error ? nas.reason.message : String(nas.reason) });
  if (fin.status === "fulfilled") {
    sources.push("finnhub");
    rows.push(...(fixture ? fin.value : fin.value.filter((r) => (r.date ?? r.filedDate ?? "") >= from && (r.date ?? r.filedDate ?? "") <= to)));
  } else if (!(fin.reason instanceof NotConfiguredError)) log.warn("finnhub ipo calendar failed", { message: fin.reason instanceof Error ? fin.reason.message : String(fin.reason) });
  if (sources.length === 0) {
    const why = nas.status === "rejected" ? String(nas.reason instanceof Error ? nas.reason.message : nas.reason) : "no IPO source answered";
    throw new Error(`No IPO source answered: ${why}`);
  }
  return { isFixture: fixture, sources, items: mergeIpos(rows) };
}

/** an "expected" deal whose pricing date has passed by more than a day is out of date: the data source has not updated it */
export function dropOutdated(items: IpoItem[], day: string): IpoItem[] {
  const cutoff = addDays(day, -1);
  return items.filter((i) => !(i.status === "expected" && i.date !== null && i.date < cutoff));
}

export async function getIpoCalendar(): Promise<{ data: { items: IpoItem[]; news: IpoNewsItem[] }; meta: IpoMeta }> {
  let cal;
  try {
    cal = await cached<IpoBlob>("ipo:calendar:v2", { ttlMs: APP.cacheTtl.ipoCalendarMs, swrMaxAgeMs: APP.cacheTtl.stockSlowSwrMs, fetch: fetchCalendar });
  } catch (e) {
    log.warn("ipo calendar unavailable", { message: e instanceof Error ? e.message : String(e) });
    throw e instanceof Error && "status" in e ? e : upstreamUnavailable("The IPO calendar is temporarily unavailable.");
  }
  // headlines are a bonus: they have their own cache and never make the calendar fail
  let news: IpoNewsItem[] = [];
  try {
    news = (await cached<IpoNewsItem[]>("ipo:news:v1", { ttlMs: APP.cacheTtl.ipoNewsMs, swrMaxAgeMs: APP.cacheTtl.newsSwrMs, fetch: () => fetchIpoNews() })).value;
  } catch (e) {
    log.warn("ipo news unavailable", { message: e instanceof Error ? e.message : String(e) });
  }
  const r = cal;
  const notConfigured = finnhubMode() === "notConfigured" ? ["finnhub"] : [];
  return {
    data: { items: dropOutdated(r.value.items, today()), news },
    meta: {
      asOf: r.fetchedAt.toISOString(),
      stale: r.stale,
      isFixture: r.value.isFixture,
      source: r.value.isFixture ? "fixture:nasdaq + finnhub (SYNTHETIC test data)" : r.value.sources.map((s) => (s === "nasdaq" ? "Nasdaq" : "Finnhub")).join(" + "),
      sources: r.value.sources,
      notConfigured,
      ...(r.stale ? { note: `Upstream refresh failed; showing the last good value.${r.refreshError ? ` (${r.refreshError})` : ""}` } : {}),
    },
  };
}
