"use client";

import { useState } from "react";
import { deleteHistoryItem, getHistoryItem, listHistory } from "../api/invest";
import { errorMessage } from "../api/client";
import { listWatched, sendTestEmail, setWatched } from "../api/watch";
import type { PortfolioResult, SavedSummary, SingleResult } from "../api/types";
import { Button, LinkButton } from "../components/Button";
import { Chip, ConfirmDialog } from "../components/Display";
import { EmptyState, ErrorState, Note, Skeleton, Spinner } from "../components/Feedback";
import { IconArrowLeft, IconTrash } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { useT } from "../i18n";
import { formatAmd, formatDateLong, formatDateTime, formatPercent } from "../lib/format";
import { Disclaimer, PageHeader } from "../shell/AppShell";
import { useSession } from "../shell/Session";
import { BenchmarkSection } from "./BenchmarkSection";
import { horizonLabel, localizeServer, riskLabel } from "./labels";
import { hasRecSession, requestResume } from "./session-memory";
import { PortfolioView, ScoreCard, SingleView } from "./ResultViews";
import s from "./invest.module.css";

function SavedDetail({ id }: { id: string }) {
  const t = useT();
  const res = useResource((signal) => getHistoryItem(id, signal), [id]);
  if (res.status === "error" && !res.data) return <ErrorState title={t("invest.history.couldntOpen")} message={localizeServer(t, errorMessage(res.error))} onRetry={res.reload} compact />;
  if (!res.data)
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">{t("invest.history.loadingSaved")}</span>
        <Skeleton height={200} />
      </div>
    );
  const r = res.data.result;
  return (
    <div className={s.section}>
      <Note>{t("invest.history.savedNote")}</Note>
      <ScoreCard result={r} />
      {r.mode === "single" ? <SingleView result={r as SingleResult} /> : <PortfolioView result={r as PortfolioResult} benchmark={(r as PortfolioResult).benchmark ? <BenchmarkSection result={r as PortfolioResult} fixed /> : null} />}
    </div>
  );
}

/** "Notify me about changes": opt-in per saved recommendation, plus a button that sends a test email to the user's own address */
function NotifyRow({ id, initialOn }: { id: string; initialOn: boolean }) {
  const t = useT();
  const [on, setOn] = useState(initialOn);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ tone: "info" | "error"; text: string } | null>(null);

  async function toggle() {
    const next = !on;
    setBusy(true);
    setMsg(null);
    try {
      await setWatched(id, next);
      setOn(next);
    } catch (e) {
      setMsg({ tone: "error", text: localizeServer(t, errorMessage(e, t("invest.history.notifyFailed"))) });
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setTesting(true);
    setMsg(null);
    try {
      const r = await sendTestEmail(id);
      setMsg({ tone: "info", text: t("invest.history.testSent", { email: r.to }) });
    } catch (e) {
      setMsg({ tone: "error", text: localizeServer(t, errorMessage(e, t("invest.history.testFailed"))) });
    } finally {
      setTesting(false);
    }
  }

  const labelId = `notify-${id}`;
  return (
    <div className={s.notifyRow}>
      <button type="button" role="switch" aria-checked={on} aria-labelledby={labelId} className={s.switch} disabled={busy} onClick={toggle} />
      <div className={s.notifyText}>
        <p id={labelId} className={s.notifyLabel}>
          {t("invest.history.notify")}
        </p>
        <p className={s.notifyHint}>{on ? t("invest.history.testNote") : t("invest.history.notifyHint")}</p>
      </div>
      {on ? (
        <Button variant="ghost" size="sm" loading={testing} onClick={test}>
          {t("invest.history.sendTest")}
        </Button>
      ) : null}
      {msg ? (
        <div style={{ flexBasis: "100%" }}>
          <Note tone={msg.tone}>{msg.text}</Note>
        </div>
      ) : null}
    </div>
  );
}

function HistoryItem({ item, watched, onDelete }: { item: SavedSummary; watched: boolean; onDelete: (id: string) => void }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <li className={s.histItem} style={{ listStyle: "none" }}>
      <div className={s.histTop}>
        <div style={{ minWidth: 0 }}>
          <p className={s.histTitle}>{item.mode === "single" ? item.headline : t("invest.history.portfolioHeadline", { headline: localizeServer(t, item.headline) })}</p>
          <p className={s.histSub}>
            {formatDateTime(item.createdAt)} · {formatAmd(item.inputs.amountAmd)} · {t("invest.result.riskChip", { risk: riskLabel(t, item.inputs.risk) })} · {horizonLabel(t, item.inputs.horizon)}
          </p>
        </div>
        <div className={s.histScore}>
          <span className={s.scoreLabel}>{t("invest.history.matchScore")}</span>
          <div style={{ fontSize: 28, fontWeight: 300 }} className="num">
            {item.score ?? "-"}
            <span className={s.scoreOf}> / 100</span>
          </div>
        </div>
      </div>
      <div className={s.chips}>
        <Chip>{item.mode === "single" ? t("invest.result.single") : t("invest.result.portfolio")}</Chip>
        {item.holdings.slice(0, 8).map((h) => (
          <Chip key={h.symbol ?? h.name}>
            {h.symbol}
            {h.allocationPercent != null && item.mode === "portfolio" ? ` ${formatPercent(h.allocationPercent, 1)}` : ""}
          </Chip>
        ))}
      </div>
      <div className={s.histActions}>
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? t("invest.history.hide") : t("invest.history.review")}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
          <IconTrash size={16} />
          {t("invest.history.remove")}
        </Button>
      </div>
      <NotifyRow id={item.id} initialOn={watched} />
      {open ? (
        <div className={s.histDetail}>
          <SavedDetail id={item.id} />
        </div>
      ) : null}
    </li>
  );
}

export function HistoryPage() {
  const t = useT();
  const { user } = useSession();
  // the latest recommendation of this visit, if there is one to go back to (see session-memory.ts)
  const [canReturn] = useState(() => hasRecSession(user.id));
  const res = useResource((signal) => listHistory(signal), []);
  // a failure here only means every switch shows "off" until the page is reloaded; the history itself still works
  const watch = useResource((signal) => listWatched(signal), []);
  const watched = new Set(watch.data ?? []);
  const [removing, setRemoving] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    setBusy(true);
    setErr(null);
    try {
      await deleteHistoryItem(removing);
      setRemoving(null);
      res.reload();
    } catch (e) {
      setRemoving(null);
      setErr(localizeServer(t, errorMessage(e, t("invest.history.removeFailed"))));
    } finally {
      setBusy(false);
    }
  }

  const groups = res.data?.groups ?? [];
  return (
    <>
      <PageHeader
        title={t("invest.history.title")}
        greet={false}
        subtitle={t("invest.history.subtitle")}
        actions={
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "flex-end" }}>
            {canReturn ? (
              <LinkButton href="/invest" variant="primary" size="sm" onClick={() => requestResume(user.id)}>
                <IconArrowLeft size={16} />
                {t("invest.history.backToRecommendation")}
              </LinkButton>
            ) : null}
            <LinkButton href="/invest" variant="secondary" size="sm">
              <IconArrowLeft size={16} />
              {t("invest.history.backToInvest")}
            </LinkButton>
          </div>
        }
      />
      {err ? (
        <div style={{ marginBottom: 16 }}>
          <Note tone="error">{err}</Note>
        </div>
      ) : null}
      {res.status === "error" && !res.data ? (
        <ErrorState title={t("invest.history.couldntLoad")} message={localizeServer(t, errorMessage(res.error))} onRetry={res.reload} />
      ) : !res.data ? (
        <div role="status" aria-busy="true" style={{ display: "grid", gap: 16 }}>
          <span className="sr-only">{t("invest.history.loading")}</span>
          <Skeleton width={180} height={20} />
          <Skeleton height={130} radius={22} />
          <Skeleton height={130} radius={22} />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title={t("invest.history.emptyTitle")}
          message={t("invest.history.emptyMessage")}
          action={
            <LinkButton href="/invest" variant="primary" size="sm">
              {t("invest.history.getRecommendation")}
            </LinkButton>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 32, maxWidth: 980, opacity: res.loading ? 0.6 : 1 }} aria-busy={res.loading}>
          {groups.map((g) => (
            <section key={g.date} className={s.dayGroup} aria-label={formatDateLong(g.date)}>
              <h2 className={s.dayHead}>{formatDateLong(g.date)}</h2>
              <ul style={{ margin: 0, padding: 0, display: "grid", gap: 12 }}>
                {g.items.map((it) => (
                  <HistoryItem key={`${it.id}-${watch.data ? "w" : "-"}`} item={it} watched={watched.has(it.id)} onDelete={setRemoving} />
                ))}
              </ul>
            </section>
          ))}
          {res.loading ? <Spinner label={t("invest.history.refreshing")} /> : null}
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        title={t("invest.history.removeTitle")}
        onClose={() => setRemoving(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              {t("invest.history.keep")}
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmRemove}>
              {t("invest.history.remove")}
            </Button>
          </>
        }
      >
        {t("invest.history.removeBody")}
      </ConfirmDialog>
      <Disclaimer>{t("invest.history.disclaimer")}</Disclaimer>
    </>
  );
}
