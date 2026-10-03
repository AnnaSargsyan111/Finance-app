import { describe, expect, it } from "vitest";
import { PLAY_AT_RATIO, nextCountAction, type VisibilityEntry } from "@/ui/auth/count-up";

/** runs a sequence of visibility changes through the rule, the way the component does, and returns what happened */
function run(entries: VisibilityEntry[], armed = true) {
  const actions: string[] = [];
  for (const e of entries) {
    const next = nextCountAction(armed, e);
    armed = next.armed;
    actions.push(next.action);
  }
  return { actions, armed };
}

const visible = (ratio: number): VisibilityEntry => ({ intersectionRatio: ratio, isIntersecting: ratio > 0 });
const OFF = visible(0);

describe("count-up numbers on the sign-up page replay every time they scroll into view", () => {
  it("plays when the figure becomes mostly visible, and not before", () => {
    expect(run([visible(0.3)]).actions).toEqual(["none"]); // only peeking in
    expect(run([visible(PLAY_AT_RATIO)]).actions).toEqual(["play"]);
    expect(run([visible(1)]).actions).toEqual(["play"]); // tall screen: fully visible at load
  });

  it("rewinds when it has left the screen completely, and plays again on the way back (scrolling down, then up)", () => {
    const seq = [OFF, visible(0.7), OFF, visible(0.9), OFF, visible(0.65)];
    expect(run(seq).actions).toEqual(["reset", "play", "reset", "play", "reset", "play"]);
  });

  it("plays again on a return from below as well as from above (the rule does not care about direction)", () => {
    // scroll down past it (plays then leaves), then back up into it from below
    const seq = [visible(0.8), visible(0.2), OFF, visible(0.2), visible(0.7)];
    expect(run(seq).actions).toEqual(["play", "none", "reset", "none", "play"]);
  });

  it("does not restart while it stays on screen, however much the user wobbles around the 60% line", () => {
    const seq = [visible(0.8), visible(0.5), visible(0.7), visible(0.55), visible(0.65), visible(1)];
    expect(run(seq).actions).toEqual(["play", "none", "none", "none", "none", "none"]);
  });

  it("a partial peek that never reaches 60% before leaving only rewinds, it does not play", () => {
    expect(run([visible(0.2), visible(0.4), OFF]).actions).toEqual(["none", "none", "reset"]);
  });

  it("is armed again after every full exit, and not armed while it is playing", () => {
    expect(run([visible(0.9)]).armed).toBe(false);
    expect(run([visible(0.9), OFF]).armed).toBe(true);
  });
});
