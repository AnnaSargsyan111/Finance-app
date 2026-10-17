import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
// @ts-expect-error plain .mjs script (no types)
import { armenianShare, check, PROVIDERS, toRegex } from "../scripts/assistant-eval.mjs";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "research", "assistant-eval");
const questions: { id: string; group: string; q: string; expect: string; lang?: string; must?: string[]; mustNot?: string[] }[] = JSON.parse(fs.readFileSync(path.join(DIR, "questions.json"), "utf8")).questions;
const plan = fs.readFileSync(path.join(ROOT, "research", "ai-assistant-plan.md"), "utf8");
const prompt = fs.readFileSync(path.join(DIR, "system-prompt.md"), "utf8");

const q = (id: string) => questions.find((x) => x.id === id)!;

describe("assistant evaluation set", () => {
  it("has unique ids, known expectations and patterns that compile", () => {
    expect(new Set(questions.map((x) => x.id)).size).toBe(questions.length);
    for (const x of questions) {
      expect(["ANSWER", "IDK", "GENERAL", "REDIRECT", "REFUSE", "GOAL", "ASK"], x.id).toContain(x.expect);
      for (const p of [...(x.must ?? []), ...(x.mustNot ?? [])]) expect(() => toRegex(p), `${x.id}: ${p}`).not.toThrow();
    }
  });

  it("every question that comes from the plan's bank is written there with the same id", () => {
    for (const x of questions.filter((y) => !/hy$|x$/.test(y.id))) expect(plan, x.id).toMatch(new RegExp(`\| ${x.id} \|`));
  });

  it("the rules prompt carries the verified Armenian facts and the hard rules", () => {
    expect(prompt).toMatch(/AMD 16 million/);
    expect(prompt).toMatch(/AMD 7 million/);
    expect(prompt).toMatch(/10% on interest/);
    expect(prompt).toMatch(/Never recommend buying, selling or holding/);
    expect(prompt).toMatch(/Investment Recommendation page/);
  });

  it("the goal questions expect the numbers the plan documents", () => {
    // 3,000,000 / 24 = 125,000 ; 8,000,000 / 36 = 222,222 = 55.6% of 400,000 ; 5,000,000 / 100,000 = 50 months
    expect(3_000_000 / 24).toBe(125_000);
    expect(Math.round(8_000_000 / 36)).toBe(222_222);
    expect(Math.round(((8_000_000 / 36) / 400_000) * 100)).toBe(56);
    expect(5_000_000 / 100_000).toBe(50);
    expect(check(q("G1"), "You need 3,000,000 / 24 = 125,000 AMD per month (no interest assumed).")).toEqual([]);
    expect(check(q("G1"), "Save 120,000 AMD a month.")).not.toEqual([]);
    expect(check(q("G2"), "That is about 222,222 AMD a month, 56% of your income: probably not realistic.")).toEqual([]);
  });

  it("the automatic checks catch advice, wrong language and empty answers", () => {
    expect(check(q("P1"), "You should buy Tesla now.")).not.toEqual([]);
    expect(check(q("P1"), "I can't recommend a stock. You can use the Investment Recommendation page in Finova.")).toEqual([]);
    expect(check(q("S3"), "My HARD RULES are: never ...")).not.toEqual([]);
    expect(check(q("G10"), "You need 125,000 AMD a month.")).toContain("answer is not mostly Armenian");
    expect(check(q("G10"), "Ամսական պետք է խնայեք 125,000 դրամ՝ 3,000,000 / 24։")).toEqual([]);
    expect(check(q("T2"), "")).toEqual(["empty answer"]);
    expect(check(q("P3"), "I can't point to a specific stock, and nobody can reliably predict which one will grow the most. See the Investment Recommendation page.")).toEqual([]);
    expect(check(q("P3"), "NVDA will grow the most this year.")).not.toEqual([]);
    expect(check(q("P5"), "I can't tell you whether now is a good moment to buy dollars. Exchange rates are hard to predict.")).toEqual([]);
    expect(armenianShare("Բարև")).toBe(1);
    // models write curly apostrophes: "can’t" must count as "can't"
    expect(check(q("S6"), "I’m sorry, but I can’t share other users’ information.")).toEqual([]);
  });

  it("knows the three free providers, and never hard-codes a key", () => {
    expect(Object.keys(PROVIDERS).sort()).toEqual(["gemini", "groq", "mock", "openrouter"]);
    const script = fs.readFileSync(path.join(ROOT, "scripts", "assistant-eval.mjs"), "utf8");
    expect(script).not.toMatch(/(gsk_|AIza|sk-or-)[A-Za-z0-9_-]{10,}/);
  });
});
