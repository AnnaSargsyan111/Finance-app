import { describe, expect, it } from "vitest";
import { mayBeOfficial } from "@/assistant/ask";
import type { CorpusDoc } from "@/assistant/corpus";

const doc = (text: string): CorpusDoc => ({ id: "d", title: "t", url: "https://adgf.am/en/faq", text, date: "2026-10-23" });
const docs = [doc("Whose deposits are guaranteed? The maximum amount of guarantee for dram deposits is AMD 16 mln. Income tax rates range from 5% for dividends to 20% for salaries."), doc("Ավանդների երաշխավորված գումարը դրամային ավանդների համար 16 մլն դրամ է։")];

describe("does a question touch the official pages at all?", () => {
  it("a question about their topics goes to the official pages", () => {
    expect(mayBeOfficial("How much of my deposit is guaranteed in Armenia?", docs)).toBe(true);
    expect(mayBeOfficial("What is the income tax on dividends?", docs)).toBe(true);
    expect(mayBeOfficial("Deposits", docs)).toBe(true);
  });

  it("an Armenian word matches whatever its ending", () => {
    expect(mayBeOfficial("Ինչքա՞ն է երաշխավորվում իմ ավանդը", docs)).toBe(true);
  });

  it("a general question skips them (the model call could only say 'not found')", () => {
    expect(mayBeOfficial("What is an ETF?", docs)).toBe(false);
    expect(mayBeOfficial("Explain how compound interest works", docs)).toBe(false);
    expect(mayBeOfficial("Ի՞նչ է ինֆլյացիան", docs)).toBe(false);
    expect(mayBeOfficial("???", docs)).toBe(false);
  });
});
