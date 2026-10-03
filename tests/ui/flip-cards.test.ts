import { describe, expect, it } from "vitest";
import { FLIP_AT_RATIO, FLIP_STAGGER_S, decideCard, flipDelays, type CardView, type ScrollDirection } from "@/ui/auth/flip-cards";

const VH = 800;
const view = (ratio: number, top = 400): CardView => ({ intersectionRatio: ratio, isIntersecting: ratio > 0, top, viewportHeight: VH });
const BELOW = view(0, VH + 50); // fully below the bottom edge of the screen
const ABOVE = view(0, -600); // fully above the top edge of the screen

/** feeds a sequence of [view, direction] steps through the rule, tracking the card's state the way the component does */
function run(steps: [CardView, ScrollDirection][], flipped = false) {
  const actions: string[] = [];
  for (const [v, d] of steps) {
    const a = decideCard(flipped, v, d);
    actions.push(a);
    if (a === "flip" || a === "show") flipped = true;
    if (a === "reset") flipped = false;
  }
  return { actions, flipped };
}

describe("spending cards flip only when scrolling DOWN into them", () => {
  it("flips once the card is 30% visible while scrolling down, and not before", () => {
    expect(run([[view(0.1, 700), "down"]]).actions).toEqual(["none"]); // just peeking in
    expect(run([[view(FLIP_AT_RATIO), "down"]]).actions).toEqual(["flip"]);
    expect(run([[view(1), "down"]]).actions).toEqual(["flip"]);
  });

  it("never flips on the way up: a card appearing from the top edge is simply shown face-up", () => {
    expect(run([[view(0.05, -150), "up"]]).actions).toEqual(["show"]);
    expect(run([[view(0.6, -50), "up"], [view(1), "up"]]).actions).toEqual(["show", "none"]);
  });

  it("does nothing to a card that is already face-up while it stays on screen", () => {
    expect(run([[view(0.8), "down"], [view(0.4), "down"], [view(0.9), "up"], [view(1), "down"]]).actions).toEqual(["flip", "none", "none", "none"]);
  });

  it("scrolling down past it keeps it revealed, so scrolling back UP into it shows it face-up with no flip", () => {
    const steps: [CardView, ScrollDirection][] = [[view(0.9), "down"], [ABOVE, "down"], [view(0.3, -200), "up"]];
    const r = run(steps);
    expect(r.actions).toEqual(["flip", "none", "none"]); // left above: kept; back in view: already face-up
    expect(r.flipped).toBe(true);
  });

  it("scrolling back UP past it (it ends up below the screen) rewinds it, so it flips again the next time you scroll down", () => {
    const steps: [CardView, ScrollDirection][] = [[view(0.9), "down"], [view(0.4, 600), "up"], [BELOW, "up"], [view(0.5, 500), "down"]];
    expect(run(steps).actions).toEqual(["flip", "none", "reset", "flip"]);
  });

  it("a face-down card that is off screen stays as it is (no reset needed)", () => {
    expect(run([[BELOW, "up"], [ABOVE, "down"]]).actions).toEqual(["none", "none"]);
  });

  it("repeats every time: down, back up past it, down again", () => {
    const steps: [CardView, ScrollDirection][] = [
      [view(0.7), "down"], [BELOW, "up"], [view(0.7), "down"], [BELOW, "up"], [view(0.7), "down"],
    ];
    expect(run(steps).actions).toEqual(["flip", "reset", "flip", "reset", "flip"]);
  });
});

describe("cards that arrive together flip one after another", () => {
  it("staggers a batch by 0.35s per card, in order", () => {
    expect(FLIP_STAGGER_S).toBe(0.35);
    expect(flipDelays(4)).toEqual([0, 0.35, 0.7, 1.05]);
    expect(flipDelays(1)).toEqual([0]);
    expect(flipDelays(0)).toEqual([]);
  });
});
