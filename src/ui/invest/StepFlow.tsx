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
import { useT } from "../i18n";
import { formatAmd, formatDate, formatNumber, formatUsd } from "../lib/format";
import { amountProblem, HORIZONS, horizonHelp, horizonLabel, progressPercent, RISKS, riskHelp, riskLabel } from "./labels";
import s from "./invest.module.css";

export interface Preferences {
  amountAmd: number;
  risk: Risk;
  horizon: Horizon;
}

type Step = 1 | 2 | 3 | 4;
const STEP_NAME_KEYS = { 1: "invest.flow.stepNames.amount", 2: "invest.flow.stepNames.risk", 3: "invest.flow.stepNames.horizon", 4: "invest.flow.stepNames.review" } as const;

function UsdEquivalent({ raw }: { raw: string }) {
  const t = useT();
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
            <span className="sr-only"> {t("invest.usd.isAbout")} </span> {formatUsd(res.data.data.usd, 0)} USD
          </span>
          <span className={s.usdMeta}>
            {t(res.data.meta.stale ? "invest.usd.rateStale" : "invest.usd.rate", {
              rate: formatNumber(res.data.data.rate, 2),
              source: res.data.data.source,
              date: formatDate(res.data.data.rateDate),
            })}
          </span>
        </>
      ) : failed ? (
        <>
          <span className={s.usdBig}>{formatNumber(amount)} AMD</span>
          <span className={s.usdMeta}>{t("invest.usd.unavailable")}</span>
        </>
      ) : (
        <>
          <Spinner label={t("invest.usd.converting")} />
          <span className={s.usdMeta}>{t("invest.usd.convertingDots")}</span>
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
 * (Adjust Preferences) always gives a completely clean form. Changing the language only re-renders it: the answers are kept.
 */
export function StepFlow({ onSubmit }: { onSubmit: (p: Preferences) => void }) {
  const t = useT();
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
  const riskErr = touched.risk && !risk ? t("invest.flow.errRisk") : null;
  const horizonErr = touched.horizon && !horizon ? t("invest.flow.errHorizon") : null;
  const confirmErr = touched.confirm && !confirmed ? t("invest.flow.errConfirm") : null;
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
          label={t("invest.flow.amountLabel")}
          name="amount"
          unit="AMD"
          maxDecimals={0}
          liveFormat
          placeholder={t("invest.flow.amountPlaceholder")}
          autoFocus
          value={amount}
          onChange={(v) => setAmount(v)}
          onBlur={() => amount && setTouched((t) => ({ ...t, amount: true }))}
          error={amountErr}
          hint={t("invest.flow.amountHint")}
        />
        <UsdEquivalent raw={amount} />
      </div>
    );
  if (step === 2)
    body = (
      <fieldset className={s.choices} aria-describedby={riskErr ? "risk-err" : undefined}>
        <legend className="sr-only">{t("invest.flow.riskLegend")}</legend>
        {RISKS.map((r) => (
          <Choice key={r} name="risk" value={r} label={riskLabel(t, r)} help={riskHelp(t, r)} checked={risk === r} onChange={() => setRisk(r)} />
        ))}
      </fieldset>
    );
  if (step === 3)
    body = (
      <fieldset className={s.choices} aria-describedby={horizonErr ? "horizon-err" : undefined}>
        <legend className="sr-only">{t("invest.flow.horizonLegend")}</legend>
        {HORIZONS.map((h) => (
          <Choice key={h} name="horizon" value={h} label={horizonLabel(t, h)} help={horizonHelp(t, h)} checked={horizon === h} onChange={() => setHorizon(h)} />
        ))}
      </fieldset>
    );
  if (step === 4)
    body = (
      <div className={s.stepBody}>
        <dl className={s.reviewList}>
          <div className={s.reviewRow}>
            <dt>{t("invest.flow.reviewAmount")}</dt>
            <dd>{formatAmd(Number(amount))}</dd>
            <Button variant="ghost" size="sm" onClick={() => setStep(1)} aria-label={t("invest.flow.changeAmount")}>
              {t("invest.flow.change")}
            </Button>
          </div>
          <div className={s.reviewRow}>
            <dt>{t("invest.flow.reviewRisk")}</dt>
            <dd>{risk ? riskLabel(t, risk) : "-"}</dd>
            <Button variant="ghost" size="sm" onClick={() => setStep(2)} aria-label={t("invest.flow.changeRisk")}>
              {t("invest.flow.change")}
            </Button>
          </div>
          <div className={s.reviewRow}>
            <dt>{t("invest.flow.reviewHorizon")}</dt>
            <dd>{horizon ? horizonLabel(t, horizon) : "-"}</dd>
            <Button variant="ghost" size="sm" onClick={() => setStep(3)} aria-label={t("invest.flow.changeHorizon")}>
              {t("invest.flow.change")}
            </Button>
          </div>
        </dl>
        <Checkbox label={t("invest.flow.emergency")} checked={confirmed} onChange={setConfirmed} error={confirmErr} />
        <p className={s.miniNote}>{t("invest.flow.miniNote")}</p>
      </div>
    );

  const heading: Record<Step, { title: string; lead: string }> = {
    1: { title: t("invest.flow.title1"), lead: t("invest.flow.lead1") },
    2: { title: t("invest.flow.title2"), lead: t("invest.flow.lead2") },
    3: { title: t("invest.flow.title3"), lead: t("invest.flow.lead3") },
    4: { title: t("invest.flow.title4"), lead: t("invest.flow.lead4") },
  };
  // "Step <b>2</b> of 4 · Risk tolerance": the number is bold, so the text is cut at its {step} placeholder
  const [stepBefore, stepAfter] = t("invest.flow.stepOf", { name: t(STEP_NAME_KEYS[step]) }).split("{step}");

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
            {stepBefore}
            {stepAfter === undefined ? null : <strong>{step}</strong>}
            {stepAfter}
          </span>
          <span>{t("invest.flow.complete", { pct })}</span>
        </div>
        <ProgressBar value={pct} label={t("invest.flow.progressLabel")} valueText={t("invest.flow.progressText", { pct, step })} />
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
            {t("invest.flow.back")}
          </Button>
        ) : (
          <span />
        )}
        <Button type="submit" variant="primary">
          {step === 4 ? t("invest.flow.getRecommendation") : t("invest.flow.continue")}
          {step === 4 ? null : <IconArrowRight size={16} />}
        </Button>
      </div>
    </form>
  );
}
