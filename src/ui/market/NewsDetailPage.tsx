"use client";

import { useParams } from "next/navigation";
import { getNewsDetail } from "../api/market";
import { errorMessage, isApiError } from "../api/client";
import { ExternalButton, LinkButton } from "../components/Button";
import { EmptyState, ErrorState, Skeleton } from "../components/Feedback";
import { IconArrowLeft, IconExternal } from "../components/Icons";
import { useResource } from "../hooks/useResource";
import { formatDateTime } from "../lib/format";
import { CategoryChip, NewsImage } from "./NewsParts";
import s from "./market.module.css";

function BackLink() {
  return (
    <div>
      <LinkButton href="/market?tab=news" variant="ghost" size="sm">
        <IconArrowLeft size={16} />
        Back to News
      </LinkButton>
    </div>
  );
}

export function NewsDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const res = useResource((signal) => getNewsDetail(id, signal), [id]);

  if (res.status === "error") {
    const notFound = isApiError(res.error) && res.error.status === 404;
    return (
      <div className={s.detail}>
        {notFound ? null : <BackLink />}
        {notFound ? (
          <EmptyState title="This article is no longer available" message="Articles stay available for about a week after they appear. Head back to the news list to see the latest ones." action={<LinkButton href="/market?tab=news" variant="secondary" size="sm">Back to News</LinkButton>} />
        ) : (
          <ErrorState title="We couldn't load this article" message={errorMessage(res.error)} onRetry={res.reload} />
        )}
      </div>
    );
  }
  if (!res.data) {
    return (
      <div className={s.detail} role="status" aria-busy="true">
        <span className="sr-only">Loading article</span>
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
          Source: <strong style={{ color: "var(--text)", fontWeight: 600 }}>{a.source}</strong>
        </span>
        <time dateTime={a.publishedAt}>{formatDateTime(a.publishedAt)}</time>
      </div>
      <h1 className={s.detailTitle}>{a.title}</h1>
      <NewsImage src={a.imageUrl} className={s.detailHero} />
      <div>
        {a.summary ? <p className={s.detailText}>{a.summary}</p> : <p className={s.detailText}>The publisher&apos;s feed didn&apos;t include a summary for this article. Use the button below to read it at the source.</p>}
        <p className={s.attribution} style={{ marginTop: 12 }}>
          Summary provided by {a.source}. Finova does not copy full articles.
        </p>
      </div>
      <div>
        <ExternalButton href={a.readFullUrl} variant="primary">
          Read Full Article
          <IconExternal size={16} />
          <span className="sr-only"> (opens the original article in a new tab)</span>
        </ExternalButton>
      </div>
    </article>
  );
}
