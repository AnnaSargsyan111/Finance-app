import { route, envelope } from "@/lib/route";
import { ApiError } from "@/lib/errors";
import { enforceLimit, recordEvent } from "@/auth/rate-limit";
import { loadTarget } from "@/watch/repo";
import { checkTarget } from "@/watch/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const TEST_MAILS_PER_HOUR = 5;

/**
 * POST /api/watch/:recommendationId/check -> sends a TEST email to the caller's own address now, with the saved values next to today's
 * (even when nothing changed). It never changes what the scheduled check compares against. 5 per hour per user.
 */
export const POST = route<{ recommendationId: string }>({ auth: true }, async ({ user, params }) => {
  const target = await loadTarget(user!.id, params.recommendationId);
  await enforceLimit({ scope: "watch-test", key: user!.id, limit: TEST_MAILS_PER_HOUR, windowMs: 3600_000 });
  await recordEvent("watch-test", user!.id);
  const r = await checkTarget(target, { test: true });
  if (r.status === "no-data") throw new ApiError("NO_SNAPSHOT", 503, "No market data is available yet, so nothing can be compared.");
  if (r.status === "unreadable") throw new ApiError("INTERNAL_ERROR", 500, "This saved recommendation cannot be compared.");
  return envelope({ sent: true, changedCount: r.changedCount, rowCount: r.rowCount, to: user!.email }, { asOf: new Date().toISOString(), stale: false });
});
