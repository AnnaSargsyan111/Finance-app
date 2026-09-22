import { z } from "zod";
import { route, envelope } from "@/lib/route";
import { notFound } from "@/lib/errors";
import { parseOrThrow, queryObject } from "@/lib/validate";
import { getStockHistory, HISTORY_RANGES, normaliseSymbol } from "@/market/stocks/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({ range: z.enum(HISTORY_RANGES, { error: `range must be one of ${HISTORY_RANGES.join(", ")}` }).default("1m") }).strict();

/** GET /api/market/stocks/:symbol/history?range=1m -> { symbol, series:[{date,close}] } ; symbol must be a display company */
export const GET = route<{ symbol: string }>({ auth: true }, async ({ req, params }) => {
  const symbol = normaliseSymbol(params.symbol);
  if (!symbol) throw notFound("Symbol");
  const q = parseOrThrow(querySchema, queryObject(req.nextUrl));
  const { data, meta } = await getStockHistory(symbol, q.range);
  return envelope(data, meta as unknown as Record<string, unknown>);
});
