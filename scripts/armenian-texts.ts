/**
 * Writes research/assistant-eval/armenian-texts-in-use.md: every Armenian text the assistant shows, straight from src/ui/assistant/hy.ts,
 * for a last read-through. Run: npx tsx scripts/armenian-texts.ts
 */
import fs from "node:fs";
import path from "node:path";
import { durationHy, HY } from "../src/ui/assistant/hy";
import { HY_METRICS } from "../src/ui/assistant/hy-metrics";
import { HY_TERMS } from "../src/ui/assistant/hy-terms";

const rows: [string, string, string][] = [
  ["Welcome (your own final wording)", HY.welcome, "reviewed"],
  ["Deposit guarantee", HY.depositGuarantee, "reviewed (punctuation tidied)"],
  ["Tax on deposit interest", HY.interestTax, "reviewed (your change: Պայմանները)"],
  ["Tax on dividends", HY.dividendTax, "reviewed"],
  ["What should I buy? (links to the Investment page)", HY.advice, "reviewed"],
  ["No predictions", HY.predict, "reviewed (version A)"],
  ["No live numbers yet", HY.live, "reviewed"],
  ["No guarantee", HY.noGuarantee, "reviewed"],
  ["I'm not sure", HY.notSure, "reviewed"],
  ["Savings plan (example: 3,000,000 AMD in 2 years)", HY.plan("3,000,000 AMD", durationHy(24), "125,000 AMD"), "reviewed"],
  ["Savings plan (example: 1,800,000 AMD in 18 months)", HY.plan("1,800,000 AMD", durationHy(18), "100,000 AMD"), "reviewed template; the time words are mine"],
  ["Asking for the amount and the time", HY.askAmountAndTime, "PENDING: not yet reviewed"],
  ["Card number warning", HY.cardWarning, "PENDING: not yet reviewed"],
  ["Which banks are there? (links to Market & News)", HY.banks, "PENDING: not yet reviewed"],
  ["AI answer label: confirmed", HY.labels.confirmed, "PENDING: not yet reviewed"],
  ["AI answer label: not fully sure", HY.labels.partial, "PENDING: not yet reviewed"],
  ["AI answer label: nothing found", HY.labels.none, "PENDING: not yet reviewed"],
  ["AI answer: \"Sources\" heading", HY.labels.sources, "PENDING: not yet reviewed"],
  ["AI answer: \"not personal advice\" line", HY.labels.footnote, "PENDING: not yet reviewed"],
];

const explained = [
  ...Object.entries(HY_TERMS).map(([id, t]) => ({ id, title: id, ...t })),
  ...Object.entries(HY_METRICS).map(([id, m]) => ({ id, title: m.title, text: m.text, example: m.example })),
];

const out = [
  "# Armenian texts the assistant uses now",
  "",
  "Generated from `src/ui/assistant/hy.ts` (run `npx tsx scripts/armenian-texts.ts` to refresh). Page names: " +
    `«${HY.pages.invest}» (Investment Recommendation), «${HY.pages.market}» (Market & News), «${HY.pages.personal}» (Personal Finance).`,
  "",
  "Please read once more. Anything marked PENDING I wrote and you have not read yet. To change a text, write the new wording next to it (or in the chat).",
  "",
  ...rows.flatMap(([title, text, status]) => [`### ${title}`, `*${status}*`, "", ...text.split("\n").map((l) => `> ${l}`), "", "- [ ] OK   - [ ] fix:", ""]),
  `## Explanations of terms and project metrics (${explained.length}), each with an example. ALL PENDING: I wrote them, you have not read them yet`,
  "",
  "These answer \"what is ...?\" for every metric Finova shows (Stocks cards and Investment results) and for the finance terms. Asking for an example (\"օրինակ\") after an explanation gives the example. All numbers in the examples are invented and the examples say so. Please mark each OK or write your wording.",
  "",
  ...explained.flatMap((e) => [`### ${e.title} (${e.id})`, "", ...e.text.split("\n").map((l) => `> ${l}`), "", ...e.example.split("\n").map((l) => `> ${l}`), "", "- [ ] OK   - [ ] fix:", ""]),
  "## What Armenian does NOT cover yet",
  "",
  "- The assistant answers terms and metrics from fixed, pending-review texts (above). Anything else gets the reviewed \"I'm not sure\".",
  "- The step-by-step savings interview in Armenian (goal, income, savings, interest rate, what-ifs): in Armenian the assistant only handles a goal and a time written in one sentence.",
  "- Quick-reply buttons and the plan card are English (the screen is English).",
  "",
];
const file = path.resolve(import.meta.dirname, "..", "research", "assistant-eval", "armenian-texts-in-use.md");
fs.writeFileSync(file, out.join("\n"));
console.log("written", file);
