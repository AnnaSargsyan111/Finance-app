import { EN } from "./dict/en";
import { HY } from "./dict/hy";
import { getCurrentLocale, type Locale } from "./locale";

/**
 * Looking up a text. A text is a string with {name} placeholders, or a function of the parameters (for plurals and sentences that are built
 * from numbers). Keys are dotted paths into the dictionary ("auth.login.title"). A missing Armenian text falls back to English, and a key
 * that does not exist anywhere shows the key itself (visible in the page and caught by tests).
 */
export type Params = Record<string, string | number>;
export type Leaf = string | ((p: Params) => string);
export interface Dictionary {
  [k: string]: Leaf | Dictionary;
}

/** every dotted key of a dictionary type: "common.save" | "auth.login.title" | ... */
export type Paths<T, P extends string = ""> = {
  [K in keyof T & string]: T[K] extends string | ((...a: never[]) => string) ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];

export type Key = Paths<typeof EN>;

/** a dictionary in which any text may still be missing (Armenian while it is being written) */
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends string ? string : T[K] extends (...a: never[]) => string ? (p: Params) => string : DeepPartial<T[K]> };

const DICTS: Record<Locale, Dictionary> = { en: EN as unknown as Dictionary, hy: HY as unknown as Dictionary };

function lookup(dict: Dictionary, key: string): Leaf | undefined {
  let node: Leaf | Dictionary | undefined = dict;
  for (const part of key.split(".")) {
    if (node === undefined || typeof node === "string" || typeof node === "function") return undefined;
    node = node[part];
  }
  return typeof node === "string" || typeof node === "function" ? node : undefined;
}

export function translate(locale: Locale, key: string, params?: Params): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(DICTS.en, key);
  if (raw === undefined) return key;
  const text = typeof raw === "function" ? raw(params ?? {}) : raw;
  return text.replace(/\{(\w+)\}/g, (m, name: string) => (params && name in params ? String(params[name]) : m));
}

/** for code outside React components: uses the locale LocaleProvider last set */
export const tg = (key: Key, params?: Params): string => translate(getCurrentLocale(), key, params);

/** whether a text exists in a language (no fallback): used by the completeness test */
export const hasText = (locale: Locale, key: string): boolean => lookup(DICTS[locale], key) !== undefined;

/** all keys of the English dictionary, for the completeness test */
export function allKeys(dict: Dictionary = DICTS.en, prefix = ""): string[] {
  return Object.entries(dict).flatMap(([k, v]) => (typeof v === "string" || typeof v === "function" ? [`${prefix}${k}`] : allKeys(v, `${prefix}${k}.`)));
}
