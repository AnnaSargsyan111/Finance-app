/**
 * Content for the "psychology of spending" section under the sign-up form (below the market numbers). Fixed, sourced text,
 * nothing fetched. Each card says what the idea is, gives one concrete example or caveat, and links its sources.
 *
 * Wording is kept to what the linked sources support. The Latte Factor is a debated idea, so its card shows the criticism.
 * The Celtics experiment is quoted as "more than twice as much" (the wording MIT uses), not as dollar averages.
 */
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
    tag: "Behavioural economics · 1998",
    title: "The pain of paying",
    body: "Paying hurts, and how much depends on how you pay. Handing over cash makes the cost feel real, while a card or a tap delays and softens that feeling. Drazen Prelec and George Loewenstein described this tug-of-war between the pleasure of buying and the pain of paying in 1998.",
    example: {
      label: "In an experiment",
      text: "People bidding for Boston Celtics tickets bid more than twice as much when they could pay by credit card as when they had to pay in cash.",
    },
    sources: [
      { name: "MIT Better World", url: "https://betterworld.mit.edu/spectrum/issues/winter-1999/the-psychology-of-spending" },
      { name: "Marketing Science", url: "https://ideas.repec.org/a/inm/ormksc/v17y1998i1p4-28.html" },
    ],
  },
  {
    id: "diderot-effect",
    tag: "Paris · 1769",
    title: "The Diderot Effect",
    body: "One new purchase makes everything you already own feel out of date, so you keep upgrading to match it. The philosopher Denis Diderot received a scarlet dressing gown, then replaced his chair, desk and prints to live up to it, and ended up in debt. The anthropologist Grant McCracken named the effect in 1986.",
    example: {
      label: "In his words",
      text: "“I was absolute master of my old dressing gown, but I have become a slave to my new one.”",
    },
    sources: [{ name: "Wikipedia", url: "https://en.wikipedia.org/wiki/Diderot_effect" }],
  },
  {
    id: "latte-factor",
    tag: "1995 · A debated idea",
    title: "The Latte Factor",
    body: "Financial author David Bach coined it in 1995: small daily purchases, like a $5 coffee, add up, and if invested instead they could grow into a fortune. It became hugely popular after his 1999 book Smart Women Finish Rich.",
    example: {
      label: "The criticism",
      text: "His projection of over $2 million assumed an 11% yearly return, above the historical Dow Jones average of about 9.7%. Critics add that big shocks like job loss, divorce or medical bills hurt savings far more than small treats do.",
    },
    sources: [{ name: "The Hustle", url: "https://thehustle.co/just-stop-buying-lattes-the-origins-of-a-millennial-housing-myth" }],
  },
  {
    id: "mental-accounting",
    tag: "Nobel Prize · 2017",
    title: "Mental accounting",
    body: "We sort money into separate mental accounts, such as bills, holidays or fun money, and judge each choice by its effect on that account rather than on our total wealth. Richard Thaler's work on it was part of his 2017 Nobel Prize in Economics.",
    example: {
      label: "In practice",
      text: "Many households keep one pot for bills and another for holidays, with rules against using one to pay for the other, even though it is all the same money.",
    },
    sources: [{ name: "Nobel Prize", url: "https://www.nobelprize.org/prizes/economic-sciences/2017/popular-information/" }],
  },
];
