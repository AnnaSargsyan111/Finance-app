import { APP } from "@/config/app";
import { ApiError } from "@/lib/errors";
import { log } from "@/lib/log";
import { cached, throttle } from "../cache";
import { politeFetch } from "../http";
import { newsConfig, type FeedConfig } from "./config";
import { parseFeed } from "./rss";
import { findNewsItem, persistPool } from "./store";
import { normaliseFeedItems, selectNews, type NewsCandidate, type NewsItemDto, type NewsSelection } from "./select";

/**
 * News service. Users NEVER trigger per-request upstream calls: the selection is stored in market.cache_entry
 * (15 min TTL), refreshed lock-guarded on demand, and served stale (stale:true) when every feed fails.
 * Only headline metadata is kept (title, source, time, link) - no article bodies or images (handover 6.4).
 */
export interface FeedStatus {
  id: string;
  ok: boolean;
  count: number;
  error?: string;
}

interface NewsBlob {
  selectedAt: string;
  items: NewsItemDto[];
  relaxed: string[];
  shortfall?: string;
  counts: NewsSelection["counts"];
  feedStatus: FeedStatus[];
  debug: NewsSelection["debug"];
}

export interface NewsFetchers {
  /** returns raw XML for a feed; default = polite HTTP. Tests inject recorded fixtures. */
  fetchFeed: (feed: FeedConfig) => Promise<string>;
  now: () => Date;
}

const defaultFetchers: NewsFetchers = {
  fetchFeed: async (feed) => {
    const cfg = newsConfig();
    const res = await politeFetch(feed.url, { provider: `rss:${feed.id}`, timeoutMs: cfg.feedTimeoutMs, retries: 0 });
    return res.text();
  },
  now: () => new Date(),
};
let fetchers = defaultFetchers;
export function setNewsFetchers(f: Partial<NewsFetchers> | null): void {
  fetchers = f ? { ...defaultFetchers, ...f } : defaultFetchers;
}

const CACHE_KEY = "news:v1";

export async function buildNewsBlob(): Promise<NewsBlob> {
  const cfg = newsConfig();
  const status: FeedStatus[] = [];
  const candidates: NewsCandidate[] = [];
  // sequential on purpose: polite to publishers (per-host spacing in http.ts) and simple failure isolation
  for (const feed of cfg.feeds.filter((f) => f.enabled)) {
    try {
      const xml = await fetchers.fetchFeed(feed);
      const items = normaliseFeedItems(parseFeed(xml, feed.id), feed, cfg);
      candidates.push(...items);
      status.push({ id: feed.id, ok: true, count: items.length });
    } catch (e) {
      status.push({ id: feed.id, ok: false, count: 0, error: e instanceof Error ? e.message : String(e) });
      log.warn("news feed failed (skipped)", { feed: feed.id, message: e instanceof Error ? e.message : String(e) });
    }
  }
  if (!status.some((s) => s.ok)) {
    // nothing fetched: throw so the cache layer serves the last good six with stale:true
    throw new Error(`All news feeds failed: ${status.map((s) => `${s.id}: ${s.error}`).join(" | ")}`);
  }
  const now = fetchers.now();
  const sel = selectNews(candidates, now, cfg);
  // keep the last 7 days of candidates so /news/{id} works after later refreshes; never fail the refresh over it
  try {
    // the same canonical URL can arrive from several feeds: persist the SELECTED representative last so it wins the upsert
    // (otherwise GET /news/:id could differ from the card in the list in source / summary / image)
    const feedOf = new Map(sel.pool.map((x) => [x.id, x.feedId]));
    await persistPool([...sel.pool, ...sel.items.map((i) => ({ ...i, feedId: feedOf.get(i.id) ?? "unknown" }))], now);
  } catch (e) {
    log.error("news persistence failed", { message: e instanceof Error ? e.message : String(e) });
  }
  return {
    selectedAt: fetchers.now().toISOString(),
    items: sel.items,
    relaxed: sel.relaxed,
    ...(sel.shortfall ? { shortfall: sel.shortfall } : {}),
    counts: sel.counts,
    feedStatus: status,
    debug: sel.debug,
  };
}

export async function getNews(opts: { forceRefresh?: boolean; minAgeMs?: number } = {}) {
  const r = await cached<NewsBlob>(CACHE_KEY, {
    ttlMs: APP.cacheTtl.newsMs,
    fetch: buildNewsBlob,
    forceRefresh: opts.forceRefresh,
    minAgeMs: opts.minAgeMs,
    now: fetchers.now,
  });
  const b = r.value;
  return {
    data: { items: b.items },
    meta: {
      asOf: r.fetchedAt.toISOString(),
      stale: r.stale,
      isFixture: false,
      source: "RSS aggregation (headline + link only)",
      feeds: b.feedStatus.map((f) => ({ id: f.id, ok: f.ok })),
      ...(b.relaxed.length ? { relaxedRules: b.relaxed } : {}),
      ...(b.shortfall ? { note: b.shortfall } : {}),
      ...(r.stale ? { staleReason: r.refreshError ?? "upstream refresh failed" } : {}),
    },
    debug: b.debug,
  };
}

export async function getNewsDetail(id: string) {
  return findNewsItem(id, fetchers.now());
}

/** Manual refresh: throttled per user (1 / 30 s); only re-fetches upstream when the cache is older than 5 minutes. */
export async function refreshNews(userId: string) {
  const gate = await throttle(`news:refresh:user:${userId}`, APP.newsRefreshThrottleMs);
  if (!gate.allowed) {
    throw new ApiError("RATE_LIMITED", 429, "Please wait before refreshing again.", undefined, { retryAfterSeconds: gate.retryAfterSeconds });
  }
  return getNews({ forceRefresh: true, minAgeMs: APP.cacheTtl.newsRefreshMinAgeMs });
}
