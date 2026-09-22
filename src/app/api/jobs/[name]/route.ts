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

/**
 * POST /api/jobs/<fx|news|stocks|universe>   Authorization: Bearer $CRON_SECRET   (Vercel Cron / GitHub Actions / curl)
 * Not session based. Refused (403) when CRON_SECRET is unset or wrong. `universe` accepts { limit } for dev runs and is too
 * long for a serverless request on the free plan: run it from GitHub Actions or `npm run job:universe` (see README-backend).
 */
export const POST = route<{ name: string }>({ auth: false, csrf: false }, async ({ req, params, body }) => {
  if (!authorised(req.headers.get("authorization"))) throw new ApiError("FORBIDDEN", 403, "Forbidden.");
  if (!(JOB_NAMES as readonly string[]).includes(params.name)) throw notFound("Job");
  const raw = req.headers.get("content-type")?.includes("json") ? await body() : {};
  const input = parseOrThrow(bodySchema, raw);
  const result = await runJob(params.name as JobName, { limit: input.limit });
  return json({ job: params.name, result });
});
