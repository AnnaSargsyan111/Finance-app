import { route, json } from "@/lib/route";
import { listPeriods } from "@/pf/periods";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/pf/periods -> [{ kind, start, end, hasData, updatedAt }] newest first (feeds the period selector) */
export const GET = route({ auth: true }, async ({ user }) => json(await listPeriods(user!.id)));
