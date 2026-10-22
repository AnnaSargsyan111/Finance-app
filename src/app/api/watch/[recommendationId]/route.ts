import { z } from "zod";
import { route, envelope } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { setWatch } from "@/watch/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ enabled: z.boolean() }).strict();

/** PUT /api/watch/:recommendationId { enabled } -> switch "Notify me about changes" on or off (404 if the recommendation is not the caller's) */
export const PUT = route<{ recommendationId: string }>({ auth: true }, async ({ user, params, body }) => {
  const input = parseOrThrow(bodySchema, await body());
  await setWatch(user!.id, params.recommendationId, input.enabled);
  return envelope({ recommendationId: params.recommendationId, enabled: input.enabled }, { asOf: new Date().toISOString(), stale: false });
});
