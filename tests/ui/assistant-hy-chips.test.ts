import { describe, expect, it } from "vitest";
import { HY } from "@/ui/assistant/hy";
import { STARTER_CHIPS, STARTER_CHIPS_HY, initialConversation, respond, starterChips } from "@/ui/assistant/script";

describe("the assistant on an Armenian screen", () => {
  it("a new chat is empty (the screen shows a prompt and the suggestions); the Armenian suggestions follow the screen; English stays the default", () => {
    expect(initialConversation("hy").messages).toEqual([]);
    expect(initialConversation().messages).toEqual([]);
    expect(starterChips("en")).toBe(STARTER_CHIPS);
    expect(STARTER_CHIPS_HY).toHaveLength(STARTER_CHIPS.length);
  });

  it("every Armenian suggestion gets a written Armenian answer (never the AI layer, never English)", () => {
    for (const chip of STARTER_CHIPS_HY) {
      const { state } = initialConversation("hy");
      const r = respond(state, chip.value);
      expect(r.ai, chip.label).toBeUndefined();
      const text = r.messages.map((m) => m.text).join(" ");
      expect(text, chip.label).toMatch(/[Ա-֏]/);
      expect(text, chip.label).not.toBe(HY.notSure);
    }
  });
});
