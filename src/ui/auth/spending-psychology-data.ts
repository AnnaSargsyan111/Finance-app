/**
 * Content for the "psychology of spending" section under the sign-up form (below the market numbers). Fixed, sourced text,
 * nothing fetched. Each card says what the idea is, gives one concrete example or caveat, and links its sources.
 *
 * Wording is kept to what the linked sources support. The Latte Factor is a debated idea, so its card shows the criticism.
 * The Celtics experiment is quoted as "more than twice as much" (the wording MIT uses), not as dollar averages.
 * The texts live in the dictionary (auth.spending) and are read through getters, so they follow the chosen language; ids and
 * sources (names and links) stay here.
 */
import { tg } from "../i18n/translate";
import type { Source } from "./market-facts-data";

export interface SpendingIdea {
  id: string;
  tag: string;
  title: string;
  /** what the idea is, in a few sentences */
  body: string;
  example: { label: string; text: string };
  sources: Source[];
}

export const SPENDING_IDEAS: SpendingIdea[] = [
  {
    id: "pain-of-paying",
    get tag() {
      return tg("auth.spending.painOfPaying.tag");
    },
    get title() {
      return tg("auth.spending.painOfPaying.title");
    },
    get body() {
      return tg("auth.spending.painOfPaying.body");
    },
    example: {
      get label() {
        return tg("auth.spending.painOfPaying.exampleLabel");
      },
      get text() {
        return tg("auth.spending.painOfPaying.exampleText");
      },
    },
    sources: [
      { name: "MIT Better World", url: "https://betterworld.mit.edu/spectrum/issues/winter-1999/the-psychology-of-spending" },
      { name: "Marketing Science", url: "https://ideas.repec.org/a/inm/ormksc/v17y1998i1p4-28.html" },
    ],
  },
  {
    id: "diderot-effect",
    get tag() {
      return tg("auth.spending.diderotEffect.tag");
    },
    get title() {
      return tg("auth.spending.diderotEffect.title");
    },
    get body() {
      return tg("auth.spending.diderotEffect.body");
    },
    example: {
      get label() {
        return tg("auth.spending.diderotEffect.exampleLabel");
      },
      get text() {
        return tg("auth.spending.diderotEffect.exampleText");
      },
    },
    sources: [
      { name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Diderot_effect" },
    ],
  },
  {
    id: "latte-factor",
    get tag() {
      return tg("auth.spending.latteFactor.tag");
    },
    get title() {
      return tg("auth.spending.latteFactor.title");
    },
    get body() {
      return tg("auth.spending.latteFactor.body");
    },
    example: {
      get label() {
        return tg("auth.spending.latteFactor.exampleLabel");
      },
      get text() {
        return tg("auth.spending.latteFactor.exampleText");
      },
    },
    sources: [
      { name: "The Hustle", url: "https://thehustle.co/just-stop-buying-lattes-the-origins-of-a-millennial-housing-myth" },
    ],
  },
  {
    id: "mental-accounting",
    get tag() {
      return tg("auth.spending.mentalAccounting.tag");
    },
    get title() {
      return tg("auth.spending.mentalAccounting.title");
    },
    get body() {
      return tg("auth.spending.mentalAccounting.body");
    },
    example: {
      get label() {
        return tg("auth.spending.mentalAccounting.exampleLabel");
      },
      get text() {
        return tg("auth.spending.mentalAccounting.exampleText");
      },
    },
    sources: [
      { name: "Nobel Prize", url: "https://www.nobelprize.org/prizes/economic-sciences/2017/popular-information/" },
    ],
  },
];
