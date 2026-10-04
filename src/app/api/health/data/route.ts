import { route, json } from "@/lib/route";
import { ApiError } from "@/lib/errors";
import { cronAuthorised } from "@/lib/cron-auth";
import { runHealthChecks } from "@/ops/health-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * GET /api/health/data   Authorization: Bearer $CRON_SECRET
 *
 * The data monitor's endpoint (called daily by .github/workflows/monitor.yml). 200 with the report when everything is fine, 503 with the
 * same report when any check fails, so a plain HTTP status is enough for a scheduler to raise an alarm. It reads stored state and makes ONE
 * live request (the bank-rate page); it is protected like the job endpoints so strangers cannot trigger that request. The public liveness
 * probe stays at /api/health.
 */
export const GET = route({ auth: false, csrf: false }, async ({ req }) => {
  if (!cronAuthorised(req.headers.get("authorization"))) throw new ApiError("FORBIDDEN", 403, "Forbidden.");
  const report = await runHealthChecks();
  return json(report, report.ok ? 200 : 503);
});
