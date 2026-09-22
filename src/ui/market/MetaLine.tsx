"use client";

import type { Meta } from "../api/types";
import { Note } from "../components/Feedback";
import { useNow } from "../hooks/useDebounce";
import { formatAgo, formatDateTime } from "../lib/format";
import s from "./market.module.css";

/** "Source: X · Updated 5 min ago" plus honest stale / delayed / fixture notices. */
export function MetaLine({ meta, label = "Updated", extra }: { meta?: Meta; label?: string; extra?: string }) {
  const now = useNow();
  if (!meta) return null;
  return (
    <div>
      <p className={s.metaLine}>
        {meta.source ? <span>Source: {meta.source}</span> : null}
        {meta.asOf ? (
          <span title={formatDateTime(meta.asOf)}>
            {label} {formatAgo(meta.asOf, now) || formatDateTime(meta.asOf)}
          </span>
        ) : null}
        {extra ? <span>{extra}</span> : null}
      </p>
      <div style={{ display: "grid", gap: 8, marginTop: meta.stale || meta.isDelayed || meta.isFixture ? 12 : 0 }}>
        {meta.stale ? <Note tone="warn">This data may be out of date: the latest refresh failed, so the last saved values are shown.{meta.note ? ` ${meta.note}` : ""}</Note> : null}
        {meta.isFixture ? <Note tone="warn">Prototype data: these values come from recorded test fixtures, not from a live market feed.</Note> : null}
        {meta.isDelayed ? <Note>Prices are delayed and indicative, from a free prototype data source. They are not real-time quotes.</Note> : null}
      </div>
    </div>
  );
}
