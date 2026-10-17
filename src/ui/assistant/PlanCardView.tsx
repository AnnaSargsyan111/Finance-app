import { ProgressBar } from "../components/Display";
import { IconAlert, IconCheck } from "../components/Icons";
import { formatAmd } from "../lib/format";
import { DEPOSIT_INTEREST_TAX, durationLabel, type Realism } from "./goal-plan";
import type { PlanCard } from "./types";
import s from "./assistant.module.css";

/** 7.2, 8, 12.5: no trailing zeros */
const pct = (n: number) => String(Math.round(n * 100) / 100);

const REALISM_WORDS: Record<Realism, string> = {
  comfortable: "comfortable",
  stretch: "a stretch",
  unrealistic: "probably not realistic",
};

function shareText(share: number): string {
  const p = Math.round(share * 100);
  return p < 1 ? "Less than 1% of your income" : `About ${p}% of your income`;
}

function monthsText(months: number | null): string {
  if (months === null) return "Not reachable";
  if (months === 0) return "Already reached";
  if (months < 12) return months === 1 ? "1 month" : `${months} months`;
  return `${months} months (${durationLabel(months)})`;
}

export function PlanCardView({ plan }: { plan: PlanCard }) {
  const { goalName, result: r } = plan;
  const tone = r.realism ?? "comfortable";
  return (
    <div className={s.plan}>
      <p className={s.planEyebrow}>{goalName ? `Savings plan: ${goalName}` : "Savings plan"}</p>

      {r.alreadyReached ? (
        <div className={s.reached}>
          <span className={s.reachedIcon}>
            <IconCheck size={18} />
          </span>
          <div>
            <p className={s.reachedTitle}>You already have the full amount</p>
            <p className={s.planLine}>
              Your savings of <span className="num">{formatAmd(r.saved)}</span> already cover the goal of <span className="num">{formatAmd(r.goal)}</span>.
            </p>
          </div>
        </div>
      ) : (
        <>
          <div>
            <p className={s.planFigure}>
              <span className={s.planAmount}>{formatAmd(r.monthly, { suffix: false })}</span>
              <span className={s.planUnit}> AMD / month</span>
            </p>
            <p className={s.planLine}>
              to reach <span className="num">{formatAmd(r.goal)}</span> in {durationLabel(r.months)}
              {r.months >= 12 ? <span className="num"> ({r.months} months)</span> : null}
            </p>
            {r.saved > 0 ? (
              <p className={s.planLine}>
                Already saved: <span className="num">{formatAmd(r.saved)}</span>
              </p>
            ) : null}
          </div>

          {r.share !== null ? (
            <div className={s.meter} data-tone={tone}>
              <ProgressBar value={r.share * 100} label="Share of your monthly income" valueText={`${shareText(r.share)}, ${REALISM_WORDS[tone]}`} />
              <p className={s.meterLabel}>
                {tone === "comfortable" ? <IconCheck size={16} /> : <IconAlert size={16} />}
                <span>
                  <span className="num">{shareText(r.share)}</span>: {REALISM_WORDS[tone]}
                </span>
              </p>
            </div>
          ) : null}

          {r.rate ? (
            <div className={s.planSection}>
              <p className={s.planLine}>
                Assumes <span className="num">{pct(r.rate.grossPct)}%</span> a year before tax (about <span className="num">{pct(r.rate.netPct)}%</span> after the {pct(DEPOSIT_INTEREST_TAX * 100)}% tax on deposit interest). Your assumption, not a promise.
              </p>
              {r.monthlyWithoutInterest !== null ? (
                <p className={s.planLine}>
                  Without interest you would need <span className="num">{formatAmd(r.monthlyWithoutInterest)}</span> a month.
                  {r.interestPart > 0 ? (
                    <>
                      {" "}
                      About <span className="num">{formatAmd(r.interestPart)}</span> of the goal would come from interest, after tax.
                    </>
                  ) : null}
                </p>
              ) : null}
            </div>
          ) : null}

          {r.whatIfs ? (
            <div className={s.planSection}>
              <table className={s.whatIf}>
                <caption>If you set aside a share of your income</caption>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Share of income</th>
                    <th scope="col">Time to reach the goal</th>
                  </tr>
                </thead>
                <tbody>
                  {r.whatIfs.map((w) => (
                    <tr key={w.pct}>
                      <th scope="row">
                        <span className="num">{w.pct}%</span> <span className={s.whatIfSub}>(<span className="num">{formatAmd(w.monthly)}</span> a month)</span>
                      </th>
                      <td className="num">{monthsText(w.months)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </>
      )}

      <p className={s.planFoot}>Assumes no interest unless stated, steady income, no inflation. An estimate, not advice.</p>
    </div>
  );
}
