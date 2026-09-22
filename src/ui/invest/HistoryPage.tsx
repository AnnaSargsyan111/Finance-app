"use client";

import { useState } from "react";
import { deleteHistoryItem, getHistoryItem, listHistory } from "../api/invest";
import { errorMessage } from "../api/client";
import type { PortfolioResult, SavedSummary, SingleResult } from "../api/types";
import { Button, LinkButton } from "../components/Button";
import { Chip, ConfirmDialog } from "../components/Display";
import { EmptyState, ErrorState, Note, Skeleton, Spinner } from "../components/Feedback";
import { IconArrowLeft, IconTrash } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { formatAmd, formatDateTime, formatPercent } from "../lib/format";
import { Disclaimer, PageHeader } from "../shell/AppShell";
import { BenchmarkSection } from "./BenchmarkSection";
import { horizonLabel, riskLabel } from "./labels";
import { PortfolioView, ScoreCard, SingleView } from "./ResultViews";
import s from "./invest.module.css";

function SavedDetail({ id }: { id: string }) {
  const res = useResource((signal) => getHistoryItem(id, signal), [id]);
  if (res.status === "error" && !res.data) return <ErrorState title="We couldn't open this recommendation" message={errorMessage(res.error)} onRetry={res.reload} compact />;
  if (!res.data)
    return (
      <div role="status" aria-busy="true">
        <span className="sr-only">Loading saved recommendation</span>
        <Skeleton height={200} />
      </div>
    );
  const r = res.data.result;
  return (
    <div className={s.section}>
      <Note>This is the recommendation as it was saved. It does not change when prices move.</Note>
      <ScoreCard result={r} />
      {r.mode === "single" ? <SingleView result={r as SingleResult} /> : <PortfolioView result={r as PortfolioResult} benchmark={(r as PortfolioResult).benchmark ? <BenchmarkSection result={r as PortfolioResult} fixed /> : null} />}
    </div>
  );
}

function HistoryItem({ item, onDelete }: { item: SavedSummary; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className={s.histItem} style={{ listStyle: "none" }}>
      <div className={s.histTop}>
        <div style={{ minWidth: 0 }}>
          <p className={s.histTitle}>{item.mode === "single" ? item.headline : `Portfolio: ${item.headline}`}</p>
          <p className={s.histSub}>
            {formatDateTime(item.createdAt)} · {formatAmd(item.inputs.amountAmd)} · {riskLabel(item.inputs.risk)} risk · {horizonLabel(item.inputs.horizon)}
          </p>
        </div>
        <div className={s.histScore}>
          <span className={s.scoreLabel}>Match score</span>
          <div style={{ fontSize: 28, fontWeight: 300 }} className="num">
            {item.score ?? "-"}
            <span className={s.scoreOf}> / 100</span>
          </div>
        </div>
      </div>
      <div className={s.chips}>
        <Chip>{item.mode === "single" ? "Single stock" : "Portfolio"}</Chip>
        {item.holdings.slice(0, 8).map((h) => (
          <Chip key={h.symbol ?? h.name}>
            {h.symbol}
            {h.allocationPercent != null && item.mode === "portfolio" ? ` ${formatPercent(h.allocationPercent, 1)}` : ""}
          </Chip>
        ))}
      </div>
      <div className={s.histActions}>
        <Button variant="secondary" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          {open ? "Hide details" : "Review"}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => onDelete(item.id)}>
          <IconTrash size={16} />
          Remove
        </Button>
      </div>
      {open ? (
        <div className={s.histDetail}>
          <SavedDetail id={item.id} />
        </div>
      ) : null}
    </li>
  );
}

export function HistoryPage() {
  const res = useResource((signal) => listHistory(signal), []);
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
      setErr(errorMessage(e, "We couldn't remove this recommendation."));
    } finally {
      setBusy(false);
    }
  }

  const groups = res.data?.groups ?? [];
  return (
    <>
      <PageHeader
        title="Recommendation History"
        greet={false}
        subtitle="Recommendations you chose to add, newest first. Nothing is saved unless you press Add."
        actions={
          <LinkButton href="/invest" variant="secondary" size="sm">
            <IconArrowLeft size={16} />
            Back to Investment Recommendation
          </LinkButton>
        }
      />
      {err ? (
        <div style={{ marginBottom: 16 }}>
          <Note tone="error">{err}</Note>
        </div>
      ) : null}
      {res.status === "error" && !res.data ? (
        <ErrorState title="We couldn't load your history" message={errorMessage(res.error)} onRetry={res.reload} />
      ) : !res.data ? (
        <div role="status" aria-busy="true" style={{ display: "grid", gap: 16 }}>
          <span className="sr-only">Loading history</span>
          <Skeleton width={180} height={20} />
          <Skeleton height={130} radius={22} />
          <Skeleton height={130} radius={22} />
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          title="No saved recommendations yet"
          message="When you get a recommendation, press Add to keep it here so you can review it later."
          action={
            <LinkButton href="/invest" variant="primary" size="sm">
              Get a recommendation
            </LinkButton>
          }
        />
      ) : (
        <div style={{ display: "grid", gap: 32, maxWidth: 980, opacity: res.loading ? 0.6 : 1 }} aria-busy={res.loading}>
          {groups.map((g) => (
            <section key={g.date} className={s.dayGroup} aria-label={g.label}>
              <h2 className={s.dayHead}>{g.label}</h2>
              <ul style={{ margin: 0, padding: 0, display: "grid", gap: 12 }}>
                {g.items.map((it) => (
                  <HistoryItem key={it.id} item={it} onDelete={setRemoving} />
                ))}
              </ul>
            </section>
          ))}
          {res.loading ? <Spinner label="Refreshing" /> : null}
        </div>
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remove this recommendation?"
        onClose={() => setRemoving(null)}
        actions={
          <>
            <Button variant="ghost" onClick={() => setRemoving(null)}>
              Keep it
            </Button>
            <Button variant="danger" loading={busy} onClick={confirmRemove}>
              Remove
            </Button>
          </>
        }
      >
        It will be deleted from your history. This can&apos;t be undone.
      </ConfirmDialog>
      <Disclaimer>Saved recommendations are informational snapshots, not investment advice. Prices and scores are as of the date each one was created.</Disclaimer>
    </>
  );
}
