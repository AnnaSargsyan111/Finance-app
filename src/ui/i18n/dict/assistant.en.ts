import type { Params } from "../translate";

/**
 * English texts of the "assistant" area (the source of truth): the SCREEN of the AI Assistant page. The chat answers themselves come
 * from the answer engine (src/ui/assistant/script*.ts, hy*.ts) and are not in this dictionary.
 */
export const assistant = {
  title: "AI Assistant",
  subtitle: "Ask about money, markets and how Finova works, or plan a savings goal. Information only: no personal investment advice.",
  prototype: "Prototype: answers are scripted for now, no AI is connected yet.",
  chatLabel: "Chat with Finova Assistant",
  name: "Finova Assistant",
  newChat: "New chat",
  conversation: "Conversation",
  messages: "Messages",
  /** read by screen readers before a bot message / a note / the user's own message (the space after it is added by the screen) */
  srBot: "Finova Assistant:",
  srBotNote: "Finova Assistant, note:",
  srYou: "You:",
  typing: "Finova Assistant is typing",
  tryOne: "Try one of these",
  quickReplies: "Quick replies",
  composerLabel: "Your message",
  placeholder: "Type your question",
  send: "Send message",
  charsLeft: "{n} characters left",
  footer: "The AI Assistant is an informational guide and does not give personal investment advice. Nothing you type here is saved: closing or leaving this page clears the conversation.",
  /** labels of an AI-layer answer written in English (the Armenian ones live with the answer engine, in HY.labels) */
  ai: {
    confirmed: "Confirmed by an official source",
    partial: "Not fully sure: please check the source",
    none: "No reliable source found",
    sources: "Sources",
    footnote: "AI-assisted answer from official pages. Not personal advice.",
    read: "read",
    newTab: "(opens in a new tab)",
  },
  /** the savings plan card */
  plan: {
    eyebrow: "Savings plan",
    eyebrowNamed: "Savings plan: {goal}",
    reachedTitle: "You already have the full amount",
    reachedLine: "Your savings of {saved} already cover the goal of {goal}.",
    unit: "AMD / month",
    toReach: "to reach {goal} in {duration}",
    alreadySaved: "Already saved: {saved}",
    shareLabel: "Share of your monthly income",
    shareLess: "Less than 1% of your income",
    shareAbout: (p: Params) => `About ${p.p}% of your income`,
    valueText: "{share}, {realism}",
    meterLine: "{share}: {realism}",
    realism: {
      comfortable: "comfortable",
      stretch: "a stretch",
      unrealistic: "probably not realistic",
    },
    assumes: "Assumes {gross} a year before tax (about {net} after the {tax} tax on deposit interest). Your assumption, not a promise.",
    withoutInterest: "Without interest you would need {amount} a month.",
    interestPart: "About {amount} of the goal would come from interest, after tax.",
    whatIfCaption: "If you set aside a share of your income",
    whatIfShare: "Share of income",
    whatIfTime: "Time to reach the goal",
    whatIfMonthly: "({amount} a month)",
    notReachable: "Not reachable",
    alreadyReached: "Already reached",
    foot: "Assumes no interest unless stated, steady income, no inflation. An estimate, not advice.",
    /** durations: "1 month", "7 months", "1 year", "2 years", "2 years 3 months" */
    month: (p: Params) => (Number(p.n) === 1 ? "1 month" : `${p.n} months`),
    year: (p: Params) => (Number(p.n) === 1 ? "1 year" : `${p.n} years`),
    yearsMonths: "{years} {months}",
    /** "18 months (1 year 6 months)" */
    monthsWithDuration: "{months} ({duration})",
  },
} as const;
