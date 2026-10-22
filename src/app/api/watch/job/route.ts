import { route, json } from "@/lib/route";
import { cronAuthorised } from "@/lib/cron-auth";
import { ApiError } from "@/lib/errors";
import { runWatchJob } from "@/watch/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * POST|GET /api/watch/job   Authorization: Bearer $CRON_SECRET
 * Checks every switched-on recommendation and emails only the ones that changed. NOT scheduled in vercel.json yet (test phase):
 * trigger it by hand, or add a cron entry when the notification goes live.
 */
const run = async (authorization: string | null) => {
  if (!cronAuthorised(authorization)) throw new ApiError("FORBIDDEN", 403, "Forbidden.");
  return json({ job: "watch", result: await runWatchJob() });
};
export const POST = route({ auth: false, csrf: false }, async ({ req }) => run(req.headers.get("authorization")));
export const GET = route({ auth: false, csrf: false }, async ({ req }) => run(req.headers.get("authorization")));
