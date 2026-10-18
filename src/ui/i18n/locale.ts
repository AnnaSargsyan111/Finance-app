/**
 * Languages of the interface. English is the default and the source of truth: every text exists in English first, and an Armenian text
 * that is missing falls back to English at run time (a test makes sure none is missing before release).
 */
export const LOCALES = ["en", "hy"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "en";

/** a small functional cookie (not personal data): the chosen language, read on the server so the first paint is already in that language */
export const LANG_COOKIE = "finova-lang";
export const LANG_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v);

/** the cookie value as a locale, or the default for anything else (a missing, old or tampered cookie) */
export const localeFromCookie = (v: string | null | undefined): Locale => (isLocale(v) ? v : DEFAULT_LOCALE);

/**
 * The locale that plain functions (format.ts, error messages, validation) read, because they are not React components. LocaleProvider
 * sets it while rendering, before its children render. Components must still call useLocale() or useT() so that they re-render on a change.
 */
let current: Locale = DEFAULT_LOCALE;
export const getCurrentLocale = (): Locale => current;
export const setCurrentLocale = (l: Locale): void => {
  current = l;
};
