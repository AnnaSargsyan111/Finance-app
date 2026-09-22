import { route, envelope } from "@/lib/route";
import { parseOrThrow, queryObject } from "@/lib/validate";
import { convertAmdToUsd, convertQuerySchema } from "@/invest/convert";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/invest/convert?amountAmd=500000 -> { data:{amountAmd,usd,rate,rateDate,source}, meta } */
export const GET = route({ auth: true }, async ({ req }) => {
  const q = parseOrThrow(convertQuerySchema, queryObject(req.nextUrl));
  const { data, meta } = await convertAmdToUsd(q.amountAmd);
  return envelope(data, meta);
});
