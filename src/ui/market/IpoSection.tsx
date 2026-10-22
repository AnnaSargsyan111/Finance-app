"use client";

import { useState } from "react";
import { getIpoCalendar } from "../api/market";
import { errorMessage } from "../api/client";
import type { IpoItem, IpoNewsItem, IpoStatus } from "../api/types";
import { Button } from "../components/Button";
import { Card, Chip, Segmented } from "../components/Display";
import { EmptyState, ErrorState, Note, Skeleton } from "../components/Feedback";
import { IconArrowLeft } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { useT } from "../i18n";
import { cx } from "../lib/cx";
import { formatDate, formatDateLong, formatMonth, formatNumber, formatUsd, todayYerevan } from "../lib/format";
import { byDate, monthGrid, monthOf, shiftMonth, startMonth } from "./ipo-calendar";
import { MetaLine } from "./MetaLine";
import s from "./market.module.css";

type Group = "upcoming" | "filed" | "priced" | "withdrawn";
type View = "list" | "calendar";
const GROUP_OF: Record<IpoStatus, Group> = { expected: "upcoming", other: "upcoming", filed: "filed", priced: "priced", withdrawn: "withdrawn" };
const TONE: Record<IpoStatus, "neutral" | "pos" | "neg" | "warn"> = { expected: "neutral", filed: "warn", other: "neutral", priced: "pos", withdrawn: "neg" };
const WEEKDAYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;

const todayIso = () => todayYerevan();
const daysFromToday = (iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 86_400_000);
/** the date the list sorts and shows: the pricing date, or the filing date for a company that has only filed */
const shownDate = (i: IpoItem) => i.date ?? i.filedDate ?? "";

type T = ReturnType<typeof useT>;
const priceText = (t: T, i: IpoItem) =>
  i.priceLow === null || i.priceHigh === null ? t("market.ipo.priceTbd") : i.priceLow === i.priceHigh ? formatUsd(i.priceLow, 2) : `${formatUsd(i.priceLow, 2)} – ${formatUsd(i.priceHigh, 2)}`;
const sizeText = (t: T, i: IpoItem) =>
  i.dealSizeUsd === null ? "-" : i.dealSizeUsd >= 1e9 ? `$${t("market.stocks.usdBillion", { v: (i.dealSizeUsd / 1e9).toFixed(2) })}` : `$${t("market.ipo.usdMillion", { v: (i.dealSizeUsd / 1e6).toFixed(1) })}`;

function Row({ item }: { item: IpoItem }) {
  const t = useT();
  const d = item.date ? daysFromToday(item.date) : null;
  const sub =
    item.status === "filed"
      ? t("market.ipo.filedOn")
      : item.status !== "expected" || d === null
        ? null
        : d === 0
          ? t("market.ipo.today")
          : d === 1
            ? t("market.ipo.tomorrow")
            : d > 1
              ? t("market.ipo.inDays", { n: d })
              : null;
  return (
    <tr>
      <td>
        <span className="num">{formatDate(shownDate(item))}</span>
        {sub ? <span className={s.ipoRel}>{sub}</span> : null}
      </td>
      <td>
        <span className={s.ipoName}>{item.name}</span>
        {item.symbol ? <span className={s.ipoSym}>{item.symbol}</span> : null}
      </td>
      <td>{item.exchange ?? "-"}</td>
      <td className="num">{priceText(t, item)}</td>
      <td className="num">{item.shares === null ? "-" : formatNumber(item.shares, 0)}</td>
      <td className="num">{sizeText(t, item)}</td>
      <td>
        <Chip tone={TONE[item.status]} title={t(`market.ipo.statusHelp.${item.status}`)}>
          {t(`market.ipo.status.${item.status}`)}
        </Chip>
      </td>
    </tr>
  );
}

function IpoTable({ rows }: { rows: IpoItem[] }) {
  const t = useT();
  return (
    <div className={s.ipoWrap}>
      <table className={s.ipoTable} aria-label={t("market.ipo.tableLabel")}>
        <thead>
          <tr>
            <th scope="col">{t("market.ipo.colDate")}</th>
            <th scope="col">{t("market.ipo.colCompany")}</th>
            <th scope="col">{t("market.ipo.colExchange")}</th>
            <th scope="col">{t("market.ipo.colPrice")}</th>
            <th scope="col">{t("market.ipo.colShares")}</th>
            <th scope="col">{t("market.ipo.colSize")}</th>
            <th scope="col">{t("market.ipo.colStatus")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <Row key={`${i.symbol ?? i.name}-${shownDate(i)}`} item={i} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** one IPO of the opened day: who it is, the three numbers that matter, its status and the link to its filings */
function IpoCard({ item }: { item: IpoItem }) {
  const t = useT();
  return (
    <li className={s.ipoCard}>
      <div>
        <p className={s.ipoCardSym}>{item.symbol ?? item.name}</p>
        {item.symbol ? <p className={s.ipoCardName}>{item.name}</p> : null}
        {item.exchange ? <p className={s.ipoCardEx}>{item.exchange}</p> : null}
      </div>
      <dl className={s.ipoStats}>
        <div className={s.ipoStat}>
          <dt>{t("market.ipo.colPrice")}</dt>
          <dd>{priceText(t, item)}</dd>
        </div>
        <div className={s.ipoStat}>
          <dt>{t("market.ipo.colShares")}</dt>
          <dd>{item.shares === null ? "-" : formatNumber(item.shares, 0)}</dd>
        </div>
        <div className={s.ipoStat}>
          <dt>{t("market.ipo.colSize")}</dt>
          <dd>{sizeText(t, item)}</dd>
        </div>
      </dl>
      <div className={s.ipoCardSide}>
        <Chip tone={TONE[item.status]} title={t(`market.ipo.statusHelp.${item.status}`)}>
          {t(`market.ipo.status.${item.status}`)}
        </Chip>
        <a className={s.bankLink} href={item.filingsUrl} target="_blank" rel="noopener noreferrer" title={t("market.ipo.filingsTitle", { name: item.name })}>
          {t("market.ipo.filings")} <span aria-hidden="true">↗</span>
        </a>
      </div>
    </li>
  );
}

/** a month grid: every day that has IPOs is tinted green and lists them; opening a day shows one card per IPO underneath */
function MonthCalendar({ items }: { items: IpoItem[] }) {
  const t = useT();
  const [month, setMonth] = useState(() => startMonth(items, todayIso()));
  const [selected, setSelected] = useState<string | null>(null);
  const days = byDate(items);
  const today = todayIso();
  const chosen = selected && monthOf(selected) === month ? (days.get(selected) ?? []) : null;
  const full = formatMonth(month);
  const monthHasIpos = [...days.keys()].some((d) => monthOf(d) === month);

  return (
    <div className={s.cal}>
      <div className={s.calHead}>
        <Button variant="ghost" size="sm" icon onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label={t("market.ipo.prevMonth")}>
          <IconArrowLeft size={16} />
        </Button>
        <h3 className={s.calTitle} aria-live="polite">
          {full}
        </h3>
        <Button variant="ghost" size="sm" icon onClick={() => setMonth((m) => shiftMonth(m, 1))} aria-label={t("market.ipo.nextMonth")}>
          <IconArrowLeft size={16} style={{ transform: "rotate(180deg)" }} />
        </Button>
      </div>
      <div className={s.calGrid} role="grid" aria-label={full}>
        <div className={cx(s.calWeek, s.calWeekHead)} role="row">
          {WEEKDAYS.map((w) => (
            <div key={w} className={s.calWd} role="columnheader">
              {t(`market.ipo.weekdays.${w}`)}
            </div>
          ))}
        </div>
        {monthGrid(month).map((week, wi) => (
          <div key={wi} className={s.calWeek} role="row">
            {week.map((iso, di) => {
              if (!iso) return <div key={di} className={s.calBlank} role="gridcell" />;
              const evts = days.get(iso) ?? [];
              return (
                <div key={iso} role="gridcell" className={s.calCell}>
                  <button
                    type="button"
                    className={cx(s.calDay, iso === today && s.calToday, iso === selected && s.calSel, evts.length > 0 && s.calHas)}
                    aria-pressed={iso === selected}
                    aria-label={evts.length ? t("market.ipo.dayCount", { date: formatDateLong(iso), n: evts.length }) : formatDateLong(iso)}
                    onClick={() => setSelected(iso === selected ? null : iso)}
                  >
                    <span className={s.calNum}>{Number(iso.slice(8))}</span>
                    {evts.slice(0, 2).map((e) => (
                      <span key={`${e.symbol ?? e.name}`} className={s.calEvt} data-tone={TONE[e.status]}>
                        <span className={s.calEvtText}>{e.symbol ?? e.name}</span>
                      </span>
                    ))}
                    {evts.length > 2 ? <span className={s.calMore}>{t("market.ipo.more", { n: evts.length - 2 })}</span> : null}
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      {!monthHasIpos ? (
        <Note>{t("market.ipo.monthEmpty")}</Note>
      ) : chosen === null ? (
        <p className={s.ipoIntro}>{t("market.ipo.selectDay")}</p>
      ) : chosen.length === 0 ? (
        <p className={s.ipoIntro}>{t("market.ipo.dayEmpty")}</p>
      ) : (
        <>
          <h4 className={s.calDetailHead}>
            {formatDateLong(selected!)}
            <span className={s.calDetailCount}>{t("market.ipo.count", { n: chosen.length })}</span>
          </h4>
          <ul className={s.ipoCards} style={{ margin: 0, padding: 0, listStyle: "none" }}>
            {chosen.map((i) => (
              <IpoCard key={`${i.symbol ?? i.name}-${i.date}`} item={i} />
            ))}
          </ul>
        </>
      )}
      <section aria-label={t("market.ipo.legendTitle")} className={s.calLegendBox}>
        <h4 className={s.calLegendTitle}>{t("market.ipo.legendTitle")}</h4>
        <dl className={s.calLegend}>
          {(["expected", "filed", "priced", "withdrawn"] as const).map((st) => (
            <div key={st} className={s.calLegendItem}>
              <dt>
                <span className={s.calEvt} data-tone={TONE[st]}>
                  <span className={s.calEvtText}>{t(`market.ipo.status.${st}`)}</span>
                </span>
              </dt>
              <dd>{t(`market.ipo.statusHelp.${st}`)}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

/** recent headlines about companies' IPO plans, including the ones that have no date yet */
function IpoNews({ items }: { items: IpoNewsItem[] }) {
  const t = useT();
  return (
    <section className={s.ipoNews} aria-label={t("market.ipo.newsTitle")}>
      <h3 className={s.ipoNewsTitle}>{t("market.ipo.newsTitle")}</h3>
      <p className={s.ipoIntro}>{t("market.ipo.newsSub")}</p>
      {items.length === 0 ? (
        <p className={s.ipoIntro}>{t("market.ipo.newsEmpty")}</p>
      ) : (
        <ul className={s.ipoNewsList}>
          {items.map((n) => (
            <li key={n.url}>
              <a href={n.url} target="_blank" rel="noopener noreferrer" className={s.ipoNewsLink}>
                {n.title}
                <span className="sr-only"> {t("market.ipo.opensNewTab")}</span>
              </a>
              <span className={s.ipoNewsMeta}>
                {n.outlet ? `${n.outlet} · ` : ""}
                {formatDate(n.publishedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
      <p className={s.ipoNewsNote}>{t("market.ipo.newsNote")}</p>
    </section>
  );
}

/** Companies that plan to go public (and those that recently did): a month calendar or a list, plus headlines about the big names. */
export function IpoSection() {
  const t = useT();
  const res = useResource((signal) => getIpoCalendar(signal), []);
  const [view, setView] = useState<View>("calendar");
  const [group, setGroup] = useState<Group>("upcoming");

  const all = res.data?.data.items ?? [];
  const rows = all
    .filter((i) => GROUP_OF[i.status] === group)
    .sort((a, b) => (group === "upcoming" ? (shownDate(a) < shownDate(b) ? -1 : shownDate(a) > shownDate(b) ? 1 : 0) : shownDate(a) < shownDate(b) ? 1 : shownDate(a) > shownDate(b) ? -1 : 0));

  return (
    <Card
      title={t("market.ipo.title")}
      actions={
        <>
          <Segmented
            label={t("market.ipo.viewLabel")}
            value={view}
            onChange={setView}
            options={[
              { value: "calendar", label: t("market.ipo.viewCalendar") },
              { value: "list", label: t("market.ipo.viewList") },
            ]}
          />
          {view === "list" ? (
            <Segmented
              label={t("market.ipo.groupLabel")}
              value={group}
              onChange={setGroup}
              options={[
                { value: "upcoming", label: t("market.ipo.upcoming") },
                { value: "filed", label: t("market.ipo.filedGroup") },
                { value: "priced", label: t("market.ipo.priced") },
                { value: "withdrawn", label: t("market.ipo.withdrawn") },
              ]}
            />
          ) : null}
        </>
      }
    >
      <div className={s.panel}>
        <p className={s.ipoIntro}>{t("market.ipo.intro")}</p>
        {res.status === "error" && !res.data ? (
          <ErrorState title={t("market.ipo.errorTitle")} message={errorMessage(res.error)} onRetry={res.reload} compact />
        ) : !res.data ? (
          <div role="status" aria-busy="true">
            <span className="sr-only">{t("market.ipo.loading")}</span>
            <Skeleton height={240} />
          </div>
        ) : view === "calendar" ? (
          <MonthCalendar items={all} />
        ) : rows.length === 0 ? (
          <EmptyState title={t("market.ipo.emptyTitle")} message={group === "upcoming" ? t("market.ipo.emptyUpcoming") : t("market.ipo.emptyMessage")} compact />
        ) : (
          <>
            <p className={s.metaLine}>{t("market.ipo.count", { n: rows.length })}</p>
            <IpoTable rows={rows} />
          </>
        )}
        {res.data ? <IpoNews items={res.data.data.news ?? []} /> : null}
        {res.data ? <MetaLine meta={res.data.meta} /> : null}
        <Note>{t("market.ipo.note")}</Note>
      </div>
    </Card>
  );
}
