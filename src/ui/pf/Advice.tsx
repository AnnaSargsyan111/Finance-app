"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { getPeriod } from "../api/pf";
import type { PeriodView } from "../api/types";
import { Card, Chip, Segmented, Tabs } from "../components/Display";
import { IconAlert, IconCheck, IconInfo } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { formatAmd, formatPercent } from "../lib/format";
import { analyse, barShares, goalLine, moneyFromForm, moneyOf, trimResult, type Analysis } from "./advice-rules";
import { shiftMonth, type FormState, type Selection } from "./calc";
import s from "./advice.module.css";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
const LEVEL_TEXT = { high: "Important", medium: "Worth a look", low: "Heads-up" } as const;
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
  const sh = barShares(a, income);
  const base = Math.max(income, a.spent, 1);
  const pct = (n: number) => formatPercent((n / base) * 100, 0);
  return (
    <div>
      <div className={s.barLabel}>Your period</div>
      <div className={s.bar} role="img" aria-label={`Needs ${pct(a.needs)}, wants ${pct(a.wants)}, other ${pct(a.rest)}, left over ${pct(Math.max(0, a.available))} of income`}>
        <span className={s.segNeeds} style={{ width: `${sh.needs}%` }} />
        <span className={s.segWants} style={{ width: `${sh.wants}%` }} />
        <span className={s.segRest} style={{ width: `${sh.rest}%` }} />
        <span className={s.segLeft} style={{ width: `${sh.left}%` }} />
      </div>
      <div className={cx(s.barLabel, s.guideGap)}>A common guide (50 / 30 / 20)</div>
      <div className={cx(s.bar, s.barGuide)} aria-hidden="true">
        <span className={s.segNeeds} style={{ width: "50%" }} />
        <span className={s.segWants} style={{ width: "30%" }} />
        <span className={s.segLeft} style={{ width: "20%" }} />
      </div>
      <ul className={s.legend}>
        <li><i className={s.segNeeds} />Needs {pct(a.needs)}</li>
        <li><i className={s.segWants} />Wants {pct(a.wants)}</li>
        <li><i className={s.segRest} />Other {pct(a.rest)}</li>
        <li><i className={s.segLeft} />Left over {pct(Math.max(0, a.available))}</li>
      </ul>
    </div>
  );
}

function Insights({ a, income, monthly }: { a: Analysis; income: number; monthly: boolean }) {
  const v = a.versus;
  return (
    <div className={s.grid}>
      <div className={s.tile}>
        <span className={s.tileLabel}>Money left over</span>
        <div className={s.ringWrap}>
          <Ring value={a.rate} />
          <span className={s.ringNum}>{formatPercent(a.rate * 100, 0)}</span>
        </div>
        <p className={s.tileText}>{a.available >= 0 ? `${formatAmd(a.available)} of ${formatAmd(income)} income` : `${formatAmd(-a.available)} short this period`}</p>
      </div>
      <div className={cx(s.tile, s.wide)}>
        <span className={s.tileLabel}>Needs, wants and what is left</span>
        <SplitBar a={a} income={income} />
      </div>
      <div className={s.tile}>
        <span className={s.tileLabel}>Biggest expense</span>
        {a.biggest ? (
          <>
            <p className={s.big}>{a.biggest.label}</p>
            <p className={s.tileText}>
              {formatAmd(a.biggest.amount)} · {formatPercent((a.biggest.amount / a.spent) * 100, 0)} of expenses
            </p>
          </>
        ) : (
          <p className={s.tileText}>Nothing entered yet.</p>
        )}
      </div>
      <div className={cx(s.tile, s.wide)}>
        <span className={s.tileLabel}>Compared with last month</span>
        {v ? (
          <>
            <p className={s.big}>
              {v.change >= 0 ? "+" : "−"}
              {formatPercent(Math.abs(v.change) * 100, 0)}
            </p>
            <p className={s.tileText}>
              Expenses {v.change >= 0 ? "went up" : "went down"}.
              {v.mover && v.mover.diff !== 0 ? ` Biggest change: ${v.mover.label} ${v.mover.diff > 0 ? "+" : "−"}${formatAmd(Math.abs(v.mover.diff))}.` : ""}
            </p>
          </>
        ) : (
          <p className={s.tileText}>{monthly ? "Save the previous month as well and you will see here how this one compares." : "Comparisons are available for calendar months."}</p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ 2. Alerts: what needs attention */
function Alerts({ a }: { a: Analysis }) {
  const [open, setOpen] = useState<string | null>(null);
  const uid = useId();
  if (a.alerts.length === 0)
    return (
      <p className={s.allClear}>
        <IconCheck size={18} /> Nothing needs your attention this period. Your numbers sit inside the usual guide lines.
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
                <Chip tone={LEVEL_TONE[x.level]}>{LEVEL_TEXT[x.level]}</Chip>
              </div>
              <p className={s.alertText}>{x.text}</p>
              <button type="button" className={s.why} aria-expanded={open === x.id} aria-controls={`${uid}-${x.id}`} onClick={() => setOpen(open === x.id ? null : x.id)}>
                <IconInfo size={14} /> Why am I seeing this?
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
          <p className={s.cardEyebrow}>From your alerts</p>
          <h4 className={s.cardTitle}>One thing to try for each</h4>
          <ul className={s.actionList}>
            {a.alerts.map((x) => (
              <li key={x.id} className={s.action}>
                <span className={s.actionLabel}>For: {x.title}</span>
                {x.action}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {pick && r ? (
        <div className={s.suggestCard}>
          <p className={s.cardEyebrow}>What if…</p>
          <h4 className={s.cardTitle}>Try a small change</h4>
          <div className={s.row}>
            <label className={s.fieldLabel} htmlFor={`${uid}-cat`}>
              Trim
            </label>
            <select id={`${uid}-cat`} className={s.select} value={pick.key} onChange={(e) => setKey(e.target.value)}>
              {a.flexible.map((x) => (
                <option key={x.key} value={x.key}>
                  {x.label} ({formatAmd(x.amount)})
                </option>
              ))}
            </select>
          </div>
          <div className={s.row}>
            <label className={s.fieldLabel} htmlFor={`${uid}-cut`}>
              by {cut}%
            </label>
            <input id={`${uid}-cut`} type="range" min={0} max={50} step={5} value={cut} onChange={(e) => setCut(Number(e.target.value))} className={s.range} />
          </div>
          <div className={s.result}>
            <div>
              <span className={s.resultLabel}>Per period</span>
              <strong>+{formatAmd(r.saved)}</strong>
            </div>
            <div>
              <span className={s.resultLabel}>Over 12 periods</span>
              <strong>+{formatAmd(r.year)}</strong>
            </div>
            <div>
              <span className={s.resultLabel}>Left over becomes</span>
              <strong>{formatPercent(r.newRate * 100, 0)}</strong>
            </div>
          </div>
          <p className={s.fine}>Savings only. Nothing here assumes any investment return.</p>
        </div>
      ) : null}

      <div className={s.suggestCard}>
        <p className={s.cardEyebrow}>A savings target</p>
        <h4 className={s.cardTitle}>Pay yourself first</h4>
        <Segmented label="Savings target" value={String(goalPct)} onChange={(v) => setGoalPct(Number(v))} options={[{ value: "10", label: "10%" }, { value: "15", label: "15%" }, { value: "20", label: "20%" }]} />
        <p className={s.goalText}>
          Setting aside <strong>{goalPct}%</strong> of income means <strong>{formatAmd(goal.amount)}</strong> at the start of each period.
        </p>
        {goal.reached ? (
          <p className={s.goalText}>
            <IconCheck size={16} /> You already keep more than that this period. Moving it aside first, before spending, makes it a habit.
          </p>
        ) : (
          <p className={s.goalText}>
            You are <strong>{formatAmd(goal.gap)}</strong> away from that this period.
            {a.flexible.length > 0 ? ` The most flexible places to find it: ${a.flexible.slice(0, 2).map((x) => `${x.label} (${formatAmd(x.amount)})`).join(" and ")}.` : ""}
          </p>
        )}
      </div>

      <div className={s.suggestCard}>
        <p className={s.cardEyebrow}>Essentials</p>
        <h4 className={s.cardTitle}>Know your cushion</h4>
        <p className={s.goalText} style={{ marginTop: 0 }}>
          Your needs (housing, bills, transport, food) cost about <strong>{formatAmd(a.needs)}</strong> a period. A cushion of one period of needs would be <strong>{formatAmd(a.needs)}</strong>, and a few periods more protects you better. There is no single official number: pick one that feels safe for you.
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
  const none = !a.hasIncome && a.spent === 0;
  return (
    <>
      <p className={s.motivation}>
        {none
          ? "Start with your income, then add your expenses above. Even rough numbers work, and this card explains your month as you type."
          : a.hasIncome
            ? "Good start. Now add your expenses above, even roughly, and you will see where your money goes."
            : "Good start. Add your income above and you will see how much of it you keep."}
        {a.biggest && !a.hasIncome ? ` So far your biggest expense is ${a.biggest.label} (${formatAmd(a.biggest.amount)}).` : ""}
      </p>
      <div className={s.grid}>
        <div className={cx(s.tile, s.tileMuted)}>
          <span className={s.tileLabel}>Insights</span>
          <p className={s.tileText}>Where your money goes and how much you keep.</p>
        </div>
        <div className={cx(s.tile, s.tileMuted)}>
          <span className={s.tileLabel}>Alerts</span>
          <p className={s.tileText}>Things worth a look, each with the rule behind it.</p>
        </div>
        <div className={cx(s.tile, s.tileMuted)}>
          <span className={s.tileLabel}>Suggestions</span>
          <p className={s.tileText}>One idea to try for each alert, and a savings target.</p>
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
  const prevMonth = selection.kind === "month" ? shiftMonth(selection.month, -1) : null;
  const prevRes = useResource<PeriodView>((signal) => getPeriod({ kind: "month", month: prevMonth! }, signal), [prevMonth], { enabled: prevMonth !== null });
  const prev = prevMonth !== null && prevRes.data?.exists ? moneyOf(prevRes.data) : null;
  const [tab, setTab] = useState<Tab>("insights");

  const settled = useDebounced(form, 450);
  const now = useMemo(() => moneyFromForm(settled), [settled]);
  const a = useMemo(() => analyse(now, prev), [now, prev]);

  const showAll = a.hasIncome && a.spent > 0;
  const tabs: { value: Tab; label: ReactNode }[] = [
    { value: "insights", label: "Insights" },
    { value: "alerts", label: <>Alerts <span className={cx(s.count, a.alerts.length > 0 && s.countHot)}>{a.alerts.length}</span></> },
    { value: "suggestions", label: "Suggestions" },
  ];

  return (
    <Card title="Your money, explained" eyebrow="Understand · Notice · Act" aria-label="Your money, explained">
      {showAll ? (
        <>
          <p className={s.story} aria-live="polite">
            You earned <strong>{formatAmd(now.income)}</strong>, spent <strong>{formatAmd(a.spent)}</strong> and{" "}
            {a.available >= 0 ? <>kept <strong className={s.pos}>{formatAmd(a.available)}</strong></> : <>ended <strong className={s.neg}>{formatAmd(-a.available)} short</strong></>}.
          </p>
          <Tabs label="Insights, alerts and suggestions" value={tab} tabs={tabs} onChange={setTab} idPrefix="adv" />
          <div className={s.panel} role="tabpanel" id={`adv-panel-${tab}`} aria-labelledby={`adv-tab-${tab}`}>
            {tab === "insights" ? <Insights a={a} income={now.income!} monthly={selection.kind === "month"} /> : tab === "alerts" ? <Alerts a={a} /> : <Suggestions a={a} income={now.income!} />}
          </div>
        </>
      ) : (
        <Starter a={a} />
      )}
      {dirty && showAll ? <p className={s.stale}>Preview from what you typed. Save to keep it.</p> : null}
      <p className={s.fine} style={{ marginTop: "var(--s-5)" }}>
        Guides, not advice: every message comes from the numbers you entered and a fixed rule you can read under “Why am I seeing this?”. Rules of thumb such as 50/30/20 are starting points, not requirements.
      </p>
    </Card>
  );
}
