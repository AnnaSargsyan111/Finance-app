import { route, envelope } from "@/lib/route";
import { ApiError } from "@/lib/errors";
import { parseOrThrow, queryObject } from "@/lib/validate";
import { historyListQuerySchema, saveRequestSchema } from "@/invest/schemas";
import { listHistory, saveRecommendation } from "@/invest/history/repo";
import { verifySaveToken } from "@/invest/history/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/invest/history { saveToken, result }  -> 201 (new) | 200 (same result already saved: idempotent)
 * The only write in the Investment module. Forged / expired / other-user tokens or a modified result -> 400 INVALID_SAVE_TOKEN.
 */
export const POST = route({ auth: true }, async ({ user, body }) => {
  const input = parseOrThrow(saveRequestSchema, await body());
  const check = verifySaveToken(input.saveToken, user!.id, input.result);
  if (!check.ok) throw new ApiError("INVALID_SAVE_TOKEN", 400, "This recommendation cannot be saved (the save link is invalid, expired or the result was changed).");
  const { item, created } = await saveRecommendation(user!.id, input.result, check.hash);
  return envelope(item, { asOf: item.createdAt, stale: false, created }, created ? 201 : 200);
});

/** GET /api/invest/history?page&pageSize<=50 -> { data:{ groups:[{date,label,items}], page, pageSize, total } }, newest first, grouped by Asia/Yerevan day */
export const GET = route({ auth: true }, async ({ req, user }) => {
  const q = parseOrThrow(historyListQuerySchema, queryObject(req.nextUrl));
  const data = await listHistory(user!.id, q.page, q.pageSize);
  return envelope(data, { asOf: new Date().toISOString(), stale: false });
});
