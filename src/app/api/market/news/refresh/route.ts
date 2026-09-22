import { route, envelope } from "@/lib/route";
import { refreshNews } from "@/market/news/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/market/news/refresh -> same shape as GET; 429 RATE_LIMITED if < 30 s since this user's last refresh */
export const POST = route({ auth: true }, async ({ user }) => {
  const { data, meta } = await refreshNews(user!.id);
  return envelope(data, meta);
});
