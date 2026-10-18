"use client";

import type { Meta } from "../api/types";
import { Note } from "../components/Feedback";
import { useNow } from "../hooks/useDebounce";
import { useT, type Key } from "../i18n";
import { formatAgo, formatDateTime } from "../lib/format";
import s from "./market.module.css";

type MetaKind = "updated" | "ratesFetched" | "ratesRead";
const KIND_KEY: Record<MetaKind, Key> = { updated: "market.meta.updated", ratesFetched: "market.meta.ratesFetched", ratesRead: "market.meta.ratesRead" };

/** English `meta.source` strings the server sends, by exact value; any other source (a data-source name such as "Finnhub") is shown as sent */
const SERVER_SOURCES: Record<string, Key> = {
  "stored CBA history (all live providers unavailable)": "market.server.sourceStoredCba",
  "fawazahmed0 (market rate, not the CBA reference rate)": "market.server.sourceFawazahmed0",
  "Bank rate boards via Rate.am (indicative, not the CBA reference rate)": "market.server.sourceBankBoards",
  "Frankfurter (CBA data)": "market.server.sourceFrankfurter",
};
const SERVER_NOTES: Record<string, Key> = {
  "Fallback market rate: differs slightly from the CBA official rate.": "market.server.noteFallbackRate",
  "FIXTURE MODE: values are synthetic test data, not market data.": "market.server.noteFixtureMode",
};
const REFRESH_FAILED = "Upstream refresh failed; showing the last good value.";

/** "Source: X · Updated 5 min ago" plus honest stale / delayed / fixture notices. */
export function MetaLine({ meta, kind = "updated", extra }: { meta?: Meta; kind?: MetaKind; extra?: string }) {
  const t = useT();
  const now = useNow();
  if (!meta) return null;
  const source = meta.source ? (SERVER_SOURCES[meta.source] ? t(SERVER_SOURCES[meta.source]) : meta.source) : null;
  const rawNote = typeof meta.note === "string" ? meta.note : "";
  const note = SERVER_NOTES[rawNote] ? t(SERVER_NOTES[rawNote]) : rawNote.startsWith(REFRESH_FAILED) ? `${t("market.server.noteRefreshFailed")}${rawNote.slice(REFRESH_FAILED.length)}` : rawNote;
  return (
    <div>
      <p className={s.metaLine}>
        {source ? <span>{t("market.meta.source", { source })}</span> : null}
        {meta.asOf ? <span title={formatDateTime(meta.asOf)}>{t(KIND_KEY[kind], { when: formatAgo(meta.asOf, now) || formatDateTime(meta.asOf) })}</span> : null}
        {extra ? <span>{extra}</span> : null}
      </p>
      <div style={{ display: "grid", gap: 8, marginTop: meta.stale || meta.isDelayed || meta.isFixture ? 12 : 0 }}>
        {meta.stale ? (
          <Note tone="warn">
            {t("market.meta.stale")}
            {note ? ` ${note}` : ""}
          </Note>
        ) : null}
        {meta.isFixture ? <Note tone="warn">{t("market.meta.fixture")}</Note> : null}
        {meta.isDelayed ? <Note>{t("market.meta.delayed")}</Note> : null}
      </div>
    </div>
  );
}
