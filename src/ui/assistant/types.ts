import type { PlanResult } from "./goal-plan";

/** the contract between the conversation engine (script.ts) and the screen (AssistantPage.tsx) */

/** a quick reply: `label` is shown on the button and in the chat; `value` is what is sent to the engine when it is pressed */
export interface Chip {
  label: string;
  value: string;
}

export interface BotLink {
  href: string;
  label: string;
}

/** a savings plan to draw as a card inside a bot message */
export interface PlanCard {
  /** what the money is for ("a car"), or null */
  goalName: string | null;
  result: PlanResult;
}

/** how sure an answer from the AI layer is: "confirmed" = backed by a quote from an allowed official page; "partial" = found something but not fully sure; "none" = no reliable source found */
export type Confidence = "confirmed" | "partial" | "none";

/** an official page an AI answer is based on; `date` is the day the page was read (YYYY-MM-DD) */
export interface SourceRef {
  title: string;
  url: string;
  date: string;
}

export interface BotMessage {
  id: string;
  role: "bot";
  text: string;
  /** quick replies: shown only under the LAST message of the conversation */
  chips?: Chip[];
  /** an in-app page to open, shown as a button under the text */
  link?: BotLink;
  plan?: PlanCard;
  /** "notice": something to be careful about (for example: do not share a card number) */
  tone?: "normal" | "notice";
  /** set on answers that come from the AI layer (src/ui/api/assistant.ts) */
  confidence?: Confidence;
  sources?: SourceRef[];
  /** the language of an AI answer, so that the labels can be shown in the same language */
  lang?: "en" | "hy";
  /** where an AI answer comes from; a web answer has its own wording and shows Google's Search Suggestions */
  origin?: "official" | "web";
  suggestionsHtml?: string;
}

export interface UserMessage {
  id: string;
  role: "user";
  text: string;
}

export type ChatMessage = BotMessage | UserMessage;

/** opaque to the screen: keep it, pass it back to `respond` */
export interface ConvState {
  readonly n: number;
  readonly mode: "free" | "ask-goal" | "ask-amount" | "ask-months" | "ask-income" | "ask-saved" | "ask-rate";
  /** the language of the conversation: the savings-goal questions and plan texts follow it (set from the language of each message) */
  readonly lang: "en" | "hy";
  readonly goalName: string | null;
  readonly amount: number | null;
  readonly months: number | null;
  readonly saved: number;
  readonly income: number | null;
  readonly ratePct: number | null;
  /** what the last answer was about ("pe", "inflation", "plan"...), so that "can you give an example?" has something to refer to */
  readonly topic: string | null;
}
