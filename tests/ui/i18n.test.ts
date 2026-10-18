import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_LOCALE, LANG_COOKIE, LOCALES, getCurrentLocale, isLocale, localeFromCookie, setCurrentLocale } from "@/ui/i18n/locale";
import { allKeys, hasText, translate, type Dictionary } from "@/ui/i18n/translate";
import { EN } from "@/ui/i18n/dict/en";
import { HY } from "@/ui/i18n/dict/hy";
import { formatAgo, formatDate, formatDateLong, formatDateTime, formatDayMonth, formatMonth, greeting } from "@/ui/lib/format";

afterEach(() => setCurrentLocale("en"));

describe("the translation machinery", () => {
  it("English is the default, and a bad or missing cookie means English", () => {
    expect(DEFAULT_LOCALE).toBe("en");
    expect([...LOCALES]).toEqual(["en", "hy"]);
    expect(LANG_COOKIE).toBe("finova-lang");
    expect(localeFromCookie(undefined)).toBe("en");
    expect(localeFromCookie("fr")).toBe("en");
    expect(localeFromCookie("hy")).toBe("hy");
    expect(isLocale("en")).toBe(true);
    expect(isLocale("xx")).toBe(false);
    expect(getCurrentLocale()).toBe("en");
  });

  it("looks texts up by key, fills placeholders, and falls back to English", () => {
    expect(translate("en", "common.language.label")).toBe("Language");
    expect(translate("hy", "common.language.label")).toBe("Լեզու");
    expect(translate("en", "common.ago.minutes", { n: 5 })).toBe("5 min ago");
    expect(translate("hy", "common.ago.minutes", { n: 5 })).toBe("5 րոպե առաջ");
    // a placeholder without a value stays visible instead of vanishing
    expect(translate("en", "common.ago.minutes")).toBe("{n} min ago");
    // an unknown key shows the key itself, so a mistake is visible in the page and in tests
    expect(translate("en", "nope.nothing")).toBe("nope.nothing");
    expect(translate("hy", "nope.nothing")).toBe("nope.nothing");
  });

  it("function texts get the parameters (plurals and sentences built from numbers)", () => {
    const dict: Dictionary = { a: { items: (p) => `${p.n} item${p.n === 1 ? "" : "s"}` } };
    const fn = dict.a as Dictionary;
    expect((fn.items as (p: Record<string, number>) => string)({ n: 1 })).toBe("1 item");
    expect((fn.items as (p: Record<string, number>) => string)({ n: 2 })).toBe("2 items");
    expect(allKeys(dict)).toEqual(["a.items"]);
  });

  it("hasText tells whether a language has its own text (no fallback)", () => {
    expect(hasText("en", "common.language.label")).toBe(true);
    expect(hasText("hy", "common.language.label")).toBe(true);
    expect(hasText("hy", "nope.nothing")).toBe(false);
  });
});

describe("dates and times follow the language, numbers do not", () => {
  it("English is exactly as before", () => {
    expect(formatDate("2026-10-18")).toBe("18 Oct 2026");
    expect(formatDayMonth("2026-10-18")).toBe("18 Oct");
    expect(formatMonth("2026-10")).toBe("October 2026");
    expect(formatDateLong("2026-10-18")).toBe("October 18, 2026");
    expect(formatDateTime("2026-10-18T10:03:00Z")).toBe("18 Oct 2026, 14:03");
    expect(formatAgo("2026-10-18T09:55:00Z", new Date("2026-10-18T10:00:00Z"))).toBe("5 min ago");
  });

  it("Armenian uses Armenian month names and word order", () => {
    setCurrentLocale("hy");
    expect(formatDate("2026-10-18")).toBe("18 հոկ 2026");
    expect(formatDayMonth("2026-10-18")).toBe("18 հոկ");
    expect(formatMonth("2026-10")).toBe("Հոկտեմբեր 2026");
    expect(formatDateLong("2026-10-18")).toBe("18 հոկտեմբերի 2026");
    expect(formatDateTime("2026-10-18T10:03:00Z")).toBe("18 հոկ 2026, 14:03");
    expect(formatAgo("2026-10-18T09:55:00Z", new Date("2026-10-18T10:00:00Z"))).toBe("5 րոպե առաջ");
    expect(formatAgo("2026-10-18T09:59:50Z", new Date("2026-10-18T10:00:00Z"))).toBe("հենց նոր");
    expect(greeting(new Date("2026-10-18T05:00:00Z"))).toBe("Բարի լույս"); // 09:00 in Yerevan
    expect(greeting(new Date("2026-10-18T10:00:00Z"))).toBe("Բարի օր"); // 14:00
    expect(greeting(new Date("2026-10-18T15:00:00Z"))).toBe("Բարի երեկո"); // 19:00
  });

  it("all twelve months exist in every form", () => {
    for (const kind of ["monthShort", "monthLong", "monthInDate"] as const) {
      for (let m = 1; m <= 12; m++) {
        const key = `common.${kind}.m${String(m).padStart(2, "0")}`;
        expect(hasText("en", key), key).toBe(true);
        expect(hasText("hy", key), key).toBe(true);
      }
    }
  });
});

/** Latin words that may stay in an Armenian text: brand and product names, codes, units, source names */
const LATIN_OK = new Set([
  "Finova", "English", "fawazahmed", "Frankfurter", "AMD", "USD", "EUR", "GEL", "RUB", "EN", "AI", "EPS", "ROE", "P", "E", "S", "B", "TTM", "ETF", "S&P", "CBA", "SEC", "EDGAR", "Rate", "am", "cba", "adgf", "Ameriabank", "ACBA", "Bank", "IDBank", "Finnhub", "Twelve", "Data", "Yahoo", "FCF", "CAGR", "US", "GOOGL", "NVDA", "AAPL", "MSFT", "AMZN", "TSLA", "ID", "OK", "X", "a", "id", "Schwab", "Berkshire", "Hathaway", "Dow", "Jones", "VOC", "Nvidia", "HUD", "JSON", "ESG", "A", "benchmark", "Google",
]);

describe("the Armenian dictionary is complete and clean", () => {
  const keys = allKeys();

  it("every English text has an Armenian text (nothing falls back to English at release)", () => {
    const missing = keys.filter((k) => !hasText("hy", k));
    expect(missing).toEqual([]);
  });

  it("no Armenian text exists without its English text (no orphans, no typos in keys)", () => {
    const en = new Set(keys);
    const orphans = allKeys(HY as unknown as Dictionary).filter((k) => !en.has(k));
    expect(orphans).toEqual([]);
  });

  it("no empty texts; placeholders match between the languages", () => {
    const probe = new Proxy({}, { get: () => "9" }) as Record<string, string>;
    const bad: string[] = [];
    const get = (root: unknown, key: string) => key.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], root);
    for (const k of keys) {
      const en = get(EN, k);
      const hy = get(HY, k);
      const enText = typeof en === "function" ? (en as (p: Record<string, string>) => string)(probe) : String(en);
      const hyText = typeof hy === "function" ? (hy as (p: Record<string, string>) => string)(probe) : String(hy);
      if (!enText.trim() || !hyText.trim()) bad.push(`${k}: empty`);
      if (typeof en === "string" && typeof hy === "string") {
        const ph = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
        if (ph(en) !== ph(hy)) bad.push(`${k}: placeholders differ (${ph(en)} vs ${ph(hy)})`);
      }
    }
    expect(bad).toEqual([]);
  });

  it("an Armenian text is Armenian: no leftover English words", () => {
    const probe = new Proxy({}, { get: () => "9" }) as Record<string, string>;
    const bad: string[] = [];
    for (const k of keys) {
      const hy = k.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], HY);
      const text = typeof hy === "function" ? (hy as (p: Record<string, string>) => string)(probe) : String(hy ?? "");
      const words = (text.replace(/\{\w+\}/g, "").match(/[A-Za-z][A-Za-z&'-]*/g) ?? []).map((w) => w.replace(/-+$/, "")).filter((w) => !LATIN_OK.has(w));
      if (words.length) bad.push(`${k}: ${words.join(" ")}`);
    }
    expect(bad).toEqual([]);
  });
});

describe("screens re-render when the language changes", () => {
  it("a component that uses the date or number helpers also uses the translator, so it does not show stale text", () => {
    const UI = path.resolve(import.meta.dirname, "..", "..", "src", "ui");
    const walk = (d: string, out: string[] = []): string[] => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith(".tsx")) out.push(p);
      }
      return out;
    };
    const offenders: string[] = [];
    for (const f of walk(UI)) {
      if (f.includes(`${path.sep}i18n${path.sep}`)) continue;
      const src = fs.readFileSync(f, "utf8");
      const usesFormat = /from\s+["'][^"']*lib\/format["']/.test(src);
      const usesI18n = /from\s+["'][^"']*i18n(?:\/[A-Za-z]+)?["']/.test(src);
      if (usesFormat && !usesI18n) offenders.push(path.relative(UI, f).replace(/\\/g, "/"));
    }
    expect(offenders).toEqual([]);
  });
});
