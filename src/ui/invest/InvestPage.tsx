"use client";

import { useEffect, useState } from "react";
import { LinkButton } from "../components/Button";
import { Disclaimer, PageHeader } from "../shell/AppShell";
import { useSession } from "../shell/Session";
import { ResultPage } from "./ResultPage";
import { clearRecSession, clearResumeRequest, peekResume, rememberScroll, startRecSession } from "./session-memory";
import { StepFlow, type Preferences } from "./StepFlow";
import s from "./invest.module.css";

/**
 * Investment Recommendation. The preferences live ONLY in this component's memory: nothing is written to
 * localStorage / sessionStorage / the URL, and nothing is read from any other feature. `runId` is the React key of the
 * whole flow, so Adjust Preferences remounts it and always begin with a completely clean form.
 */
export function InvestPage() {
  const { user } = useSession();
  // "Back to my recommendation" on the history page asks for the latest recommendation back, exactly as it was left; any other visit starts clean
  const [restored, setRestored] = useState(() => peekResume(user.id));
  const [runId, setRunId] = useState(0);
  const [prefs, setPrefs] = useState<Preferences | null>(() => restored?.prefs ?? null);
  useEffect(() => clearResumeRequest(), []);

  const restart = () => {
    clearRecSession();
    setRestored(null);
    setPrefs(null);
    setRunId((n) => n + 1);
  };
  const submit = (p: Preferences) => {
    startRecSession(user.id, p);
    setPrefs(p);
  };
  return (
    <>
      <PageHeader
        title="Investment Recommendation"
        subtitle="Answer a few questions and see companies that fit your risk and horizon. Information only: no trades are made."
        actions={
          <LinkButton href="/invest/history" variant="secondary" size="sm" onClick={rememberScroll}>
            Recommendation History
          </LinkButton>
        }
      />
      <div key={runId} className={prefs ? undefined : s.narrow}>
        {prefs ? <ResultPage prefs={prefs} onAdjust={restart} restored={restored} /> : <StepFlow onSubmit={submit} />}
      </div>
      <Disclaimer>
        Finova is an informational tool and does not give personal investment advice. Recommendations come from a rules-based method applied to public, delayed data. Past performance does not guarantee future results, and any investment can lose value. Finova does not execute trades.
      </Disclaimer>
    </>
  );
}
