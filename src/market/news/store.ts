import { and, eq, gte, lt } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { newsItem } from "../schema";
import type { NewsItemDto } from "./select";

/** Persist the last 7 days of candidates so /news/{id} keeps working after a refresh (Change Order 1, 17.2). */
export const NEWS_RETENTION_MS = 7 * 24 * 3_600_000;

export async function persistPool(poolIn: (NewsItemDto & { feedId: string })[], now: Date): Promise<void> {
  const db = await getDb();
  // the same canonical URL can arrive from several feeds; one row per id (an upsert cannot touch a row twice)
  const pool = [...new Map(poolIn.map((p) => [p.id, p])).values()];
  const cutoff = new Date(now.getTime() - NEWS_RETENTION_MS);
  for (let i = 0; i < pool.length; i += 100) {
    const chunk = pool.slice(i, i + 100);
    await db
      .insert(newsItem)
      .values(
        chunk.map((p) => ({
          id: p.id,
          title: p.title,
          source: p.source,
          url: p.url,
          publishedAt: new Date(p.publishedAt),
          region: p.region,
          category: p.category,
          topic: p.topic,
          summary: p.summary,
          imageUrl: p.imageUrl,
          feedId: p.feedId,
          firstSeenAt: now,
          lastSeenAt: now,
        })),
      )
      .onConflictDoUpdate({
        target: newsItem.id,
        set: {
          title: sqlExcluded("title"),
          source: sqlExcluded("source"),
          region: sqlExcluded("region"),
          category: sqlExcluded("category"),
          topic: sqlExcluded("topic"),
          summary: sqlExcluded("summary"),
          imageUrl: sqlExcluded("image_url"),
          // BUG (QA-002): publishedAt was missing here, so a row's timestamp froze at whatever it was on the
          // FIRST insert. A later refresh could pick a different cluster representative (or the raw feed simply
          // updated its own pubDate) with a new publishedAt, and the list would show it - but the stored row, and
          // therefore GET /api/market/news/:id, silently kept the old one. Every field the detail route serves must
          // be refreshed on conflict, not just a subset.
          publishedAt: sqlExcluded("published_at"),
          lastSeenAt: now,
        },
      });
  }
  await db.delete(newsItem).where(lt(newsItem.publishedAt, cutoff));
}

import { sql } from "drizzle-orm";
function sqlExcluded(col: string) {
  return sql.raw(`excluded."${col}"`);
}

export interface NewsDetail extends NewsItemDto {
  /** the original article URL (attribution + link-out are mandatory; no full text is stored) */
  readFullUrl: string;
}

/** Item from the last 7 days by id, else null (unknown or expired -> 404 at the route). */
export async function findNewsItem(id: string, now: Date = new Date()): Promise<NewsDetail | null> {
  if (!/^[0-9a-f]{16}$/.test(id)) return null;
  const db = await getDb();
  const [r] = await db
    .select()
    .from(newsItem)
    .where(and(eq(newsItem.id, id), gte(newsItem.publishedAt, new Date(now.getTime() - NEWS_RETENTION_MS))))
    .limit(1);
  if (!r) return null;
  return {
    id: r.id,
    title: r.title,
    source: r.source,
    url: r.url,
    publishedAt: new Date(r.publishedAt).toISOString(),
    region: r.region as "global" | "armenia",
    topic: r.topic,
    category: r.category,
    summary: r.summary,
    imageUrl: r.imageUrl,
    readFullUrl: r.url,
  };
}
