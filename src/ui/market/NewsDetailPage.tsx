"use client";

import { useParams } from "next/navigation";
import { getNewsDetail } from "../api/market";
import { errorMessage, isApiError } from "../api/client";
import { ExternalButton, LinkButton } from "../components/Button";
import { EmptyState, ErrorState, Skeleton } from "../components/Feedback";
import { IconArrowLeft, IconExternal } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { useT } from "../i18n";
import { formatDateTime } from "../lib/format";
import { CategoryChip, NewsImage } from "./NewsParts";
import s from "./market.module.css";

function BackLink() {
  const t = useT();
  return (
    <div>
      <LinkButton href="/market?tab=news" variant="ghost" size="sm">
        <IconArrowLeft size={16} />
        {t("market.news.detail.back")}
      </LinkButton>
    </div>
  );
}

export function NewsDetailPage() {
  const t = useT();
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const res = useResource((signal) => getNewsDetail(id, signal), [id]);

  if (res.status === "error") {
    const notFound = isApiError(res.error) && res.error.status === 404;
    return (
      <div className={s.detail}>
        {notFound ? null : <BackLink />}
        {notFound ? (
          <EmptyState
            title={t("market.news.detail.notFoundTitle")}
            message={t("market.news.detail.notFoundMessage")}
            action={
              <LinkButton href="/market?tab=news" variant="secondary" size="sm">
                {t("market.news.detail.back")}
              </LinkButton>
            }
          />
        ) : (
          <ErrorState title={t("market.news.detail.errorTitle")} message={errorMessage(res.error)} onRetry={res.reload} />
        )}
      </div>
    );
  }
  if (!res.data) {
    return (
      <div className={s.detail} role="status" aria-busy="true">
        <span className="sr-only">{t("market.news.detail.loading")}</span>
        <Skeleton width={120} height={34} radius={99} />
        <Skeleton width={160} height={26} radius={99} />
        <Skeleton height={40} />
        <Skeleton width="70%" height={40} />
        <Skeleton height={0} style={{ aspectRatio: "16 / 9", height: "auto" }} />
        <Skeleton height={16} />
        <Skeleton height={16} width="90%" />
      </div>
    );
  }
  const a = res.data.data;
  return (
    <article className={s.detail}>
      <BackLink />
      <div className={s.detailMeta}>
        <CategoryChip category={a.category} />
        <span>
          {t("market.news.detail.sourceLabel")} <strong style={{ color: "var(--text)", fontWeight: 600 }}>{a.source}</strong>
        </span>
        <time dateTime={a.publishedAt}>{formatDateTime(a.publishedAt)}</time>
      </div>
      <h1 className={s.detailTitle}>{a.title}</h1>
      <NewsImage src={a.imageUrl} article={a} className={s.detailHero} labelArt />
      <div>
        {a.summary ? <p className={s.detailText}>{a.summary}</p> : <p className={s.detailText}>{t("market.news.detail.noSummary")}</p>}
        <p className={s.attribution} style={{ marginTop: 12 }}>
          {t("market.news.detail.summaryBy", { source: a.source })}
        </p>
      </div>
      <div>
        <ExternalButton href={a.readFullUrl} variant="primary">
          {t("market.news.detail.readFull")}
          <IconExternal size={16} />
          <span className="sr-only">{t("market.news.detail.opensNewTab")}</span>
        </ExternalButton>
      </div>
    </article>
  );
}
