"use client";

import { useState } from "react";
import { Chip } from "../components/Display";
import { cx } from "../lib/cx";
import { NewsArt } from "./NewsArt";
import s from "./market.module.css";

/**
 * Hot-linked image (no proxying in v1); the request is sent without a Referer header (some publishers block hot-links that carry one).
 * An article with no image, or whose image fails to load, gets generated artwork for its topic instead (see NewsArt), so the feed never
 * shows an empty placeholder. `labelArt` adds a small "Illustration" tag on that artwork (used on the article page).
 */
export function NewsImage({ src, alt = "", className, article, labelArt }: { src: string | null; alt?: string; className?: string; article: { id: string; category: string; region?: string }; labelArt?: boolean }) {
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
          {labelArt ? <span className={s.artLabel}>Illustration</span> : null}
        </>
      )}
    </div>
  );
}

export function CategoryChip({ category }: { category: string }) {
  return <Chip>{category}</Chip>;
}
