import { route, json, noContent } from "@/lib/route";
import { validationError } from "@/lib/errors";
import { parseOrThrow, queryObject } from "@/lib/validate";
import { deletePeriod, getPeriodView, putPeriod } from "@/pf/periods";
import { periodQuerySchema, putPeriodSchema, resolvePeriodRef } from "@/pf/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/pf/period?kind=month&month=2026-09  |  ?kind=custom&start=YYYY-MM-DD&end=YYYY-MM-DD  (no query = current month, Asia/Yerevan)
 * -> saved data, or exists:false with the 7 default categories (never an error for an empty period)
 */
export const GET = route({ auth: true }, async ({ req, user }) => {
  const q = parseOrThrow(periodQuerySchema, queryObject(req.nextUrl));
  return json(await getPeriodView(user!.id, resolvePeriodRef(q)));
});

/** PUT /api/pf/period { kind, month | start+end, income, expenses:[{key?,label?,amount}] } -> upsert the whole period, returns the computed view */
export const PUT = route({ auth: true }, async ({ user, body }) => {
  const b = parseOrThrow(putPeriodSchema, await body());
  const ref = resolvePeriodRef({ kind: b.kind, month: b.month, start: b.start, end: b.end });
  return json(await putPeriod(user!.id, ref, { income: b.income, expenses: b.expenses }));
});

/** DELETE /api/pf/period?... -> 204 (cascade) | 404 when there is no such period for the caller */
export const DELETE = route({ auth: true }, async ({ req, user }) => {
  const q = parseOrThrow(periodQuerySchema, queryObject(req.nextUrl));
  if (!q.kind && !q.month && !q.start && !q.end) {
    // refuse to guess for a destructive call
    throw validationError("Some fields are invalid.", { kind: "kind is required" });
  }
  await deletePeriod(user!.id, resolvePeriodRef(q));
  return noContent();
});
