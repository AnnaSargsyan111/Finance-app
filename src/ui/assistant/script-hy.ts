/**
 * The Armenian side of the scripted assistant. It understands a person writing in Armenian (keywords, not grammar) and answers with
 * Armenian texts that are written in advance (hy.ts: reviewed by Anna; hy-terms.ts: explanations of terms, PENDING her review).
 * It does not translate anything on the fly and it never invents a fact: a question it does not recognise gets the reviewed
 * "I'm not sure" text. It remembers the last term, so "օրինակ" (example) refers to it.
 * The savings-goal conversation is not here: script.ts runs it for both languages (the Armenian questions and texts are in interview-hy.ts).
 */
import { HY } from "./hy";
import { HY_METRIC_MATCHERS, HY_METRICS } from "./hy-metrics";
import { HY_TERMS } from "./hy-terms";
import type { BotMessage } from "./types";

type Draft = Omit<BotMessage, "id" | "role">;

const RX = {
  card: /(?:\d[ -]?){13,19}/,
  greeting: /^\s*(բարև|ողջույն|բարի օր|բարի երեկո|բարի լույս|հեյ)/,
  deposit: /ավանդ/,
  guarantee: /(երաշխավոր|պաշտպան|ապահով|ապահովագր)/,
  tax: /հարկ/,
  interest: /տոկոս/,
  dividend: /(շահաբաժին|դիվիդենդ)/,
  advice: /((ի՞նչ|ինչ).{0,15}(գնեմ|գնել|ներդրեմ|ներդնեմ|ներդրել|անեմ))|գնե՞մ|ներդրե՞մ|((պետք է|արժե).{0,10}(գնել|գնեմ|ներդնել|ներդրեմ))|խորհուրդ|(ո՞ր|որ) բաժնետոմս/,
  predict: /(կանխատես|ի՞նչ կլինի|ինչ կլինի|կբարձրանա|կիջնի|կընկնի|կաճի|հաջորդ ամիս|հաջորդ տարի|հաջորդ շաբաթ)/,
  currency: /(փոխարժեք|դոլար|եվրո|ռուբլի|լարի)/,
  now: /(այսօր|հիմա|ընթացիկ|ներկայումս|ինչքան է|քանի՞ է)/,
  sure: /(երաշխավոր|անպայման|հաստատ)/,
  reach: /(հասն|կարողան|հաջող|կստանամ)/,
  example: /օրինակ/,
  banks: /(ինչ|որ|քանի).{0,10}բանկեր|բանկերի (ցանկ|ցուցակ)|banks/,
};

/** the terms, in the order they are checked (more specific first) */
const TERMS: { id: string; test: RegExp }[] = [
  ...HY_METRIC_MATCHERS,
  { id: "eps", test: /eps|մեկ բաժնետոմսի շահույթ/ },
  { id: "pe", test: /p\/e|p\.e|գնի և շահույթի հարաբեր/ },
  { id: "marketCap", test: /կապիտալիզացի|շուկայական արժեք|market cap/ },
  { id: "dividendYield", test: /եկամտաբերություն/ },
  { id: "compound", test: /բարդ տոկոս/ },
  { id: "buySell", test: /(առքի|վաճառքի).{0,15}փոխարժեք|առք.{0,10}վաճառք/ },
  { id: "drawdown", test: /անկում/ },
  { id: "diversification", test: /դիվերսիֆիկ|բազմազանեց/ },
  { id: "inflation", test: /գնաճ/ },
  { id: "dividend", test: /(շահաբաժին|դիվիդենդ)/ },
  { id: "bond", test: /պարտատոմս|bond/ },
  { id: "etf", test: /etf|ֆոնդ/ },
  { id: "portfolio", test: /պորտֆել|portfolio/ },
  { id: "risk", test: /ռիսկ|risk/ },
  { id: "investment", test: /ներդրում|investment/ },
  { id: "interestRate", test: /տոկոսադրույք|interest rate/ },
  { id: "deposit", test: /ավանդ|deposit/ },
  { id: "share", test: /բաժնետոմս|share|stock/ },
];

/** every explained term and metric, by id */
const ALL = { ...HY_TERMS, ...HY_METRICS };

// "տար..." = years, "ամ..." = months; a lone "տ" is read as "years" ("2 տ")
const DURATION = /(\d+(?:[.,]\d+)?)\s*(տար\S*|ամ\S*|տ(?![Ա-֏]))/g;
const MONEY = /(\d{1,3}(?:[ ,]\d{3})+|\d+(?:[.,]\d+)?)\s*(միլիոն|մլն|հազար|հզ)?/g;

/** small number words before "տարի" / "ամիս" ("երկու տարի" = 2 years) */
const NUMBER_WORDS: Record<string, number> = { մեկ: 1, մի: 1, երկու: 2, երեք: 3, չորս: 4, հինգ: 5, վեց: 6, յոթ: 7, ութ: 8, ինը: 9, տասը: 10, տասնմեկ: 11, տասներկու: 12, տասնհինգ: 15, տասնութ: 18, քսան: 20, երեսուն: 30 };

/** "3 միլիոն" -> 3000000 ("մլն" = million, "հզ" = thousand) */
export function moneyValueHy(num: string, unit?: string): number {
  const grouped = /^\d{1,3}(?:[ ,]\d{3})+$/.test(num);
  const base = grouped ? Number(num.replace(/[ ,]/g, "")) : Number(num.replace(",", "."));
  return unit === "միլիոն" || unit === "մլն" ? base * 1e6 : unit === "հազար" || unit === "հզ" ? base * 1e3 : base;
}

/** "2 տարում", "18 ամսում", "1.5 տարի", "երկու տարի", "կես տարի" -> months; the rest of the text without those parts */
export function durationOf(raw: string): { months: number; rest: string } | null {
  let months = 0;
  let found = false;
  const words = Object.keys(NUMBER_WORDS).join("|");
  const text = raw
    .replace(/կես\s+տար\S*/g, () => {
      months += 6;
      found = true;
      return " ";
    })
    .replace(new RegExp(`(?<![Ա-֏])(${words})(?=\\s*(?:տար|ամ))`, "g"), (w) => String(NUMBER_WORDS[w]));
  const rest = text.replace(DURATION, (_m, n: string, unit: string) => {
    const v = Number(n.replace(",", "."));
    months += unit.startsWith("տ") ? Math.round(v * 12) : Math.round(v);
    found = true;
    return " ";
  });
  return found ? { months, rest } : null;
}

/** the largest number in the text: "3,000,000", "3 000 000", "3 միլիոն", "500 հազար" */
export function amountOf(text: string): number | null {
  const nums = [...text.matchAll(MONEY)].map((m) => moneyValueHy(m[1], m[2]));
  return nums.length ? Math.max(...nums) : null;
}

export interface HyAnswer {
  drafts: Draft[];
  /** the term just explained (a key of HY_TERMS), so that "օրինակ" can refer to it */
  topic: string | null;
  /** true when nothing written in advance fits: the screen may ask the AI layer (src/ui/api/assistant.ts) */
  ai?: boolean;
}

/**
 * One Armenian message that is not part of the savings-goal conversation. The savings-goal conversation itself (questions, plan card,
 * refinements) is run by script.ts together with interview-hy.ts, exactly like the English one.
 */
export function respondHy(raw: string, topic: string | null = null): HyAnswer {
  const text = raw.trim().toLowerCase();
  const say = (t: string, link?: { href: string; label: string }): HyAnswer => ({ drafts: [{ text: t, ...(link ? { link } : {}) }], topic: null });
  const investLink = { href: "/invest", label: HY.pages.invest };
  const marketLink = { href: "/market", label: HY.pages.market };

  if (RX.card.test(text)) return { drafts: [{ text: HY.cardWarning, tone: "notice" }], topic: null };
  if (RX.advice.test(text) && !durationOf(text)) return say(HY.advice, investLink);

  if (RX.dividend.test(text) && RX.tax.test(text)) return say(HY.dividendTax);
  if ((RX.interest.test(text) || RX.deposit.test(text)) && RX.tax.test(text)) return say(HY.interestTax);
  if (RX.deposit.test(text) && RX.guarantee.test(text)) return say(HY.depositGuarantee);
  if (RX.predict.test(text)) return say(HY.predict, marketLink);
  if (RX.sure.test(text) && RX.reach.test(text)) return say(HY.noGuarantee);
  if (RX.currency.test(text) && RX.now.test(text)) return say(HY.live, marketLink);

  // a term: the explanation, and the example too when the person asks for one ("օրինակ")
  const term = TERMS.find((t) => t.test.test(text));
  if (term) {
    const t = ALL[term.id];
    return { drafts: RX.example.test(text) ? [{ text: t.text }, { text: t.example }] : [{ text: t.text }], topic: term.id };
  }
  // "օրինակ" on its own: the example of the term (or the savings plan) we were just talking about
  if (RX.example.test(text) && topic === "plan") return { drafts: [{ text: HY.planExample }], topic };
  if (RX.example.test(text) && topic && ALL[topic]) return { drafts: [{ text: ALL[topic].example }], topic };

  if (RX.banks.test(text)) return say(HY.banks, marketLink);
  if (RX.greeting.test(text)) return say(HY.welcome);
  return { ...say(HY.notSure), ai: true };
}
