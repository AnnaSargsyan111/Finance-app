"use client";

import { IconAlert, IconCheck, IconInfo } from "../components/Icons";
import { useT } from "../i18n/LocaleProvider";
import { translate } from "../i18n/translate";
import { cx } from "../lib/cx";
import { formatDate } from "../lib/format";
import { HY } from "./hy";
import type { Confidence, SourceRef } from "./types";
import s from "./assistant.module.css";

type Lang = "en" | "hy";

/**
 * The labels follow the language OF THE ANSWER (an answer written in Armenian has Armenian labels, one in English has English labels),
 * whatever the language of the screen. Armenian: HY.labels (kept with the answer engine). English: the dictionary (assistant.ai.*).
 */
const words = (lang: Lang) =>
  lang === "hy"
    ? HY.labels
    : {
        confirmed: translate("en", "assistant.ai.confirmed"),
        partial: translate("en", "assistant.ai.partial"),
        none: translate("en", "assistant.ai.none"),
        sources: translate("en", "assistant.ai.sources"),
        footnote: translate("en", "assistant.ai.footnote"),
      };

/** Icon and words together, so the level never relies on colour. The hidden colon makes screen readers read "Confirmed ...: answer". */
export function ConfidenceLabel({ confidence, lang }: { confidence: Confidence; lang: Lang }) {
  const Icon = confidence === "confirmed" ? IconCheck : confidence === "partial" ? IconAlert : IconInfo;
  return (
    <p className={cx(s.conf, confidence === "confirmed" && s.confOk, confidence === "partial" && s.confWarn)} lang={lang}>
      <Icon size={14} />
      <span>{words(lang)[confidence]}</span>
      <span className="sr-only">: </span>
    </p>
  );
}

// The addresses arrive from the API at run time; only web links are ever turned into a link.
const isWebUrl = (u: string) => /^https?:\/\//i.test(u);

export function AiSources({ sources, lang }: { sources: SourceRef[]; lang: Lang }) {
  const t = useT(); // also re-renders the dates below when the language changes
  const w = words(lang);
  return (
    <div className={s.aiMeta} lang={lang}>
      {sources.length > 0 ? (
        <>
          <p className={s.sourcesTitle}>{w.sources}</p>
          <ul className={s.sourceList}>
            {sources.map((src, i) => (
              <li key={`${i}-${src.url}`} className={s.sourceItem}>
                {isWebUrl(src.url) ? (
                  <a href={src.url} target="_blank" rel="noopener noreferrer" className={s.sourceLink}>
                    {src.title}
                    <span className="sr-only"> {t("assistant.ai.newTab")}</span>
                  </a>
                ) : (
                  <span>{src.title}</span>
                )}
                {src.date ? (
                  <span className={s.sourceDate}>
                    {lang === "en" ? `${translate("en", "assistant.ai.read")} ` : ""}
                    <span className="num">{formatDate(src.date)}</span>
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
      <p className={s.footnote}>{w.footnote}</p>
    </div>
  );
}
