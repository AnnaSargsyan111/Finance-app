import { route, envelope } from "@/lib/route";
import { getIpoCalendar } from "@/market/ipo/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/ipo -> { items: [recent and upcoming IPOs, soonest first] }; meta.notConfigured lists a missing data source */
export const GET = route({ auth: true }, async () => {
  const { data, meta } = await getIpoCalendar();
  return envelope(data, meta as unknown as Record<string, unknown>);
});
