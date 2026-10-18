import "server-only";
import type { Metadata } from "next";
import { cookies } from "next/headers";
import { LANG_COOKIE, localeFromCookie, type Locale } from "./locale";
import { translate, type Key } from "./translate";

/** the language of this request, from the cookie (server components only) */
export async function getLocale(): Promise<Locale> {
  return localeFromCookie((await cookies()).get(LANG_COOKIE)?.value);
}

/** for pages: `export const generateMetadata = () => pageMetadata("common.meta.invest")` gives the tab title in the chosen language */
export async function pageMetadata(key: Key): Promise<Metadata> {
  return { title: translate(await getLocale(), key) };
}
