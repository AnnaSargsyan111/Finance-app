"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { LANG_COOKIE, LANG_COOKIE_MAX_AGE, setCurrentLocale, type Locale } from "./locale";
import { translate, type Key, type Params } from "./translate";

interface LocaleContext {
  locale: Locale;
  setLocale: (l: Locale) => void;
}

const Ctx = createContext<LocaleContext>({ locale: "en", setLocale: () => undefined });

/**
 * Holds the chosen language. The server reads the cookie and passes the language in, so the very first paint is already in it (no flash).
 * Changing it updates the context (every component that calls useLocale / useT re-renders, keeping its state), the cookie and <html lang>.
 */
export function LocaleProvider({ initial, children }: { initial: Locale; children: ReactNode }) {
  const [locale, set] = useState<Locale>(initial);
  // plain functions (dates, error texts) read this; it must be set before the children render
  setCurrentLocale(locale);

  const setLocale = useCallback((l: Locale) => {
    try {
      document.cookie = `${LANG_COOKIE}=${l}; Path=/; Max-Age=${LANG_COOKIE_MAX_AGE}; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
    } catch {
      /* the choice still applies to this visit */
    }
    document.documentElement.lang = l;
    setCurrentLocale(l);
    set(l);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useLocale = (): LocaleContext => useContext(Ctx);

/** t("auth.login.title") or t("common.ago.minutes", { n: 5 }): in the chosen language, English where an Armenian text is missing */
export function useT(): (key: Key, params?: Params) => string {
  const { locale } = useLocale();
  return useCallback((key: Key, params?: Params) => translate(locale, key, params), [locale]);
}
