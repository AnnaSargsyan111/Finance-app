/**
 * The Armenian side of the savings-goal conversation. script.ts runs the same conversation (the same states, steps and maths) for
 * English and Armenian; this file holds what is language-specific: the questions, the quick answers (chips), how an Armenian message is
 * read (amounts, times, income, savings, rate) and the plan sentences.
 *
 * Every text here is PENDING Anna's review (written by the assistant). The plan sentence itself reuses her reviewed wording (HY.planCore).
 */
import { formatAmd } from "../lib/format";
import { LIMITS, type PlanProblem, type PlanResult } from "./goal-plan";
import { durationHy, HY } from "./hy";
import { amountOf, durationOf, moneyValueHy } from "./script-hy";
import type { BotMessage, Chip, ConvState } from "./types";
import type { Slots } from "./script";

type Draft = Omit<BotMessage, "id" | "role">;

export const GOAL_CHIPS_HY: Chip[] = [
  { label: "Ճանապարհորդություն", value: "ճանապարհորդություն" },
  { label: "Մեքենա", value: "մեքենա" },
  { label: "Բնակարանի կանխավճար", value: "բնակարանի կանխավճար" },
  { label: "Պահուստային ֆոնդ", value: "պահուստային ֆոնդ" },
  { label: "Այլ բան", value: "այլ բան" },
];
export const MONTH_CHIPS_HY: Chip[] = [
  { label: "6 ամիս", value: "6 ամիս" },
  { label: "1 տարի", value: "1 տարի" },
  { label: "2 տարի", value: "2 տարի" },
  { label: "5 տարի", value: "5 տարի" },
];
export const REFINE_CHIPS_HY: Chip[] = [
  { label: "Ավելացնել իմ եկամուտը", value: "action:income" },
  { label: "Արդեն մի մասը խնայել եմ", value: "action:saved" },
  { label: "Ավելացնել տոկոսադրույք", value: "action:rate" },
  { label: "Փոխել գումարը", value: "action:amount" },
  { label: "Փոխել ժամկետը", value: "action:months" },
  { label: "Սկսել նորից", value: "action:reset" },
];

/** the question for the state the conversation is in; null for a state that asks nothing */
export function askForHy(state: ConvState): Draft | null {
  switch (state.mode) {
    case "ask-goal":
      return { text: "Հիանալի է, պլանավորենք միասին։ Ինչի՞ համար եք խնայում։", chips: GOAL_CHIPS_HY };
    case "ask-amount": {
      const bigThing = /բնակարան|տուն|մեքենա|ավտո/.test(state.goalName ?? "");
      return {
        text: `Մոտավորապես որքա՞ն կարժենա ${state.goalName ? `«${state.goalName}»` : "այն"} (դրամով)։ Ընթացիկ գները չգիտեմ, ուստի նշեք ձեր սեփական գնահատականը, օրինակ՝ 3,000,000։${bigThing ? " Եթե վստահ չեք, մտածեք ամբողջ ծախսի մասին. բնակարանի դեպքում՝ կանխավճարը, վճարները և կահույքը, մեքենայի դեպքում՝ գինը, ապահովագրությունը և գրանցումը։" : ""}`,
      };
    }
    case "ask-months":
      return { text: "Մինչև ե՞րբ եք ցանկանում այն ունենալ։ Օրինակ՝ «2 տարի» կամ «18 ամիս»։", chips: MONTH_CHIPS_HY };
    case "ask-income":
      return { text: "Ի՞նչ է ձեր ամսական եկամուտը (դրամով)։ Այն օգտագործում եմ միայն այս զրույցում՝ ցույց տալու, թե պլանը դրա որ մասն է կազմում։ Ոչինչ չի պահպանվում։" };
    case "ask-saved":
      return { text: "Որքա՞ն եք արդեն խնայել այս նպատակի համար (դրամով)։ Եթե դեռ ոչինչ, գրեք 0։" };
    case "ask-rate":
      return { text: "Ի՞նչ տարեկան տոկոսադրույք եք սպասում (տոկոսով)։ Օրինակ՝ 8։ Սա ձեր սեփական ենթադրությունն է, և ես դրանից հանում եմ ավանդի տոկոսի 10% հարկը։" };
    default:
      return null;
  }
}

/** what to say when an answer cannot be read in the state the conversation is in */
export const rereadHy = (mode: ConvState["mode"]): string =>
  mode === "ask-months"
    ? "Ժամկետը չհասկացա։ Գրեք այսպես՝ «2 տարի» կամ «18 ամիս»։"
    : mode === "ask-rate"
      ? "Թիվը չհասկացա։ Գրեք տարեկան տոկոսադրույքը տոկոսով, օրինակ՝ 8։"
      : "Թիվը չհասկացա։ Գրեք գումար, օրինակ՝ 3,000,000։";

/** the answer to "what are you saving for?" as a short name; null for "something else" */
export function goalNameAnswerHy(text: string): string | null {
  const t = text.trim().replace(/[.!?։]+$/, "");
  if (/^(այլ բան|այլ|չգիտեմ|վստահ չեմ)$/i.test(t)) return null;
  return t.slice(0, 40).toLowerCase();
}

/** the first thing wrong with the numbers, in Armenian */
export function problemHy(p: PlanProblem): string {
  switch (p.field) {
    case "goal":
      return "Ստուգեք նպատակի գումարը․ այն պետք է 0-ից մեծ լինի և ոչ չափազանց մեծ։";
    case "months":
      return `Ժամկետը պետք է լինի առնվազն ${LIMITS.minMonths} ամիս և ոչ ավելի, քան ${LIMITS.maxMonths / 12} տարի։`;
    case "saved":
      return "Ստուգեք արդեն խնայած գումարը․ այն չի կարող բացասական լինել։";
    case "income":
      return "Ստուգեք եկամուտը․ այն պետք է 0-ից մեծ լինի։";
    default:
      return `Նշեք տարեկան տոկոսադրույք 0-ից մինչև ${LIMITS.maxRatePct}%։`;
  }
}

/** the plan as one message (the card with the figures is attached by script.ts) */
export function planTextHy(goalName: string | null, r: PlanResult): string {
  const what = goalName ? `«${goalName}» նպատակի համար՝ ` : "";
  if (r.alreadyReached) return `Դուք արդեն ունեք ամբողջ ${formatAmd(r.goal)}${goalName ? ` («${goalName}»)` : ""}, ուստի լրացուցիչ գումար առանձնացնել պետք չէ։`;
  let t = `${what}${HY.planCore(formatAmd(r.goal), durationHy(r.months), formatAmd(r.monthly))}`;
  if (r.rate) t += ` Սա հիմնված է ձեր ենթադրած տարեկան ${r.rate.grossPct}%-ի վրա (ավանդի տոկոսի 10% հարկից հետո՝ մոտ ${Math.round(r.rate.netPct * 10) / 10}%)։ Սա ձեր ենթադրությունն է, ոչ թե խոստում։`;
  if (r.realism === "unrealistic") t += " Սա ձեր եկամտի կեսից ավելին է, ինչը սովորաբար շատ դժվար է պահպանել, ուստի այս պլանը հավանաբար իրատեսական չէ։ Ավելի ուշ ժամկետը կամ ավելի փոքր նպատակը այն ավելի հեշտ կդարձնի։";
  else if (r.realism === "stretch") t += " Սա լարված է․ եթե շատ ծանր է թվում, ավելի ուշ ժամկետը այն կդյուրացնի։";
  return t;
}

/** "Want to make it more precise?" with what was assumed */
export function moreHy(state: ConvState): Draft {
  const assumed = [state.saved > 0 ? "" : "դեռ ոչինչ խնայված չէ", state.ratePct ? "" : "առանց տոկոսի"].filter(Boolean);
  const notes = [assumed.length ? `ենթադրել եմ՝ ${assumed.join(" և ")}` : "", state.income ? "" : "ձեր եկամուտը չգիտեմ"].filter(Boolean);
  const text = notes.length ? `${notes.join(", ")}։ Ցանկանո՞ւմ եք ավելի ճշգրտել։` : "Ցանկանո՞ւմ եք ինչ-որ բան փոխել։";
  return { text: text.charAt(0).toLocaleUpperCase("hy") + text.slice(1), chips: REFINE_CHIPS_HY };
}

export const monthlyBadHy = "Ստուգեք ամսական գումարը․ այն պետք է 0-ից մեծ լինի։";
export const monthlyTooLongHy = (monthly: number) => `Ամսական ${formatAmd(monthly)} առանձնացնելով՝ կպահանջվի ${LIMITS.maxMonths / 12} տարուց ավելի։ Ավելի մեծ ամսական գումարը կամ ավելի փոքր նպատակը կօգնի։`;
export const monthlyIntroHy = (monthly: number, months: number) => `Ամսական ${formatAmd(monthly)} առանձնացնելով՝ նպատակին կհասնեք մոտ ${durationHy(months)}։`;
export const bareMonthsIntroHy = (months: number) => `Ընդունեցի որպես ${durationHy(months)}։`;
export const resetHy = "Ոչինչ, սկսենք նորից։ Ի՞նչ կցանկանայիք անել։";

/* ------------------------------------------------------------------ reading an Armenian message */
const NUM = String.raw`(\d{1,3}(?:[ , ]\d{3})+|\d+(?:[.,]\d+)?)\s*(միլիոն|մլն|հազար|հզ)?`;
const MONEY_WORD = String.raw`(?:\s*(?:դրամ\S*|amd|դր\.?))?`;

/** pulls income, already-saved, monthly saving, rate, time and the goal amount out of one Armenian sentence (each at most once) */
export function extractSlotsHy(raw: string): Slots {
  const out: Slots = {};
  let t = ` ${raw.toLowerCase()} `;
  const take = (rx: RegExp, assign: (m: RegExpExecArray) => void) => {
    const m = rx.exec(t);
    if (!m) return;
    assign(m);
    t = t.replace(m[0], " ");
  };
  const value = (m: RegExpExecArray, i: number) => moneyValueHy(m[i], m[i + 1]);
  // income: "եկամուտս 400,000" or "400,000 եկամուտ ունեմ"
  take(new RegExp(String.raw`(?:եկամուտ\S*|աշխատավարձ\S*|վաստակ\S*)[^\d]{0,30}?${NUM}${MONEY_WORD}`, "i"), (m) => (out.income = value(m, 1)));
  if (out.income === undefined) take(new RegExp(String.raw`${NUM}${MONEY_WORD}\s*(?:ամսական\s*)?(?:եկամուտ|աշխատավարձ)`, "i"), (m) => (out.income = value(m, 1)));
  // already saved: "արդեն խնայել եմ 500,000"
  take(new RegExp(String.raw`(?:արդեն\s+(?:խնայել|խնայած|ունեմ|կուտակել|կուտակած)\S*|խնայած\S*|կուտակած\S*)[^\d]{0,30}?${NUM}${MONEY_WORD}`, "i"), (m) => (out.saved = value(m, 1)));
  // what can be put aside every month: "ամսական 100,000 դրամ կարող եմ խնայել"
  if (/(?:խնայ|առանձն|հավաք|կուտակ|կարող եմ)/.test(t)) take(new RegExp(String.raw`ամսական\s*${NUM}${MONEY_WORD}`, "i"), (m) => (out.monthly = value(m, 1)));
  take(/(\d+(?:[.,]\d+)?)\s*%/, (m) => (out.ratePct = Number(m[1].replace(",", "."))));
  const d = durationOf(t);
  if (d) {
    out.months = d.months;
    t = d.rest;
  }
  const amount = amountOf(t);
  if (amount !== null) out.amount = amount;
  return out;
}

const PLAN_WORDS = /(?:խնայողության\s+(?:նպատակ|պլան)|խնայել\s+(?:եմ\s+)?ուզում|ուզում\s+եմ\s+(?:խնայել|գնել|ունենալ|հավաքել|կուտակել)|պետք\s+է\s+խնայեմ|որքա՞ն\s+(?:պետք\s+է\s+)?խնայեմ|ամսական\s+որքա՞ն|ինչքա՞ն\s+(?:պետք\s+է\s+)?խնայեմ)/;

/** does this Armenian message start a savings-goal conversation? */
export function wantsPlanHy(text: string, slots: Slots): boolean {
  const t = text.toLowerCase();
  if (PLAN_WORDS.test(t)) return true;
  return slots.months !== undefined && slots.amount !== undefined && /(?:խնայ|կուտակ|գնել|հավաքել|ունենալ|ունենամ|պետք)/.test(t);
}

/** "սկսել նորից" and the like */
export const RESET_HY = /^\s*(?:սկսել\s+նորից|նոր\s+զրույց|չեղարկել|ոչինչ)\s*[.!։]?\s*$/i;
