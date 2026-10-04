import type { ComparisonResult, ComparisonWindow, Enveloped, RecMode, RecommendationResult } from "../api/types";
import type { Preferences } from "./StepFlow";

/**
 * The latest recommendation on screen, kept in the memory of this browser tab only, so that "Back to my recommendation" on the history page
 * can reopen it exactly as it was left: same preferences, same Single stock / Portfolio tab, the same numbers (not recalculated), the same
 * timeframe on the benchmark chart and the same scroll position.
 *
 * It is a plain module variable: nothing goes to localStorage, sessionStorage, cookies or the URL (the investment flow is guarded against
 * all of those), so it is gone after a page reload or when the tab is closed. It is tied to the signed-in user, so another user on the same
 * tab never sees it. Starting over or adjusting preferences discards it.
 */
export interface RecSession {
  userId: string;
  prefs: Preferences;
  tab: RecMode;
  single: Enveloped<RecommendationResult> | null;
  portfolio: Enveloped<RecommendationResult> | null;
  /** the "Add to history" button was used for that result */
  saved: { single: boolean; portfolio: boolean };
  benchWindow: ComparisonWindow | null;
  /** benchmark comparisons already fetched, per timeframe, so they are not requested again */
  benchCache: Map<ComparisonWindow, ComparisonResult>;
  scrollY: number;
}

let current: RecSession | null = null;
let resumeRequested = false;

export function startRecSession(userId: string, prefs: Preferences): void {
  current = { userId, prefs, tab: "single", single: null, portfolio: null, saved: { single: false, portfolio: false }, benchWindow: null, benchCache: new Map(), scrollY: 0 };
  resumeRequested = false;
}

export function updateRecSession(patch: Partial<Omit<RecSession, "userId" | "prefs">>): void {
  if (current) current = { ...current, ...patch };
}

/** the "Add to history" button was used for the single-stock or the portfolio result */
export function markSaved(mode: RecMode): void {
  if (current) current = { ...current, saved: { ...current.saved, [mode]: true } };
}

export function clearRecSession(): void {
  current = null;
  resumeRequested = false;
}

/** whether there is a recommendation of this user to go back to */
export function hasRecSession(userId: string): boolean {
  return current !== null && current.userId === userId && (current.single !== null || current.portfolio !== null);
}

/** called when the visitor leaves for the history page: remembers how far down the page they were */
export function rememberScroll(): void {
  if (current && typeof window !== "undefined") current.scrollY = window.scrollY;
}

/** "Back to my recommendation" was pressed: the next visit to the Investment page restores the session (any other visit starts fresh) */
export function requestResume(userId: string): void {
  resumeRequested = hasRecSession(userId);
}

/** the session to restore on this visit, if it was asked for; reading it does not use it up (the flag is cleared once the page has mounted) */
export function peekResume(userId: string): RecSession | null {
  return resumeRequested && current !== null && current.userId === userId ? current : null;
}

export function clearResumeRequest(): void {
  resumeRequested = false;
}
