"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { getPeriod } from "../api/pf";
import type { PeriodView } from "../api/types";
import { Card, Chip, Segmented, Tabs } from "../components/Display";
import { IconAlert, IconCheck, IconInfo } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { useT } from "../i18n";
import { formatAmd, formatPercent } from "../lib/format";
import { analyse, barShares, flexLineOf, goalLine, moneyFromForm, moneyOf, trimResult, type Analysis } from "./advice-rules";
import { shiftMonth, type FormState, type Selection } from "./calc";
import s from "./advice.module.css";
import { rich } from "./rich";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
const LEVEL_TONE = { high: "neg", medium: "warn", low: "neutral" } as const;

/* ------------------------------------------------------------------ 1. Insights: what is happening */
function Ring({ value }: { value: number }) {
  const v = Math.max(0, Math.min(1, value));
  const r = 44;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 120 120" className={s.ring} aria-hidden="true">
      <circle cx="60" cy="60" r={r} className={s.ringTrack} />
      <circle cx="60" cy="60" r={r} className={s.ringFill} strokeDasharray={`${c * v} ${c}`} transform="rotate(-90 60 60)" />
    </svg>
  );
}

function SplitBar({ a, income }: { a: Analysis; income: number }) {
  const t = useT();
  const sh = barShares(a, income);
  const base = Math.max(income, a.spent, 1);
  const pct = (n: number) => formatPercent((n / base) * 100, 0);
  return (
    <div>
      <div className={s.barLabel}>{t("pf.advice.insights.yourPeriod")}</div>
      <div className={s.bar} role="img" aria-label={t("pf.advice.insights.barAria", { needs: pct(a.needs), wants: pct(a.wants), other: pct(a.rest), left: pct(Math.max(0, a.available)) })}>
        <span className={s.segNeeds} style={{ width: `${sh.needs}%` }} />
        <span className={s.segWants} style={{ width: `${sh.wants}%` }} />
        <span className={s.segRest} style={{ width: `${sh.rest}%` }} />
        <span className={s.segLeft} style={{ width: `${sh.left}%` }} />
      </div>
      <div className={cx(s.barLabel, s.guideGap)}>{t("pf.advice.insights.guide")}</div>
      <div className={cx(s.bar, s.barGuide)} aria-hidden="true">
        <span className={s.segNeeds} style={{ width: "50%" }} />
        <span className={s.segWants} style={{ width: "30%" }} />
        <span className={s.segLeft} style={{ width: "20%" }} />
      </div>
      <ul className={s.legend}>
        <li><i className={s.segNeeds} />{t("pf.advice.insights.needs", { pct: pct(a.needs) })}</li>
        <li><i className={s.segWants} />{t("pf.advice.insights.wants", { pct: pct(a.wants) })}</li>
        <li><i className={s.segRest} />{t("pf.advice.insights.other", { pct: pct(a.rest) })}</li>
        <li><i className={s.segLeft} />{t("pf.advice.insights.left", { pct: pct(Math.max(0, a.available)) })}</li>
      </ul>
    </div>
  );
}

function Insights({ a, income, monthly }: { a: Analysis; income: number; monthly: boolean }) {
  const t = useT();
  const v = a.versus;
  return (
    <div className={s.grid}>
      <div className={s.tile}>
        <span className={s.tileLabel}>{t("pf.advice.insights.leftOver")}</span>
        <div className={s.ringWrap}>
          <Ring value={a.rate} />
          <span className={s.ringNum}>{formatPercent(a.rate * 100, 0)}</span>
        </div>
        <p className={s.tileText}>{a.available >= 0 ? t("pf.advice.insights.leftOfIncome", { left: formatAmd(a.available), income: formatAmd(income) }) : t("pf.advice.insights.shortThisPeriod", { amount: formatAmd(-a.available) })}</p>
      </div>
      <div className={cx(s.tile, s.wide)}>
        <span className={s.tileLabel}>{t("pf.advice.insights.splitTitle")}</span>
        <SplitBar a={a} income={income} />
      </div>
      <div className={s.tile}>
        <span className={s.tileLabel}>{t("pf.advice.insights.biggest")}</span>
        {a.biggest ? (
          <>
            <p className={s.big}>{a.biggest.label}</p>
            <p className={s.tileText}>{t("pf.advice.insights.biggestLine", { amount: formatAmd(a.biggest.amount), pct: formatPercent((a.biggest.amount / a.spent) * 100, 0) })}</p>
          </>
        ) : (
          <p className={s.tileText}>{t("pf.advice.insights.nothing")}</p>
        )}
      </div>
      <div className={cx(s.tile, s.wide)}>
        <span className={s.tileLabel}>{t("pf.advice.insights.compare")}</span>
        {v ? (
          <>
            <p className={s.big}>
              {v.change >= 0 ? "+" : "−"}
              {formatPercent(Math.abs(v.change) * 100, 0)}
            </p>
            <p className={s.tileText}>
              {v.change >= 0 ? t("pf.advice.insights.wentUp") : t("pf.advice.insights.wentDown")}
              {v.mover && v.mover.diff !== 0 ? ` ${t("pf.advice.insights.mover", { label: v.mover.label, change: `${v.mover.diff > 0 ? "+" : "−"}${formatAmd(Math.abs(v.mover.diff))}` })}` : ""}
            </p>
          </>
        ) : (
          <p className={s.tileText}>{monthly ? t("pf.advice.insights.saveBoth") : t("pf.advice.insights.calendarOnly")}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Alerts: what needs attention */
function Alerts({ a }: { a: Analysis }) {
  const t = useT();
  const [open, setOpen] = useState<string | null>(null);
  const uid = useId();
  if (a.alerts.length === 0)
    return (
      <p className={s.allClear}>
        <IconCheck size={18} /> {t("pf.advice.alerts.allClear")}
      </p>
    );
  return (
    <ul className={s.alertList}>
      {a.alerts.map((x) => (
        <li key={x.id} className={cx(s.alert, s[`alert_${x.level}`])}>
          <div className={s.alertHead}>
            <span className={s.alertIcon}>
              <IconAlert size={18} />
            </span>
            <div className={s.alertBody}>
              <div className={s.alertTitleRow}>
                <strong>{x.title}</strong>
                <Chip tone={LEVEL_TONE[x.level]}>{t(`pf.advice.level.${x.level}`)}</Chip>
              </div>
              <p className={s.alertText}>{x.text}</p>
              <button type="button" className={s.why} aria-expanded={open === x.id} aria-controls={`${uid}-${x.id}`} onClick={() => setOpen(open === x.id ? null : x.id)}>
                <IconInfo size={14} /> {t("pf.advice.alerts.why")}
              </button>
              {open === x.id ? (
                <p className={s.whyText} id={`${uid}-${x.id}`}>
                  {x.why}
                </p>
              ) : null}
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ 3. Suggestions: what to do */
function Suggestions({ a, income }: { a: Analysis; income: number }) {
  const t = useT();
  const uid = useId();
  const [key, setKey] = useState<string | null>(null);
  const [cut, setCut] = useState(10);
  const [goalPct, setGoalPct] = useState(20);
  const pick = a.flexible.find((x) => x.key === key) ?? a.flexible[0] ?? null;
  const r = pick ? trimResult(a, income, pick.amount, cut) : null;
  const goal = goalLine(a, income, goalPct / 100);

  return (
    <div className={s.suggestGrid}>
      {a.alerts.length > 0 ? (
        <div className={cx(s.suggestCard, s.fullRow)}>
          <p className={s.cardEyebrow}>{t("pf.advice.suggest.fromAlerts")}</p>
          <h4 className={s.cardTitle}>{t("pf.advice.suggest.oneThing")}</h4>
          <ul className={s.actionList}>
            {a.alerts.map((x) => (
              <li key={x.id} className={s.action}>
                <span className={s.actionLabel}>{t("pf.advice.suggest.forAlert", { title: x.title })}</span>
                {x.action}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pick && r ? (
        <div className={s.suggestCard}>
          <p className={s.cardEyebrow}>{t("pf.advice.suggest.whatIf")}</p>
          <h4 className={s.cardTitle}>{t("pf.advice.suggest.smallChange")}</h4>
          <div className={s.row}>
            <label className={s.fieldLabel} htmlFor={`${uid}-cat`}>
              {t("pf.advice.suggest.trim")}
            </label>
            <select id={`${uid}-cat`} className={s.select} value={pick.key} onChange={(e) => setKey(e.target.value)}>
              {a.flexible.map((x) => (
                <option key={x.key} value={x.key}>
                  {t("pf.rules.catAmount", { label: x.label, amount: formatAmd(x.amount) })}
                </option>
              ))}
            </select>
          </div>
          <div className={s.row}>
            <label className={s.fieldLabel} htmlFor={`${uid}-cut`}>
              {t("pf.advice.suggest.by", { cut })}
            </label>
            <input id={`${uid}-cut`} type="range" min={0} max={50} step={5} value={cut} onChange={(e) => setCut(Number(e.target.value))} className={s.range} />
          </div>
          <div className={s.result}>
            <div>
              <span className={s.resultLabel}>{t("pf.advice.suggest.perPeriod")}</span>
              <strong>+{formatAmd(r.saved)}</strong>
            </div>
            <div>
              <span className={s.resultLabel}>{t("pf.advice.suggest.over12")}</span>
              <strong>+{formatAmd(r.year)}</strong>
            </div>
            <div>
              <span className={s.resultLabel}>{t("pf.advice.suggest.leftBecomes")}</span>
              <strong>{formatPercent(r.newRate * 100, 0)}</strong>
            </div>
          </div>
          <p className={s.fine}>{t("pf.advice.suggest.savingsOnly")}</p>
        </div>
      ) : null}

      <div className={s.suggestCard}>
        <p className={s.cardEyebrow}>{t("pf.advice.suggest.target")}</p>
        <h4 className={s.cardTitle}>{t("pf.advice.suggest.payFirst")}</h4>
        <Segmented label={t("pf.advice.suggest.targetLabel")} value={String(goalPct)} onChange={(v) => setGoalPct(Number(v))} options={[{ value: "10", label: "10%" }, { value: "15", label: "15%" }, { value: "20", label: "20%" }]} />
        <p className={s.goalText}>{rich(t, "pf.advice.suggest.setAside", { goal: <strong>{goalPct}%</strong>, amount: <strong>{formatAmd(goal.amount)}</strong> })}</p>
        {goal.reached ? (
          <p className={s.goalText}>
            <IconCheck size={16} /> {t("pf.advice.suggest.reached")}
          </p>
        ) : (
          <p className={s.goalText}>
            {rich(t, "pf.advice.suggest.gap", { gap: <strong>{formatAmd(goal.gap)}</strong> })}
            {a.flexible.length > 0 ? ` ${t("pf.advice.suggest.flexible", { places: flexLineOf(a.flexible) })}` : ""}
          </p>
        )}
      </div>

      <div className={s.suggestCard}>
        <p className={s.cardEyebrow}>{t("pf.advice.suggest.essentials")}</p>
        <h4 className={s.cardTitle}>{t("pf.advice.suggest.cushionTitle")}</h4>
        <p className={s.goalText} style={{ marginTop: 0 }}>
          {rich(t, "pf.advice.suggest.cushion", { needs: <strong>{formatAmd(a.needs)}</strong> })}
        </p>
      </div>
    </div>
  );
}

type Tab = "insights" | "alerts" | "suggestions";

/** the value after it has stayed the same for `ms` (the first value is used at once) */
function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

/** what to show until there is enough to explain: a nudge, plus a taste of the three levels */
function Starter({ a }: { a: Analysis }) {
  const t = useT();
  const none = !a.hasIncome && a.spent === 0;
  return (
    <>
      <p className={s.motivation}>
        {none ? t("pf.advice.starter.none") : a.hasIncome ? t("pf.advice.starter.hasIncome") : t("pf.advice.starter.noIncome")}
        {a.biggest && !a.hasIncome ? ` ${t("pf.advice.starter.biggest", { label: a.biggest.label, amount: formatAmd(a.biggest.amount) })}` : ""}
      </p>
      <div className={s.grid}>
        <div className={cx(s.tile, s.tileMuted)}>
          <span className={s.tileLabel}>{t("pf.advice.starter.insightsTitle")}</span>
          <p className={s.tileText}>{t("pf.advice.starter.insightsText")}</p>
        </div>
        <div className={cx(s.tile, s.tileMuted)}>
          <span className={s.tileLabel}>{t("pf.advice.starter.alertsTitle")}</span>
          <p className={s.tileText}>{t("pf.advice.starter.alertsText")}</p>
        </div>
        <div className={cx(s.tile, s.tileMuted)}>
          <span className={s.tileLabel}>{t("pf.advice.starter.suggestionsTitle")}</span>
          <p className={s.tileText}>{t("pf.advice.starter.suggestionsText")}</p>
        </div>
      </div>
    </>
  );
}

/**
 * "Your money, explained": insights, alerts and suggestions for the selected period, at the bottom of the page. It is always
 * there: it starts with a nudge, then follows what the user types above (after a short pause, so half-typed amounts do not
 * raise false alarms). For calendar months it also reads the SAVED previous month for a comparison. It never touches Investment.
 */
export function Advice({ form, selection, dirty }: { form: FormState; selection: Selection; dirty: boolean }) {
  const t = useT(); // the rules write their sentences in the chosen language, so they are worked out again when it changes
  const prevMonth = selection.kind === "month" ? shiftMonth(selection.month, -1) : null;
  const prevRes = useResource<PeriodView>((signal) => getPeriod({ kind: "month", month: prevMonth! }, signal), [prevMonth], { enabled: prevMonth !== null });
  const prev = prevMonth !== null && prevRes.data?.exists ? moneyOf(prevRes.data) : null;
  const [tab, setTab] = useState<Tab>("insights");

  const settled = useDebounced(form, 450);
  const now = useMemo(() => moneyFromForm(settled), [settled, t]);
  const a = useMemo(() => analyse(now, prev), [now, prev, t]);

  const showAll = a.hasIncome && a.spent > 0;
  const tabs: { value: Tab; label: ReactNode }[] = [
    { value: "insights", label: t("pf.advice.tabInsights") },
    { value: "alerts", label: <>{t("pf.advice.tabAlerts")} <span className={cx(s.count, a.alerts.length > 0 && s.countHot)}>{a.alerts.length}</span></> },
    { value: "suggestions", label: t("pf.advice.tabSuggestions") },
  ];

  return (
    <Card title={t("pf.advice.title")} eyebrow={t("pf.advice.eyebrow")} aria-label={t("pf.advice.title")}>
      {showAll ? (
        <>
          <p className={s.story} aria-live="polite">
            {a.available >= 0
              ? rich(t, "pf.advice.storyKept", { income: <strong>{formatAmd(now.income)}</strong>, spent: <strong>{formatAmd(a.spent)}</strong>, left: <strong className={s.pos}>{formatAmd(a.available)}</strong> })
              : rich(t, "pf.advice.storyShort", {
                  income: <strong>{formatAmd(now.income)}</strong>,
                  spent: <strong>{formatAmd(a.spent)}</strong>,
                  short: <strong className={s.neg}>{t("pf.advice.storyShortValue", { amount: formatAmd(-a.available) })}</strong>,
                })}
          </p>
          <Tabs label={t("pf.advice.tabsLabel")} value={tab} tabs={tabs} onChange={setTab} idPrefix="adv" />
          <div className={s.panel} role="tabpanel" id={`adv-panel-${tab}`} aria-labelledby={`adv-tab-${tab}`}>
            {tab === "insights" ? <Insights a={a} income={now.income!} monthly={selection.kind === "month"} /> : tab === "alerts" ? <Alerts a={a} /> : <Suggestions a={a} income={now.income!} />}
          </div>
        </>
      ) : (
        <Starter a={a} />
      )}
      {dirty && showAll ? <p className={s.stale}>{t("pf.advice.stale")}</p> : null}
      <p className={s.fine} style={{ marginTop: "var(--s-5)" }}>
        {t("pf.advice.disclaimer")}
      </p>
    </Card>
  );
}
