import { route, envelope } from "@/lib/route";
import { getNewsDetail } from "@/market/news/service";
import { notFound } from "@/lib/errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/news/:id -> { data: { ...card fields, readFullUrl }, meta }
 * Ids of the last 7 days keep working after a refresh; unknown/expired -> 404 NOT_FOUND.
 * "Article summary" is the feed summary only - no article text is scraped or stored.
 */
export const GET = route<{ id: string }>({ auth: true }, async ({ params }) => {
  const item = await getNewsDetail(params.id);
  if (!item) throw notFound("Article");
  return envelope(item, { asOf: new Date().toISOString(), stale: false, isFixture: false, source: item.source });
});
