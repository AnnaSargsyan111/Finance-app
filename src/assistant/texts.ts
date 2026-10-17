/**
 * Fixed texts of the AI layer. The Armenian one is Anna's reviewed "I'm not sure" (src/ui/assistant/hy.ts, HY.notSure): a test checks that
 * the two stay identical, because this module must not import UI code.
 */
export const NOT_FOUND_TEXT = {
  en: "I couldn't find a reliable answer to that in the official pages I can read. Please check the official source.",
  hy: "Այս հարցում վստահ չեմ։ Խնդրում եմ ստուգել պաշտոնական աղբյուրը։",
} as const;
