"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { getNews, refreshNews } from "../api/market";
import { errorMessage, isApiError } from "../api/client";
import type { Enveloped, NewsItem } from "../api/types";
import { Button } from "../components/Button";
import { EmptyState, ErrorState, Note, Skeleton } from "../components/Feedback";
import { IconArrowRight, IconRefresh } from "../components/Icons";
import { useNow } from "../hooks/useDebounce";
import { useResource } from "../hooks/useResource";
import { useT } from "../i18n";
import { formatAgo, formatDateTime } from "../lib/format";
import { MetaLine } from "./MetaLine";
import { CategoryChip, NewsImage } from "./NewsParts";
import s from "./market.module.css";

function NewsCard({ item, now }: { item: NewsItem; now: Date }) {
  const t = useT();
  return (
    <article className={s.newsCard}>
      <NewsImage src={item.imageUrl} article={item} />
      <div className={s.newsBody}>
        <div className={s.newsTop}>
          <span className={s.source}>{item.source}</span>
          <CategoryChip category={item.category} />
        </div>
        <h3 className={s.newsTitle}>{item.title}</h3>
        {item.summary ? <p className={s.newsSummary}>{item.summary}</p> : <p className={s.newsSummary} style={{ color: "var(--muted)" }}>{t("market.news.noSummary")}</p>}
        <div className={s.newsFoot}>
          <time className={s.time} dateTime={item.publishedAt} title={formatDateTime(item.publishedAt)}>
            {formatDateTime(item.publishedAt)} · {formatAgo(item.publishedAt, now)}
          </time>
          <Link href={`/news/${item.id}`} className={s.readMore} aria-label={t("market.news.readMoreAria", { title: item.title })}>
            {t("market.news.readMore")} <IconArrowRight size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

function NewsSkeleton() {
  const t = useT();
  return (
    <div className={s.newsGrid} role="status" aria-busy="true">
      <span className="sr-only">{t("market.news.loading")}</span>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className={s.newsCard}>
          <Skeleton height={0} style={{ aspectRatio: "16 / 9", height: "auto" }} radius={0} />
          <div className={s.newsBody}>
            <Skeleton width="50%" height={14} />
            <Skeleton height={20} />
            <Skeleton width="85%" height={20} />
            <Skeleton height={14} />
            <Skeleton width="70%" height={14} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function NewsSection() {
  const t = useT();
  const res = useResource((signal) => getNews(signal), []);
  const now = useNow();
  const [refreshing, setRefreshing] = useState(false);
  const [wait, setWait] = useState(0);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [justRefreshed, setJustRefreshed] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => void (timer.current && clearInterval(timer.current)), []);

  function startCountdown(seconds: number) {
    setWait(seconds);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setWait((w) => {
        if (w <= 1) {
          if (timer.current) clearInterval(timer.current);
          return 0;
        }
        return w - 1;
      });
    }, 1000);
  }

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    setJustRefreshed(false);
    try {
      const r = await refreshNews();
      res.setData(() => r as Enveloped<{ items: NewsItem[] }>);
      setJustRefreshed(true);
      startCountdown(30);
    } catch (e) {
      if (isApiError(e) && e.code === "RATE_LIMITED") {
        startCountdown(e.retryAfterSeconds ?? 30);
        setRefreshError(t("market.news.rateLimited"));
      } else setRefreshError(errorMessage(e, t("market.news.refreshFailed")));
    } finally {
      setRefreshing(false);
    }
  }

  if (res.status === "error" && !res.data) return <ErrorState title={t("market.news.errorTitle")} message={errorMessage(res.error)} onRetry={res.reload} />;
  if (!res.data) return <NewsSkeleton />;

  const { items } = res.data.data;
  const meta = res.data.meta;
  const asOf = meta.asOf;

  return (
    <div className={s.panel}>
      <div className={s.newsToolbar}>
        <div>
          <MetaLine meta={{ ...meta, stale: false }} kind="updated" />
        </div>
        <Button variant="secondary" onClick={refresh} loading={refreshing} disabled={wait > 0}>
          {!refreshing ? <IconRefresh size={16} /> : null}
          {wait > 0 ? t("market.news.refreshIn", { n: wait }) : t("market.news.refresh")}
        </Button>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {justRefreshed ? t("market.news.refreshed") : ""}
      </p>
      {meta.stale ? <Note tone="warn">{asOf ? t("market.news.staleWithTime", { ago: formatAgo(asOf, now) }) : t("market.news.stale")}</Note> : null}
      {refreshError ? <Note tone="warn">{refreshError}</Note> : null}
      {items.length === 0 ? (
        <EmptyState
          title={t("market.news.emptyTitle")}
          message={t("market.news.emptyMessage")}
          action={
            <Button variant="secondary" size="sm" onClick={refresh} loading={refreshing}>
              {t("market.news.refresh")}
            </Button>
          }
        />
      ) : (
        <div className={s.newsGrid}>
          {items.map((i) => (
            <NewsCard key={i.id} item={i} now={now} />
          ))}
        </div>
      )}
      {items.length > 0 && items.length < 6 ? <Note>
          {t("market.news.onlyFew", { n: items.length })}
          {typeof meta.note === "string" ? ` ${meta.note}` : ""}
        </Note> : null}
      <p className={s.company} style={{ fontSize: 12.5, color: "var(--muted)" }}>
        {t("market.news.publishersNote")}
      </p>
    </div>
  );
}
