"use client";

import { useState } from "react";
import { IconImage } from "../components/Icons";
import { Chip } from "../components/Display";
import { cx } from "../lib/cx";
import s from "./market.module.css";

/**
 * Hot-linked image (no proxying in v1). Missing or broken images show a placeholder; the request is sent without a
 * Referer header (some publishers block hot-links that carry one).
 */
export function NewsImage({ src, alt = "", className }: { src: string | null; alt?: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;
  return (
    <div className={cx(s.imgBox, className)}>
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className={s.img} src={src} alt={alt} referrerPolicy="no-referrer" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : (
        <div className={s.imgFallback} role="img" aria-label="No image available for this article">
          <IconImage size={36} />
        </div>
      )}
    </div>
  );
}

export function CategoryChip({ category }: { category: string }) {
  return <Chip>{category}</Chip>;
}
