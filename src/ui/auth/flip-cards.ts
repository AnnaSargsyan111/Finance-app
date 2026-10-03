/**
 * Rules for the "psychology of spending" cards on the sign-up page: they start face-down (their back showing) and flip over
 * one after another to reveal their text, but ONLY when the visitor scrolls DOWN into them.
 *
 *  - scrolling down into a card (>= 30% visible) while it is face-down: it flips, with a short stagger between cards that
 *    arrive together;
 *  - scrolling UP into a card (it appears from the top edge): it is simply shown face-up, never flipped;
 *  - a card that has left the screen completely BELOW the viewport (the visitor scrolled back up past it) turns face-down
 *    again, ready for next time;
 *  - a card that has left the screen ABOVE the viewport (the visitor scrolled down past it) stays face-up, so scrolling back
 *    up into it shows it already revealed.
 */

export type ScrollDirection = "up" | "down";

/** share of a card that must be on screen before it flips (scrolling down) */
export const FLIP_AT_RATIO = 0.3;
/**
 * How far above the top of the screen (px) a card is already treated as "in view". The browser only reports a card once it
 * has appeared, so without this a card scrolled UP into would be seen face-down for a frame or two before turning face-up.
 * Only the top edge is extended, so scrolling DOWN still flips cards when they actually reach the screen.
 */
export const SHOW_AHEAD_PX = 320;
/** seconds between cards that flip in the same batch (a row arriving together) */
export const FLIP_STAGGER_S = 0.35;

export interface CardView {
  intersectionRatio: number;
  isIntersecting: boolean;
  /** top edge of the card relative to the viewport (positive = below the top of the screen) */
  top: number;
  viewportHeight: number;
}

export type CardAction = "flip" | "show" | "reset" | "none";

/** what one card should do when its visibility changes; `flipped` = it is currently face-up */
export function decideCard(flipped: boolean, view: CardView, direction: ScrollDirection): CardAction {
  if (view.isIntersecting) {
    if (flipped) return "none";
    if (direction === "up") return "show"; // never flip on the way up
    return view.intersectionRatio >= FLIP_AT_RATIO ? "flip" : "none";
  }
  // completely off screen: below the viewport means the visitor is above it -> rewind; above the viewport -> keep it revealed
  if (flipped && view.top >= view.viewportHeight) return "reset";
  return "none";
}

/** transition delays (seconds) for the cards flipping in one batch, in order: 0, 0.35, 0.7, ... */
export function flipDelays(count: number): number[] {
  return Array.from({ length: count }, (_, i) => Math.round(i * FLIP_STAGGER_S * 100) / 100);
}
