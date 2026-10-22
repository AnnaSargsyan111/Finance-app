import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { getEmailProvider } from "@/auth/email";
import { currentStocks } from "@/invest/current";
import { compareViews, type Comparison } from "./diff";
import { loadAllTargets, recordCheck, type WatchTarget } from "./repo";
import { renderWatchEmail } from "./template";
import { signUnsubscribeToken } from "./token";
import { viewFromSaved, viewNow, type WatchView } from "./view";

export type CheckStatus = "sent" | "unchanged" | "no-data" | "unreadable";

export interface CheckOutcome {
  status: CheckStatus;
  changedCount: number;
  rowCount: number;
}

const isView = (v: unknown): v is WatchView => Boolean(v) && typeof v === "object" && Array.isArray((v as WatchView).stocks) && ((v as WatchView).mode === "single" || (v as WatchView).mode === "portfolio");

/** what the stocks looked like last time we told the user (or, before the first email, in the saved recommendation itself) */
export function baselineOf(t: Pick<WatchTarget, "baseline" | "result" | "snapshotDate">): WatchView | null {
  return isView(t.baseline) ? t.baseline : viewFromSaved(t.result, t.snapshotDate);
}

/** the saved recommendation's stocks compared with the latest data snapshot; pure given the two views */
export async function compareToNow(t: Pick<WatchTarget, "baseline" | "result" | "snapshotDate">): Promise<{ prev: WatchView; next: WatchView; comparison: Comparison } | "no-data" | "unreadable"> {
  const prev = baselineOf(t);
  if (!prev) return "unreadable";
  const driverLabels = Object.fromEntries(prev.stocks.map((s) => [s.symbol, s.drivers.map((d) => d.label)]));
  const now = await currentStocks({ risk: prev.risk, horizon: prev.horizon, symbols: prev.stocks.map((s) => s.symbol), driverLabels });
  if (!now) return "no-data";
  const next = viewNow(prev, now);
  return { prev, next, comparison: compareViews(prev, next) };
}

/**
 * Check one switched-on recommendation. `test` is the "send me a test now" button: it always sends (to the account's own email) and
 * leaves the stored baseline alone. Otherwise an email goes out only when something changed meaningfully, and then the new values
 * become the baseline, so the next email only reports what changed after this one.
 */
export async function checkTarget(t: WatchTarget, opts: { test: boolean }): Promise<CheckOutcome> {
  const c = await compareToNow(t);
  if (c === "no-data" || c === "unreadable") return { status: c, changedCount: 0, rowCount: 0 };
  const { prev, next, comparison } = c;
  const outcome = { changedCount: comparison.changedCount, rowCount: comparison.rowCount };
  if (!opts.test && !comparison.meaningful) {
    await recordCheck(t.watchId, { emailed: false });
    return { status: "unchanged", ...outcome };
  }
  const base = getEnv().APP_BASE_URL.replace(/\/$/, "");
  const mail = renderWatchEmail({
    firstName: t.firstName,
    prev,
    next,
    comparison,
    test: opts.test,
    manageUrl: `${base}/invest/history`,
    unsubscribeUrl: `${base}/api/watch/unsubscribe?t=${signUnsubscribeToken(t.watchId)}`,
  });
  // Test phase: always to the account's own address, never to anyone else.
  await getEmailProvider().send({ to: t.email, subject: mail.subject, text: mail.text, html: mail.html });
  await recordCheck(t.watchId, opts.test ? { emailed: true } : { baseline: next, emailed: true });
  return { status: "sent", ...outcome };
}

/** the scheduled job: check every switched-on watch, one failing watch never stops the others */
export async function runWatchJob(): Promise<{ checked: number; sent: number; unchanged: number; skipped: number; failed: number }> {
  const targets = await loadAllTargets();
  const out = { checked: 0, sent: 0, unchanged: 0, skipped: 0, failed: 0 };
  for (const t of targets) {
    try {
      const r = await checkTarget(t, { test: false });
      out.checked++;
      if (r.status === "sent") out.sent++;
      else if (r.status === "unchanged") out.unchanged++;
      else out.skipped++;
    } catch (e) {
      out.failed++;
      log.error("watch check failed", { watchId: t.watchId, message: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}
