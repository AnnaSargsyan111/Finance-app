# Finova in Armenian: how the translation works

Decided with Anna on 2026-10-18. English stays the default language; Armenian is added next to it.

## Decisions

- **Switch:** EN | ՀԱՅ in the top bar and on the sign-in page. Same URLs in both languages (no /hy/ prefix).
- **Remembering:** a small cookie `finova-lang` (no account setting, no database change). The server reads it, so the first paint is already in the right language and `<html lang>` is right. Password-reset emails stay in English.
- **Numbers and dates:** amounts stay `3,000,000 AMD` in both languages; dates use Armenian month names (`18 հոկտեմբերի 2026`, `հոկտեմբեր 2026`, short `18 հոկ`).
- **News:** headlines and summaries stay as published. Only our own labels around them are translated.
- **Font:** Manrope has no Armenian letters, so Noto Sans Armenian sits behind it (`--font-armenian`, per-letter fallback).
- **Rollout:** everything in one go, then Anna reviews the Armenian in a sheet before it goes live.
- **Armenian terms Anna chose:** շահաբաժին (dividend), շուկայական կապիտալիզացիա (market cap), P/E (գնի և շահույթի հարաբերություն), առավելագույն անկում (drawdown); page names «Ներդրումային առաջարկ», «Շուկա և նորություններ», «Իմ ֆինանսները»; formal address (ձեր / դուք). Glossary: `research/armenian-glossary.md`.

## The machinery (src/ui/i18n)

- `dict/<area>.en.ts` holds the English texts of one area (the source of truth); `dict/<area>.hy.ts` the Armenian ones. Areas: `common`, `shell`, `auth`, `pf`, `market`, `metrics`, `invest`, `settings`, `assistant`, `errors`.
- A text is a string with `{name}` placeholders, or a function of the parameters for plurals and sentences built from numbers: `(p) => \`${p.n} items\``.
- In components: `const t = useT();` then `t("auth.login.title")` or `t("pf.items", { n: 3 })`. Keys are typed: a typo does not compile.
- In plain functions (validation, rules, formatting): `tg("errors.network")` (uses the language the provider last set).
- A component that calls the date or number helpers in `lib/format` (or `tg`) must also call `useT()` or `useLocale()`, so that it re-renders on a language change without losing its state.
- A missing Armenian text falls back to English at run time; `tests/ui/i18n.test.ts` requires none to be missing before release.
- Never translated: brand and product names (Finova), tickers and company names, user-entered text, data values from the API, URLs, currency codes and symbols (AMD, USD, $), numbers.
- English output must stay byte-identical: the existing tests assert English strings.

## Rules for moving texts out of a screen

1. Every user-visible string moves to the area's English dictionary: visible text, `aria-label`, `title`, `placeholder`, `alt`, screen-reader-only text, button and chip labels, empty and error states, table headers, tooltips and popovers.
2. Words repeated across screens may be repeated in each area's dictionary (do not share keys across areas, so that areas can be edited independently).
3. Texts built from numbers become functions or use `{placeholders}`, never string concatenation of translated pieces (Armenian word order differs).
4. Plurals: Armenian uses the singular after a number ("2 ամիս"), so one form is enough, but keep English correct ("1 month", "2 months") with a function.
5. Server-provided English text (API error messages, category labels, driver labels) is mapped through the dictionary by a stable key or code and falls back to the server text; list every such place in the report.
6. Keep the English wording exactly as it is today.
