import { getEnveloped, request, sendEnveloped } from "./client";

/** "Notify me about changes" on the Recommendation History page (src/watch on the server). */

export async function listWatched(signal?: AbortSignal): Promise<string[]> {
  return (await getEnveloped<{ ids: string[] }>("/api/watch", { signal })).data.ids;
}

export async function setWatched(recommendationId: string, enabled: boolean): Promise<void> {
  await request("PUT", `/api/watch/${encodeURIComponent(recommendationId)}`, { body: { enabled } });
}

/** sends a test email to the signed-in user's own address, with the saved values next to today's */
export async function sendTestEmail(recommendationId: string): Promise<{ to: string; changedCount: number }> {
  const r = await sendEnveloped<{ to: string; changedCount: number }>("POST", `/api/watch/${encodeURIComponent(recommendationId)}/check`, {});
  return r.data;
}
