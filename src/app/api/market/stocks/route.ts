import { route, envelope } from "@/lib/route";
import { getStocks } from "@/market/stocks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/market/stocks -> the 5 display companies (NVDA, AAPL, GOOGL, MSFT, AMZN), meta.isDelayed always true */
export const GET = route({ auth: true }, async () => {
  const { data, meta } = await getStocks();
  return envelope(data, meta as unknown as Record<string, unknown>);
});
