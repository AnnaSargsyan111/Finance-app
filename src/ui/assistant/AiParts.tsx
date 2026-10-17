import { IconAlert, IconCheck, IconInfo } from "../components/Icons";
import { cx } from "../lib/cx";
import { formatDate } from "../lib/format";
import { HY } from "./hy";
import type { Confidence, SourceRef } from "./types";
import s from "./assistant.module.css";

type Lang = "en" | "hy";

const EN = {
  confirmed: "Confirmed by an official source",
  partial: "Not fully sure: please check the source",
  none: "No reliable source found",
  sources: "Sources",
  footnote: "AI-assisted answer from official pages. Not personal advice.",
} as const;

const words = (lang: Lang) => (lang === "hy" ? HY.labels : EN);

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
                    <span className="sr-only"> (opens in a new tab)</span>
                  </a>
                ) : (
                  <span>{src.title}</span>
                )}
                {src.date ? (
                  <span className={s.sourceDate}>
                    {lang === "en" ? "read " : ""}
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
