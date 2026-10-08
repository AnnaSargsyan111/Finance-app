"use client";

import { useId, useMemo, useState } from "react";
import { getPeriod } from "../api/pf";
import type { PeriodView } from "../api/types";
import { Card, Chip } from "../components/Display";
import { IconAlert, IconCheck, IconChevronDown, IconInfo } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { formatAmd, formatPercent } from "../lib/format";
import { analyse, barShares, goalLine, headline, moneyOf, trimResult, type Analysis } from "./advice-rules";
import { shiftMonth, type Selection } from "./calc";
import s from "./advice.module.css";

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(" ");
const LEVEL_TEXT = { high: "Important", medium: "Worth a look", low: "Heads-up" } as const;
const LEVEL_TONE = { high: "neg", medium: "warn", low: "neutral" } as const;

function Snapshot({ a, income }: { a: Analysis; income: number }) {
  const sh = barShares(a, income);
  const base = Math.max(income, a.spent, 1);
  const pct = (n: number) => formatPercent((n / base) * 100, 0);
  const goal = goalLine(a, income);
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
      <p className={s.line}>
        {goal.reached ? (
          <>You keep more than the common 20% target (<strong>{formatAmd(goal.amount)}</strong>). Moving it aside first, before spending, makes it a habit.</>
        ) : (
          <>
            A common target is to keep 20% (<strong>{formatAmd(goal.amount)}</strong>). You are <strong>{formatAmd(goal.gap)}</strong> away from it this period.
          </>
        )}
      </p>
      {a.versus ? (
        <p className={s.line}>
          Compared with last month, expenses went <strong>{a.versus.change >= 0 ? "up" : "down"} {formatPercent(Math.abs(a.versus.change) * 100, 0)}</strong>
          {a.versus.mover && a.versus.mover.diff !== 0 ? <>. Biggest change: {a.versus.mover.label} {a.versus.mover.diff > 0 ? "+" : "−"}{formatAmd(Math.abs(a.versus.mover.diff))}</> : null}.
        </p>
      ) : null}
    </div>
  );
}

function AlertList({ a }: { a: Analysis }) {
  const [open, setOpen] = useState<string | null>(null);
  const uid = useId();
  if (a.alerts.length === 0)
    return (
      <p className={s.allClear}>
        <IconCheck size={18} /> Nothing needs your attention this period.
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
              <p className={s.action}>
                <span className={s.actionLabel}>Try this</span>
                {x.action}
              </p>
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

function TrimTool({ a, income }: { a: Analysis; income: number }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [cut, setCut] = useState(10);
  const uid = useId();
  if (a.flexible.length === 0) return null;
  const pick = a.flexible.find((x) => x.key === key) ?? a.flexible[0];
  const r = trimResult(a, income, pick.amount, cut);
  return (
    <div>
      <button type="button" className={s.tryBtn} aria-expanded={open} aria-controls={`${uid}-try`} onClick={() => setOpen(!open)}>
        Try a small change
        <IconChevronDown size={16} className={cx(s.chev, open && s.chevOpen)} />
      </button>
      {open ? (
        <div className={s.try} id={`${uid}-try`}>
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
    </div>
  );
}

/**
 * "Your money, explained": one compact card under the overview. It reads the SAVED numbers of the selected period (like the
 * server totals) and, for calendar months, the previous month for a comparison. It never touches Investment.
 */
export function Advice({ view, selection, dirty }: { view: PeriodView; selection: Selection; dirty: boolean }) {
  const prevMonth = selection.kind === "month" ? shiftMonth(selection.month, -1) : null;
  const prevRes = useResource<PeriodView>((signal) => getPeriod({ kind: "month", month: prevMonth! }, signal), [prevMonth], { enabled: prevMonth !== null });
  const prev = prevMonth !== null && prevRes.data?.exists ? moneyOf(prevRes.data) : null;

  const now = useMemo(() => moneyOf(view), [view]);
  const a = useMemo(() => analyse(now, prev), [now, prev]);

  if (!view.exists || view.isEmpty) return null;

  const h = headline(a);
  const showAll = a.hasIncome && a.spent > 0;
  return (
    <Card title="Your money, explained" eyebrow="What your numbers say" aria-label="Your money, explained">
      <p className={s.headline}>
        {h.tone === "pos" ? <strong className={s.pos}>{h.text}</strong> : h.tone === "neg" ? <strong className={s.neg}>{h.text}</strong> : h.text}
      </p>
      {showAll ? (
        <>
          <div className={s.cols}>
            <div>
              <h3 className={s.sub}>Needs your attention</h3>
              <AlertList a={a} />
            </div>
            <div>
              <h3 className={s.sub}>The big picture</h3>
              <Snapshot a={a} income={now.income!} />
            </div>
          </div>
          <TrimTool a={a} income={now.income!} />
        </>
      ) : null}
      {dirty ? <p className={s.stale}>Based on your last saved numbers. Save to update.</p> : null}
      <p className={s.fine}>
        Guides, not advice: every message comes from the numbers you entered and a fixed rule you can read under “Why am I seeing this?”. Rules of thumb such as 50/30/20 are starting points, not requirements.
      </p>
    </Card>
  );
}
