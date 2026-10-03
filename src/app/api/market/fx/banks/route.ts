import { route, envelope } from "@/lib/route";
import { getBankRates } from "@/market/fx/bank-rates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/fx/banks -> { data:{ banks:[{id,name,capturedAt,cash:[{pair,buy,sell}],nonCash:[{pair,buy,sell}]}], attribution:{name,url} }, meta } */
export const GET = route({ auth: true }, async () => {
  const { data, meta } = await getBankRates();
  return envelope(data, meta as unknown as Record<string, unknown>);
});
