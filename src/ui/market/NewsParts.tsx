"use client";

import { useState } from "react";
import { Chip } from "../components/Display";
import { useT, type Key } from "../i18n";
import { cx } from "../lib/cx";
import { NewsArt } from "./NewsArt";
import s from "./market.module.css";

/**
 * Hot-linked image (no proxying in v1); the request is sent without a Referer header (some publishers block hot-links that carry one).
 * An article with no image, or whose image fails to load, gets generated artwork for its topic instead (see NewsArt), so the feed never
 * shows an empty placeholder. `labelArt` adds a small "Illustration" tag on that artwork (used on the article page).
 */
export function NewsImage({ src, alt = "", className, article, labelArt }: { src: string | null; alt?: string; className?: string; article: { id: string; category: string; region?: string }; labelArt?: boolean }) {
  const t = useT();
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  return (
    <div className={cx(s.imgBox, className)}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.img} src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <>
          <NewsArt seed={article.id} category={article.category} region={article.region} />
          {labelArt ? <span className={s.artLabel}>{t("market.news.illustration")}</span> : null}
        </>
      )}
    </div>
  );
}

/** our topic labels (the server sends them in English); an unknown label is shown as sent */
const CATEGORY_KEYS: Record<string, Key> = {
  Markets: "market.news.category.markets",
  Economy: "market.news.category.economy",
  "Currencies & Commodities": "market.news.category.currencies",
  Technology: "market.news.category.technology",
  Armenia: "market.news.category.armenia",
  World: "market.news.category.world",
};

export function CategoryChip({ category }: { category: string }) {
  const t = useT();
  return <Chip>{CATEGORY_KEYS[category] ? t(CATEGORY_KEYS[category]) : category}</Chip>;
}
