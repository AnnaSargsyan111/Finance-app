import { route, envelope } from "@/lib/route";
import { listWatchedIds } from "@/watch/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/watch -> { data: { ids: [saved recommendation ids that have "Notify me about changes" on] } } */
export const GET = route({ auth: true }, async ({ user }) => {
  const ids = await listWatchedIds(user!.id);
  return envelope({ ids }, { asOf: new Date().toISOString(), stale: false });
});
