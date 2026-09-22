import { route, envelope } from "@/lib/route";
import { getFxLatest } from "@/market/fx/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/fx/latest -> { data:{ rates:[{pair,rate,diff,sourceDate} x4] }, meta:{asOf,source,stale,...} } */
export const GET = route({ auth: true }, async () => {
  const { data, meta } = await getFxLatest();
  return envelope(data, meta as unknown as Record<string, unknown>);
});
