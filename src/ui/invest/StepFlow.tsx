"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { getConvert } from "../api/invest";
import type { Horizon, Risk } from "../api/types";
import { Button } from "../components/Button";
import { ProgressBar } from "../components/Display";
import { Spinner } from "../components/Feedback";
import { AmountField, Checkbox } from "../components/Fields";
import { IconArrowLeft, IconArrowRight, IconCheck } from "../components/Icons";
import { useDebounced } from "../hooks/useDebounce";
import { useResource } from "../hooks/useResource";
import { formatAmd, formatDate, formatNumber, formatUsd } from "../lib/format";
import { amountProblem, EMERGENCY_LABEL, HORIZONS, horizonLabel, progressPercent, RISKS, riskLabel } from "./labels";
import s from "./invest.module.css";

export interface Preferences {
  amountAmd: number;
  risk: Risk;
  horizon: Horizon;
}

type Step = 1 | 2 | 3 | 4;
const STEP_NAMES: Record<Step, string> = { 1: "Amount", 2: "Risk tolerance", 3: "Investment horizon", 4: "Review" };

function UsdEquivalent({ raw }: { raw: string }) {
  const valid = amountProblem(raw) === null;
  const amount = valid ? Number(raw) : 0;
  const debounced = useDebounced(amount, 300);
  const res = useResource((signal) => getConvert(debounced, signal), [debounced], { enabled: valid && debounced > 0 });
  if (!valid) return <div className={s.usd} aria-live="polite" />;
  const fresh = res.data && res.data.data.amountAmd === String(debounced) && debounced === amount;
  const failed = res.status === "error" && debounced === amount;
  return (
    <div className={s.usd} aria-live="polite">
      {fresh && res.data ? (
        <>
          <span className={s.usdBig}>
            {formatNumber(amount)} AMD <span aria-hidden="true">≈</span>
            <span className="sr-only"> is about </span> {formatUsd(res.data.data.usd, 0)} USD
          </span>
          <span className={s.usdMeta}>
            Rate {formatNumber(res.data.data.rate, 2)} AMD per USD, {res.data.data.source}, {formatDate(res.data.data.rateDate)}
            {res.data.meta.stale ? " (may be out of date)" : ""}
          </span>
        </>
      ) : failed ? (
        <>
          <span className={s.usdBig}>{formatNumber(amount)} AMD</span>
          <span className={s.usdMeta}>USD equivalent unavailable right now.</span>
        </>
      ) : (
        <>
          <Spinner label="Converting to USD" />
          <span className={s.usdMeta}>Converting to USD...</span>
        </>
      )}
    </div>
  );
}

function Choice({ name, value, label, help, checked, onChange }: { name: string; value: string; label: string; help: string; checked: boolean; onChange: () => void }) {
  return (
    <label className={s.choice}>
      <input type="radio" name={name} value={value} checked={checked} onChange={onChange} />
      <span className={s.choiceTop}>
        <span className={s.choiceName}>{label}</span>
        <span className={s.radioDot} aria-hidden="true">
          <IconCheck size={12} strokeWidth={3} />
        </span>
      </span>
      <span className={s.choiceHelp}>{help}</span>
    </label>
  );
}

/**
 * The step-by-step preference form. ALL of its state lives in this component only (no storage, no URL): remounting it
 * (Adjust Preferences / Start Over) always gives a completely clean form.
 */
export function StepFlow({ onSubmit }: { onSubmit: (p: Preferences) => void }) {
  const [step, setStep] = useState<Step>(1);
  const [amount, setAmount] = useState("");
  const [risk, setRisk] = useState<Risk | null>(null);
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [touched, setTouched] = useState<{ amount?: boolean; risk?: boolean; horizon?: boolean; confirm?: boolean }>({});
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [step]);

  const amountErr = touched.amount ? amountProblem(amount) : null;
  const riskErr = touched.risk && !risk ? "Choose how much risk you are comfortable with." : null;
  const horizonErr = touched.horizon && !horizon ? "Choose how long you plan to invest." : null;
  const confirmErr = touched.confirm && !confirmed ? "Please confirm this before you continue." : null;
  const pct = progressPercent({ amount, risk, horizon, confirmed });

  function next() {
    if (step === 1) {
      if (amountProblem(amount)) return setTouched((t) => ({ ...t, amount: true }));
      setStep(2);
    } else if (step === 2) {
      if (!risk) return setTouched((t) => ({ ...t, risk: true }));
      setStep(3);
    } else if (step === 3) {
      if (!horizon) return setTouched((t) => ({ ...t, horizon: true }));
      setStep(4);
    } else {
      if (!confirmed) return setTouched((t) => ({ ...t, confirm: true }));
      if (amountProblem(amount) || !risk || !horizon) return;
      onSubmit({ amountAmd: Number(amount), risk, horizon });
    }
  }

  const back = () => setStep((st) => (st > 1 ? ((st - 1) as Step) : st));

  let body: ReactNode = null;
  if (step === 1)
    body = (
      <div className={s.stepBody}>
        <AmountField
          label="Investment amount"
          name="amount"
          unit="AMD"
          maxDecimals={0}
          liveFormat
          placeholder="e.g. 500,000"
          autoFocus
          value={amount}
          onChange={(v) => setAmount(v)}
          onBlur={() => amount && setTouched((t) => ({ ...t, amount: true }))}
          error={amountErr}
          hint="Between 1,000 and 1,000,000,000 AMD."
        />
        <UsdEquivalent raw={amount} />
      </div>
    );
  if (step === 2)
    body = (
      <fieldset className={s.choices} aria-describedby={riskErr ? "risk-err" : undefined}>
        <legend className="sr-only">Risk tolerance</legend>
        {RISKS.map((r) => (
          <Choice key={r.value} name="risk" value={r.value} label={r.label} help={r.help} checked={risk === r.value} onChange={() => setRisk(r.value)} />
        ))}
      </fieldset>
    );
  if (step === 3)
    body = (
      <fieldset className={s.choices} aria-describedby={horizonErr ? "horizon-err" : undefined}>
        <legend className="sr-only">Investment horizon</legend>
        {HORIZONS.map((h) => (
          <Choice key={h.value} name="horizon" value={h.value} label={h.label} help={h.help} checked={horizon === h.value} onChange={() => setHorizon(h.value)} />
        ))}
      </fieldset>
    );
  if (step === 4)
    body = (
      <div className={s.stepBody}>
        <dl className={s.reviewList}>
          <div className={s.reviewRow}>
            <dt>Amount</dt>
            <dd>{formatAmd(Number(amount))}</dd>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
              Change<span className="sr-only"> amount</span>
            </Button>
          </div>
          <div className={s.reviewRow}>
            <dt>Risk tolerance</dt>
            <dd>{risk ? riskLabel(risk) : "-"}</dd>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)}>
              Change<span className="sr-only"> risk tolerance</span>
            </Button>
          </div>
          <div className={s.reviewRow}>
            <dt>Investment horizon</dt>
            <dd>{horizon ? horizonLabel(horizon) : "-"}</dd>
            <Button variant="ghost" size="sm" onClick={() => setStep(3)}>
              Change<span className="sr-only"> horizon</span>
            </Button>
          </div>
        </dl>
        <Checkbox label={EMERGENCY_LABEL} checked={confirmed} onChange={setConfirmed} error={confirmErr} />
        <p className={s.miniNote}>Finova provides information only. Results are not personal investment advice and no trades are made.</p>
      </div>
    );

  const heading: Record<Step, { title: string; lead: string }> = {
    1: { title: "How much would you like to invest?", lead: "Enter the amount in Armenian dram. We show the US dollar equivalent as you type." },
    2: { title: "How much risk are you comfortable with?", lead: "This decides how steady or how fast-moving the companies we look at can be." },
    3: { title: "How long do you plan to invest?", lead: "A longer horizon lets us look at companies with more time to grow." },
    4: { title: "Review your preferences", lead: "Check the details, then ask for your recommendation." },
  };

  return (
    <form
      className={s.flowCard}
      onSubmit={(e) => {
        e.preventDefault();
        next();
      }}
      noValidate
      aria-labelledby="flow-title"
    >
      <div className={s.stepHead}>
        <div className={s.stepMeta}>
          <span>
            Step <strong>{step}</strong> of 4 · {STEP_NAMES[step]}
          </span>
          <span>{pct}% complete</span>
        </div>
        <ProgressBar value={pct} label="Recommendation progress" valueText={`${pct}% complete, step ${step} of 4`} />
      </div>
      <div className={s.stepHead}>
        <h2 id="flow-title" className={s.stepTitle} tabIndex={-1} ref={headingRef} style={{ outline: "none" }}>
          {heading[step].title}
        </h2>
        <p className={s.stepLead}>{heading[step].lead}</p>
      </div>
      {body}
      {riskErr ? (
        <p id="risk-err" role="alert" style={{ color: "var(--neg)", fontSize: 13 }}>
          {riskErr}
        </p>
      ) : null}
      {horizonErr ? (
        <p id="horizon-err" role="alert" style={{ color: "var(--neg)", fontSize: 13 }}>
          {horizonErr}
        </p>
      ) : null}
      <div className={s.stepActions}>
        {step > 1 ? (
          <Button variant="ghost" onClick={back}>
            <IconArrowLeft size={16} />
            Back
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary">
          {step === 4 ? "Get recommendation" : "Continue"}
          {step === 4 ? null : <IconArrowRight size={16} />}
        </Button>
      </div>
    </form>
  );
}
