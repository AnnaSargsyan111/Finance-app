import { route, envelope, noContent } from "@/lib/route";
import { deleteHistoryItem, getHistoryItem } from "@/invest/history/repo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/invest/history/:id -> the saved item with its full result (404 if it is not the caller's) */
export const GET = route<{ id: string }>({ auth: true }, async ({ user, params }) => {
  const item = await getHistoryItem(user!.id, params.id);
  return envelope(item, { asOf: item.createdAt, stale: false });
});

/** DELETE /api/invest/history/:id -> 204 (404 if it is not the caller's) */
export const DELETE = route<{ id: string }>({ auth: true }, async ({ user, params }) => {
  await deleteHistoryItem(user!.id, params.id);
  return noContent();
});
