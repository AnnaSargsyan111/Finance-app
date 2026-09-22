import { route, envelope } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { runComparison } from "@/invest/comparison";
import { comparisonRequestSchema } from "@/invest/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/invest/comparison { holdings:[{symbol,shares}], window: 1M|3M|6M|1Y|3Y|5Y }
 * -> { data:{ window,start,end,series:[{date,portfolio,benchmark}] (rebased to 100), metrics:{portfolio,benchmark}, diversification, disclaimers }, meta }
 * Recomputed from stored prices on every call; nothing is persisted.
 */
export const POST = route({ auth: true }, async ({ body }) => {
  const input = parseOrThrow(comparisonRequestSchema, await body());
  const data = await runComparison(input);
  return envelope(data, { asOf: data.end, stale: false, isFixture: false, source: "Stored adjusted daily prices (Yahoo prototype series)" });
});
