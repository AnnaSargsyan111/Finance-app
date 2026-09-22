import { getEnveloped, sendEnveloped } from "./client";
import type { Enveloped, FxHistory, FxRate, NewsDetail, NewsItem, StockHistory, StockItem, StockRange } from "./types";

/** Market endpoints answer `{data, meta}`. All LIVE (see mock-registry). */

export const getFxLatest = (signal?: AbortSignal): Promise<Enveloped<{ rates: FxRate[] }>> => getEnveloped("/api/market/fx/latest", { signal });

export const FX_PERIODS = [
  { id: "1W", days: 7, label: "1W" },
  { id: "1M", days: 30, label: "1M" },
  { id: "3M", days: 90, label: "3M" },
  { id: "6M", days: 180, label: "6M" },
  { id: "1Y", days: 365, label: "1Y" },
] as const;
export type FxPeriodId = (typeof FX_PERIODS)[number]["id"];
export const FX_PAIRS = ["USD/AMD", "EUR/AMD", "GBP/AMD", "RUB/AMD"] as const;

export const getFxHistory = (pair: string, days: number, signal?: AbortSignal): Promise<Enveloped<FxHistory>> =>
  getEnveloped("/api/market/fx/history", { query: { pair, days }, signal });

export const getStocks = (signal?: AbortSignal): Promise<Enveloped<{ items: StockItem[] }>> => getEnveloped("/api/market/stocks", { signal });

export const getStockHistory = (symbol: string, range: StockRange, signal?: AbortSignal): Promise<Enveloped<StockHistory>> =>
  getEnveloped(`/api/market/stocks/${encodeURIComponent(symbol)}/history`, { query: { range }, signal });

/* ------------------------------------------------------------------ news */

const TOPIC_TO_CATEGORY: Record<string, string> = {
  equities: "Markets",
  markets: "Markets",
  economy: "Economy",
  macro: "Economy",
  fx_commodities: "Currencies & Commodities",
  currencies: "Currencies & Commodities",
  commodities: "Currencies & Commodities",
  tech_ai: "Technology",
  technology: "Technology",
  armenia: "Armenia",
  world: "World",
};

/** Tolerant normaliser: older/newer backend builds may omit summary/imageUrl/category. */
export function normaliseNews(raw: Partial<NewsItem> & { id: string; title: string; source: string; url: string; publishedAt: string }): NewsItem {
  const topic = raw.topic ?? "";
  return {
    ...raw,
    category: raw.category ?? TOPIC_TO_CATEGORY[topic] ?? (raw.region === "armenia" ? "Armenia" : "World"),
    summary: raw.summary ?? null,
    imageUrl: raw.imageUrl && /^https:\/\//i.test(raw.imageUrl) ? raw.imageUrl : null,
  };
}

export async function getNews(signal?: AbortSignal): Promise<Enveloped<{ items: NewsItem[] }>> {
  const r = await getEnveloped<{ items: NewsItem[] }>("/api/market/news", { signal });
  return { ...r, data: { items: r.data.items.map(normaliseNews) } };
}

/** 429 RATE_LIMITED carries `retryAfterSeconds` on the ApiError. */
export async function refreshNews(): Promise<Enveloped<{ items: NewsItem[] }>> {
  const r = await sendEnveloped<{ items: NewsItem[] }>("POST", "/api/market/news/refresh");
  return { ...r, data: { items: r.data.items.map(normaliseNews) } };
}

export async function getNewsDetail(id: string, signal?: AbortSignal): Promise<Enveloped<NewsDetail>> {
  const r = await getEnveloped<NewsDetail>(`/api/market/news/${encodeURIComponent(id)}`, { signal });
  const item = normaliseNews(r.data);
  return { ...r, data: { ...item, readFullUrl: r.data.readFullUrl ?? r.data.url } };
}
