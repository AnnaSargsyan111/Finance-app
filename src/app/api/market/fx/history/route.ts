import { z } from "zod";
import { route, envelope } from "@/lib/route";
import { parseOrThrow, queryObject } from "@/lib/validate";
import { APP } from "@/config/app";
import { FX_PAIRS, getFxHistory } from "@/market/fx/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    pair: z.enum(FX_PAIRS as [string, ...string[]], { error: `pair must be one of ${FX_PAIRS.join(", ")}` }).default("USD/AMD"),
    days: z.coerce
      .number({ error: "days must be a number" })
      .int("days must be an integer")
      .min(APP.fx.minDays, `days must be at least ${APP.fx.minDays}`)
      .max(APP.fx.maxDays, `days must be at most ${APP.fx.maxDays}`)
      .default(APP.fx.defaultDays),
  })
  .strict();

/** GET /api/market/fx/history?pair=USD/AMD&days=30 -> exactly `days` calendar-day points, weekends/holidays carried forward */
export const GET = route({ auth: true }, async ({ req }) => {
  const q = parseOrThrow(querySchema, queryObject(req.nextUrl));
  const { data, meta } = await getFxHistory({ pair: q.pair, days: q.days });
  return envelope(data, meta as unknown as Record<string, unknown>);
});
