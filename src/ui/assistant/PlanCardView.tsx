"use client";

import { ProgressBar } from "../components/Display";
import { IconAlert, IconCheck } from "../components/Icons";
import { ph, rich } from "../components/Rich";
import { useT } from "../i18n/LocaleProvider";
import { formatAmd } from "../lib/format";
import { DEPOSIT_INTEREST_TAX, type Realism } from "./goal-plan";
import type { PlanCard } from "./types";
import s from "./assistant.module.css";

type T = ReturnType<typeof useT>;

/** 7.2, 8, 12.5: no trailing zeros */
const pct = (n: number) => String(Math.round(n * 100) / 100);

/** "7 months", "1 year", "2 years 3 months": the same words as durationLabel() in goal-plan.ts, but from the dictionary */
function durationText(t: T, months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  const ys = t("assistant.plan.year", { n: y });
  const ms = t("assistant.plan.month", { n: m });
  return y === 0 ? ms : m === 0 ? ys : t("assistant.plan.yearsMonths", { years: ys, months: ms });
}

function shareText(t: T, share: number): string {
  const p = Math.round(share * 100);
  return p < 1 ? t("assistant.plan.shareLess") : t("assistant.plan.shareAbout", { p });
}

function monthsText(t: T, months: number | null): string {
  if (months === null) return t("assistant.plan.notReachable");
  if (months === 0) return t("assistant.plan.alreadyReached");
  if (months < 12) return t("assistant.plan.month", { n: months });
  return t("assistant.plan.monthsWithDuration", { months: t("assistant.plan.month", { n: months }), duration: durationText(t, months) });
}

export function PlanCardView({ plan }: { plan: PlanCard }) {
  const t = useT();
  const { goalName, result: r } = plan;
  const tone: Realism = r.realism ?? "comfortable";
  const realism = t(`assistant.plan.realism.${tone}`);
  return (
    <div className={s.plan}>
      <p className={s.planEyebrow}>{goalName ? t("assistant.plan.eyebrowNamed", { goal: goalName }) : t("assistant.plan.eyebrow")}</p>

      {r.alreadyReached ? (
        <div className={s.reached}>
          <span className={s.reachedIcon}>
            <IconCheck size={18} />
          </span>
          <div>
            <p className={s.reachedTitle}>{t("assistant.plan.reachedTitle")}</p>
            <p className={s.planLine}>
              {rich(t("assistant.plan.reachedLine", ph("saved", "goal")), {
                saved: <span className="num">{formatAmd(r.saved)}</span>,
                goal: <span className="num">{formatAmd(r.goal)}</span>,
              })}
            </p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <p className={s.planFigure}>
              <span className={s.planAmount}>{formatAmd(r.monthly, { suffix: false })}</span>
              <span className={s.planUnit}> {t("assistant.plan.unit")}</span>
            </p>
            <p className={s.planLine}>
              {rich(t("assistant.plan.toReach", ph("goal", "duration")), {
                goal: <span className="num">{formatAmd(r.goal)}</span>,
                duration: durationText(t, r.months),
              })}
              {r.months >= 12 ? <span className="num"> ({t("assistant.plan.month", { n: r.months })})</span> : null}
            </p>
            {r.saved > 0 ? (
              <p className={s.planLine}>{rich(t("assistant.plan.alreadySaved", ph("saved")), { saved: <span className="num">{formatAmd(r.saved)}</span> })}</p>
            ) : null}
          </div>

          {r.share !== null ? (
            <div className={s.meter} data-tone={tone}>
              <ProgressBar value={r.share * 100} label={t("assistant.plan.shareLabel")} valueText={t("assistant.plan.valueText", { share: shareText(t, r.share), realism })} />
              <p className={s.meterLabel}>
                {tone === "comfortable" ? <IconCheck size={16} /> : <IconAlert size={16} />}
                <span>{rich(t("assistant.plan.meterLine", { ...ph("share"), realism }), { share: <span className="num">{shareText(t, r.share)}</span> })}</span>
              </p>
            </div>
          ) : null}

          {r.rate ? (
            <div className={s.planSection}>
              <p className={s.planLine}>
                {rich(t("assistant.plan.assumes", { ...ph("gross", "net"), tax: `${pct(DEPOSIT_INTEREST_TAX * 100)}%` }), {
                  gross: <span className="num">{pct(r.rate.grossPct)}%</span>,
                  net: <span className="num">{pct(r.rate.netPct)}%</span>,
                })}
              </p>
              {r.monthlyWithoutInterest !== null ? (
                <p className={s.planLine}>
                  {rich(t("assistant.plan.withoutInterest", ph("amount")), { amount: <span className="num">{formatAmd(r.monthlyWithoutInterest)}</span> })}
                  {r.interestPart > 0 ? (
                    <>
                      {" "}
                      {rich(t("assistant.plan.interestPart", ph("amount")), { amount: <span className="num">{formatAmd(r.interestPart)}</span> })}
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {r.whatIfs ? (
            <div className={s.planSection}>
              <table className={s.whatIf}>
                <caption>{t("assistant.plan.whatIfCaption")}</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">{t("assistant.plan.whatIfShare")}</th>
                    <th scope="col">{t("assistant.plan.whatIfTime")}</th>
                  </tr>
                </thead>
                <tbody>
                  {r.whatIfs.map((w) => (
                    <tr key={w.pct}>
                      <th scope="row">
                        <span className="num">{w.pct}%</span>{" "}
                        <span className={s.whatIfSub}>{rich(t("assistant.plan.whatIfMonthly", ph("amount")), { amount: <span className="num">{formatAmd(w.monthly)}</span> })}</span>
                      </th>
                      <td className="num">{monthsText(t, w.months)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      <p className={s.planFoot}>{t("assistant.plan.foot")}</p>
    </div>
  );
}
