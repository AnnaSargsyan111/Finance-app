/** share of a figure that must be on screen before it counts up */
export const PLAY_AT_RATIO = 0.6;

export interface VisibilityEntry {
  intersectionRatio: number;
  isIntersecting: boolean;
}

/**
 * What a counting figure should do when its visibility changes, given whether it is "armed" (it has been completely off
 * screen since it last played). Entering (>= 60% visible) while armed plays it; leaving completely resets it and re-arms
 * it, so it plays again every time it comes back into view, scrolling down or up. Anything in between (for example
 * wobbling around the 60% line while still on screen) changes nothing, so it never restarts mid-view.
 */
export function nextCountAction(armed: boolean, entry: VisibilityEntry): { action: "play" | "reset" | "none"; armed: boolean } {
  if (entry.intersectionRatio >= PLAY_AT_RATIO) return armed ? { action: "play", armed: false } : { action: "none", armed };
  if (!entry.isIntersecting) return { action: "reset", armed: true };
  return { action: "none", armed };
}
