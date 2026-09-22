import { route, envelope } from "@/lib/route";
import { getNews } from "@/market/news/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/news -> { data:{ items:[6 x {id,title,source,url,publishedAt,region,topic}] }, meta:{asOf,stale,...} } */
export const GET = route({ auth: true }, async () => {
  const { data, meta } = await getNews();
  return envelope(data, meta);
});
