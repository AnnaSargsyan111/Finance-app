import { after } from "next/server";

/**
 * Runs work after the response has been sent, and keeps the serverless function alive until it finishes (Next's `after`).
 * Used to refresh a cached value while the visitor already has the saved copy. Outside a request (scripts, tests) there is
 * nothing to hook into, so the promise just runs on its own. Failures are swallowed: the caller has already answered.
 */
const pending = new Set<Promise<void>>();

export function scheduleBackground(work: Promise<unknown>): void {
  const settled: Promise<void> = work.then(
    () => undefined,
    () => undefined,
  );
  pending.add(settled);
  void settled.then(() => pending.delete(settled));
  try {
    after(() => settled);
  } catch {
    /* not inside a request: `settled` keeps running */
  }
}

/** tests: wait until every refresh started in the background has finished (so it cannot write into the next test) */
export async function settleBackground(): Promise<void> {
  while (pending.size > 0) await Promise.all([...pending]);
}
