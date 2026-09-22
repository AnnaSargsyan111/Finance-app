import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { route, json } from "@/lib/route";
import { getEnv } from "@/lib/env";
import { ApiError, notFound } from "@/lib/errors";
import { parseOrThrow } from "@/lib/validate";
import { JOB_NAMES, runJob, type JobName } from "@/market/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const bodySchema = z.object({ limit: z.number().int().positive().max(1000).optional() }).strict();

function authorised(header: string | null): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

function assertKnownJob(name: string): asserts name is JobName {
  if (!(JOB_NAMES as readonly string[]).includes(name)) throw notFound("Job");
}

/**
 * POST /api/jobs/<fx|news|stocks|universe>   Authorization: Bearer $CRON_SECRET   (manual trigger / GitHub Actions / curl)
 * Not session based. Refused (403) when CRON_SECRET is unset or wrong. `universe` accepts { limit } for dev runs and is too
 * long for a serverless request on the free plan: run it from GitHub Actions or `npm run job:universe` (see README-backend).
 */
export const POST = route<{ name: string }>({ auth: false, csrf: false }, async ({ req, params, body }) => {
  if (!authorised(req.headers.get("authorization"))) throw new ApiError("FORBIDDEN", 403, "Forbidden.");
  assertKnownJob(params.name);
  const raw = req.headers.get("content-type")?.includes("json") ? await body() : {};
  const input = parseOrThrow(bodySchema, raw);
  const result = await runJob(params.name, { limit: input.limit });
  return json({ job: params.name, result });
});

/**
 * GET /api/jobs/<fx|news|stocks>   Authorization: Bearer $CRON_SECRET
 *
 * For Vercel Cron: Vercel invokes the configured URL with GET and automatically attaches
 * `Authorization: Bearer $CRON_SECRET` whenever `CRON_SECRET` is set as a Vercel project environment variable, so a
 * `vercel.json` `crons` entry pointed at this route authenticates itself with no extra wiring. Cron requests carry no
 * body, so this handler takes no input beyond the job name in the path (no `{ limit }`).
 *
 * `universe` is REFUSED here on purpose (405): it is a long-running batch (~17 minutes for the full S&P 500 on this
 * codebase - see README-backend) that would repeatedly exceed a serverless function's time budget and just burn
 * invocation time if a scheduler were ever pointed at it. Run it externally instead: GitHub Actions or
 * `npm run job:universe`. POST still accepts it for that manual/CI trigger.
 */
export const GET = route<{ name: string }>({ auth: false, csrf: false }, async ({ req, params }) => {
  if (!authorised(req.headers.get("authorization"))) throw new ApiError("FORBIDDEN", 403, "Forbidden.");
  assertKnownJob(params.name);
  if (params.name === "universe") {
    throw new ApiError(
      "METHOD_NOT_ALLOWED",
      405,
      "The universe batch cannot be triggered by a scheduler. Run it externally: GitHub Actions or `npm run job:universe`.",
    );
  }
  const result = await runJob(params.name, {});
  return json({ job: params.name, result });
});
