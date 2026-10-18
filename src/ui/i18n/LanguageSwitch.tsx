"use client";

import { Segmented } from "../components/Display";
import { useLocale, useT } from "./LocaleProvider";
import { isLocale, type Locale } from "./locale";

/** The EN | ՀԱՅ switch (top bar and sign-in page). The labels are the same in both languages: each language names itself. */
export function LanguageSwitch({ className }: { className?: string }) {
  const { locale, setLocale } = useLocale();
  const t = useT();
  return (
    <Segmented<Locale>
      label={t("common.language.label")}
      value={locale}
      onChange={(v) => isLocale(v) && setLocale(v)}
      className={className}
      options={[
        { value: "en", label: t("common.language.shortEn"), title: t("common.language.en") },
        { value: "hy", label: t("common.language.shortHy"), title: t("common.language.hy") },
      ]}
    />
  );
}
