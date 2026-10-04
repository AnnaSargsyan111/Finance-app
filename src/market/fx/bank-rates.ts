import { APP } from "@/config/app";
import { UpstreamError } from "@/lib/errors";
import { normaliseDecimal } from "@/lib/money";
import { cached } from "../cache";
import { fetchText } from "../http";

/**
 * Commercial-bank buy/sell rates (what a bank pays / charges), cash and non-cash, for the three banks we show.
 * Source: the public Rate.am banks page (https://www.rate.am), which collects each bank's own board. Rate.am has no public API,
 * so the numbers are read from the data embedded in the page (a Next.js "flight" payload). That layout can change without notice,
 * so every step is validated and anything unexpected is an upstream error: the UI then shows "not available" and never a
 * half-wrong number. One fetch per cache TTL serves every user. These are indicative retail rates, NOT the CBA reference rate,
 * and there is no history for them.
 *
 * Boards: Rate.am's "Cash" tab = the CASH board; its "Non-cash" tab = the CLEARING (transfer) board (checked against the page).
 * The separate CARD board is not used.
 */
const ENDPOINT = "https://www.rate.am/en/armenian-dram-exchange-rates/banks";
const PROVIDER = "Rate.am";

export const BANK_RATES_ATTRIBUTION = { name: "Rate.am", url: "https://www.rate.am" } as const;

/** the banks we show, with the key Rate.am uses for each */
const BANKS = [
  { id: "ameriabank", code: "ameriabank", name: "Ameriabank" },
  { id: "acba", code: "acba-bank", name: "ACBA Bank" },
  { id: "idbank", code: "aydi-bank", name: "IDBank" },
] as const;

/** our currency -> Rate.am's code (it writes the rouble as RUR) */
const SOURCE_ISO: Record<string, string> = { USD: "USD", EUR: "EUR", GEL: "GEL", RUB: "RUR" };

export interface BankRate {
  /** "USD/AMD" - the same pair names as the CBA rates */
  pair: string;
  buy: string;
  sell: string;
}
export interface BankRates {
  id: string;
  name: string;
  /** when the source last read the bank's board (ISO timestamp) or null */
  capturedAt: string | null;
  cash: BankRate[];
  nonCash: BankRate[];
}

/* ------------------------------------------------------------------ reading the page payload */

type Json = unknown;

/** The page ships its data as lines `<hex id>:<json>` inside self.__next_f.push([1,"..."]) calls; values refer to each other as "$<hex id>". */
function readChunks(html: string): Map<string, string> {
  const re = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let text = "";
  for (let m = re.exec(html); m; m = re.exec(html)) {
    try {
      text += JSON.parse(m[1]) as string;
    } catch {
      /* a malformed push is skipped; missing data is caught below */
    }
  }
  const chunks = new Map<string, string>();
  for (const line of text.split("\n")) {
    const m = /^([0-9a-f]+):(.*)$/.exec(line);
    if (m) chunks.set(m[1], m[2]);
  }
  return chunks;
}

function resolveRefs(chunks: Map<string, string>, v: Json, depth = 0): Json {
  if (depth > 12) return v;
  if (typeof v === "string") {
    const m = /^\$([0-9a-f]+)$/.exec(v);
    if (m && chunks.has(m[1])) {
      try {
        return resolveRefs(chunks, JSON.parse(chunks.get(m[1])!), depth + 1);
      } catch {
        return v;
      }
    }
    return v;
  }
  if (Array.isArray(v)) return v.map((x) => resolveRefs(chunks, x, depth + 1));
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, resolveRefs(chunks, x, depth + 1)]));
  return v;
}

const isObj = (v: Json): v is Record<string, Json> => !!v && typeof v === "object" && !Array.isArray(v);

function boardRates(rates: Record<string, Json>, board: "CASH" | "CLEARING"): BankRate[] {
  const out: BankRate[] = [];
  for (const iso of APP.fx.currencies) {
    const b = (rates[SOURCE_ISO[iso]] as Record<string, Json> | undefined)?.[board];
    if (!isObj(b)) continue;
    const buy = Number(b.buy);
    const sell = Number(b.sell);
    // a bank that does not quote a currency on a board publishes empty strings: leave that currency out
    if (typeof b.buy !== "string" || typeof b.sell !== "string" || !(buy > 0) || !(sell > 0) || !Number.isFinite(buy) || !Number.isFinite(sell)) continue;
    out.push({ pair: `${iso}/AMD`, buy: normaliseDecimal(String(buy), 2), sell: normaliseDecimal(String(sell), 2) });
  }
  return out;
}

/** Exported for tests. Throws UpstreamError when the page does not have the shape we rely on. */
export function parseBankRates(html: string): BankRates[] {
  const chunks = readChunks(html);
  if (chunks.size === 0) throw new UpstreamError(PROVIDER, `${PROVIDER} page has an unexpected format (no data payload)`);
  // the chunk that maps a bank key to {lastUpdated, rates}; another chunk maps the same keys to organisation details (no `rates`)
  let boardsByBank: Record<string, Json> | null = null;
  for (const raw of chunks.values()) {
    if (!BANKS.some((b) => raw.includes(`"${b.code}"`))) continue;
    let parsed: Json;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }
    if (!isObj(parsed)) continue;
    const first = BANKS.map((b) => parsed[b.code]).find((x) => typeof x === "string");
    const probe = first ? resolveRefs(chunks, first) : null;
    if (isObj(probe) && isObj(probe.rates)) {
      boardsByBank = parsed;
      break;
    }
  }
  if (!boardsByBank) throw new UpstreamError(PROVIDER, `${PROVIDER} page has an unexpected format (bank rates not found)`);

  const out: BankRates[] = [];
  for (const b of BANKS) {
    const entry = boardsByBank[b.code];
    if (entry === undefined) continue;
    const r = resolveRefs(chunks, entry);
    if (!isObj(r) || !isObj(r.rates)) continue;
    const cash = boardRates(r.rates, "CASH");
    const nonCash = boardRates(r.rates, "CLEARING");
    if (cash.length === 0 && nonCash.length === 0) continue;
    const t = typeof r.lastUpdated === "number" ? new Date(r.lastUpdated) : null;
    out.push({ id: b.id, name: b.name, capturedAt: t && !Number.isNaN(t.getTime()) ? t.toISOString() : null, cash, nonCash });
  }
  if (out.length === 0) throw new UpstreamError(PROVIDER, `${PROVIDER} returned no usable bank rates`);
  return out;
}

/** One live read and parse of the page, without the cache: what the data monitor uses, so a failure carries its real cause. */
export async function fetchBankRates(): Promise<BankRates[]> {
  return parseBankRates(await fetchText(ENDPOINT, { provider: PROVIDER, timeoutMs: 20_000, headers: { accept: "text/html" } }));
}

/** One upstream call per TTL for every user; a failing source serves the last good value flagged stale. */
export async function getBankRates(opts: { forceRefresh?: boolean } = {}) {
  const r = await cached<BankRates[]>("fx:banks:v2", { ttlMs: APP.cacheTtl.fxBanksMs, fetch: fetchBankRates, forceRefresh: opts.forceRefresh });
  return {
    data: { banks: r.value, attribution: BANK_RATES_ATTRIBUTION },
    meta: {
      asOf: r.fetchedAt.toISOString(),
      source: "Bank rate boards via Rate.am (indicative, not the CBA reference rate)",
      stale: r.stale,
      isFixture: false as const,
      ...(r.stale ? { note: `Upstream refresh failed; showing the last good value. ${r.refreshError ?? ""}`.trim() } : {}),
    },
  };
}
