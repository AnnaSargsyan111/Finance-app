"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { addToHistory, getRecommendation } from "../api/invest";
import { errorMessage, isApiError } from "../api/client";
import type { PortfolioResult, RecMode, RecommendationResult, SingleResult } from "../api/types";
import { Button } from "../components/Button";
import { Card, Chip, Tabs } from "../components/Display";
import { EmptyState, ErrorState, Skeleton, Spinner } from "../components/Feedback";
import { IconCheck, IconPlus } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { formatAmd } from "../lib/format";
import { BenchmarkSection } from "./BenchmarkSection";
import { horizonLabel, riskLabel } from "./labels";
import { PortfolioView, ScoreCard, SingleView } from "./ResultViews";
import { markSaved, rememberScroll, updateRecSession, type RecSession } from "./session-memory";
import type { ComparisonResult, ComparisonWindow } from "../api/types";
import type { Preferences } from "./StepFlow";
import s from "./invest.module.css";

/* ------------------------------------------------------------------ add to history */
function AddToHistory({ result, alreadySaved, onSaved }: { result: RecommendationResult; alreadySaved: boolean; onSaved: () => void }) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "exists" | "error">(alreadySaved ? "exists" : "idle");
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!result.saveToken) return;
    setState("saving");
    setError(null);
    try {
      const r = await addToHistory(result.saveToken, result);
      setState(r.created ? "saved" : "exists");
      onSaved();
    } catch (e) {
      setState("error");
      setError(
        isApiError(e) && e.code === "INVALID_SAVE_TOKEN"
          ? "This recommendation can no longer be saved. Start over to get a fresh one."
          : errorMessage(e, "We couldn't save this recommendation. Please try again."),
      );
    }
  }

  return (
    <div className={s.actionsRow}>
      {state === "saved" || state === "exists" ? (
        <>
          <span className={s.addOk} role="status">
            <IconCheck size={16} /> {state === "exists" ? "Already in your history" : "Added to your history"}
          </span>
          <Link href="/invest/history" onClick={rememberScroll} style={{ color: "var(--text)", fontWeight: 600, fontSize: 14 }}>
            View history
          </Link>
        </>
      ) : (
        <Button variant="secondary" onClick={add} loading={state === "saving"} disabled={!result.saveToken}>
          {state === "saving" ? null : <IconPlus size={16} />}
          {state === "error" ? "Try adding again" : "Add to history"}
        </Button>
      )}
      {state === "error" && error ? (
        <span role="alert" style={{ color: "var(--neg)", fontSize: 13 }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ per-section states */
function SectionSkeleton({ label }: { label: string }) {
  return (
    <div className={s.section} role="status" aria-busy="true" aria-live="polite">
      <span className="sr-only">{label}</span>
      <Card>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <Spinner large />
          <span style={{ color: "var(--text-2)" }}>{label}</span>
        </div>
        <Skeleton width={120} height={64} />
        <div style={{ height: 16 }} />
        <Skeleton height={14} />
      </Card>
      <Card>
        <Skeleton height={22} width="40%" />
        <div style={{ height: 16 }} />
        <Skeleton height={180} />
      </Card>
    </div>
  );
}

function SectionError({ error, onRetry, what }: { error: unknown; onRetry: () => void; what: string }) {
  if (isApiError(error) && error.code === "NO_ELIGIBLE_STOCK") {
    const reason = typeof error.extra?.reason === "string" ? error.extra.reason : null;
    const suggestion = typeof error.extra?.suggestion === "string" ? error.extra.suggestion : null;
    return (
      <EmptyState
        title={`No ${what} found for these preferences`}
        message={
          <>
            {reason ?? error.message}
            {suggestion ? (
              <>
                <br />
                {suggestion}
              </>
            ) : null}
          </>
        }
        action={
          <Button variant="secondary" size="sm" onClick={onRetry}>
            Retry
          </Button>
        }
      />
    );
  }
  return <ErrorState title={`We couldn't get the ${what}`} message={errorMessage(error)} onRetry={onRetry} />;
}

/* ------------------------------------------------------------------ result page */
export function ResultPage({ prefs, onAdjust, restored }: { prefs: Preferences; onAdjust: () => void; restored?: RecSession | null }) {
  const [tab, setTabState] = useState<RecMode>(restored?.tab ?? "single");
  // the benchmark comparisons fetched so far live in the session, so a restored page reuses them
  const [benchCache] = useState(() => restored?.benchCache ?? new Map<ComparisonWindow, ComparisonResult>());
  useEffect(() => updateRecSession({ benchCache }), [benchCache]);
  const setTab = (t: RecMode) => {
    setTabState(t);
    updateRecSession({ tab: t });
  };
  // both sections start at the same moment and load INDEPENDENTLY (no full-page blocker); a restored session brings its results with it, so nothing is asked for again
  const single = useResource((signal) => getRecommendation({ ...prefs, mode: "single" }, signal), [], { initialData: restored?.single ?? undefined });
  const portfolio = useResource((signal) => getRecommendation({ ...prefs, mode: "portfolio" }, signal), [], { initialData: restored?.portfolio ?? undefined });

  // keep the memory of the latest recommendation up to date (see session-memory.ts)
  useEffect(() => {
    if (single.data) updateRecSession({ single: single.data });
  }, [single.data]);
  useEffect(() => {
    if (portfolio.data) updateRecSession({ portfolio: portfolio.data });
  }, [portfolio.data]);

  // coming back from the history page: scroll to where the visitor was. The router scrolls to the top after the page appears, so this runs a little later too.
  useEffect(() => {
    if (!restored || restored.scrollY <= 0) return;
    const y = restored.scrollY;
    const go = () => window.scrollTo({ top: y, behavior: "instant" });
    const raf = requestAnimationFrame(() => requestAnimationFrame(go));
    const t1 = window.setTimeout(go, 120);
    const t2 = window.setTimeout(go, 400);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const singleData = single.data?.data as SingleResult | undefined;
  const portfolioData = portfolio.data?.data as PortfolioResult | undefined;

  const tabs = [
    { value: "single" as const, label: <>Single stock{single.loading ? <span style={{ marginLeft: 8, display: "inline-flex" }}><Spinner /></span> : null}</> },
    { value: "portfolio" as const, label: <>Portfolio{portfolio.loading ? <span style={{ marginLeft: 8, display: "inline-flex" }}><Spinner /></span> : null}</> },
  ];

  return (
    <div className={s.wrap}>
      <div className={s.resultHead}>
        <div className={s.chips} aria-label="Your preferences">
          <Chip>{formatAmd(prefs.amountAmd)}</Chip>
          <Chip>{riskLabel(prefs.risk)} risk</Chip>
          <Chip>{horizonLabel(prefs.horizon)}</Chip>
        </div>
        <div className={s.resultActions}>
          <Button variant="secondary" onClick={onAdjust}>
            Adjust Preferences
          </Button>
        </div>
      </div>

      <Tabs label="Recommendation type" value={tab} tabs={tabs} onChange={setTab} idPrefix="rec" />

      <div role="tabpanel" id="rec-panel-single" aria-labelledby="rec-tab-single" hidden={tab !== "single"}>
        {single.status === "error" && !singleData ? (
          <SectionError error={single.error} onRetry={single.reload} what="single-stock recommendation" />
        ) : !singleData ? (
          <SectionSkeleton label="Finding the best single-stock match" />
        ) : (
          <div className={s.section} aria-busy={single.loading}>
            <ScoreCard result={singleData} action={<AddToHistory result={singleData} alreadySaved={restored?.saved.single ?? false} onSaved={() => markSaved("single")} />} />
            <SingleView result={singleData} />
          </div>
        )}
      </div>

      <div role="tabpanel" id="rec-panel-portfolio" aria-labelledby="rec-tab-portfolio" hidden={tab !== "portfolio"}>
        {portfolio.status === "error" && !portfolioData ? (
          <SectionError error={portfolio.error} onRetry={portfolio.reload} what="portfolio recommendation" />
        ) : !portfolioData ? (
          <SectionSkeleton label="Building your portfolio" />
        ) : (
          <div className={s.section} aria-busy={portfolio.loading}>
            <ScoreCard result={portfolioData} action={<AddToHistory result={portfolioData} alreadySaved={restored?.saved.portfolio ?? false} onSaved={() => markSaved("portfolio")} />} />
            <PortfolioView result={portfolioData} benchmark={<BenchmarkSection result={portfolioData} memory={{ window: restored?.benchWindow ?? null, cache: benchCache, onWindow: (w) => updateRecSession({ benchWindow: w }) }} />} />
          </div>
        )}
      </div>
    </div>
  );
}
