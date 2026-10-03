import { describe, expect, it } from "vitest";
import { RULE_GROUPS } from "@/ui/auth/login-rules-data";

const all = RULE_GROUPS.flatMap((g) => g.rules);
const rule = (id: string) => all.find((r) => r.id === id)!;

describe("login page left side: money rules of thumb", () => {
  it("has the two requested groups with three rules each, in a fixed order", () => {
    expect(RULE_GROUPS.map((g) => g.id)).toEqual(["save", "stocks"]);
    expect(RULE_GROUPS.map((g) => g.lead)).toEqual(["If I save, ", "If I buy stocks, "]);
    for (const g of RULE_GROUPS) expect(g.rules).toHaveLength(3);
    expect(new Set(all.map((r) => r.id)).size).toBe(all.length);
  });

  it("every rule is a first-person action with a real explanation and an https source link", () => {
    for (const r of all) {
      expect(r.title, r.id).toMatch(/^I /);
      expect(r.title.endsWith("."), r.id).toBe(true);
      expect(r.body.length, r.id).toBeGreaterThan(40);
      expect(r.body.length, r.id).toBeLessThan(140); // keeps the left side on one screen
      expect(r.source.name.length, r.id).toBeGreaterThan(2);
      expect(r.source.url, r.id).toMatch(/^https:\/\//);
    }
  });

  it("quotes the figures exactly as the sources state them", () => {
    expect(rule("pay-first").body).toContain("50% needs, 30% wants, 20% savings");
    expect(50 + 30 + 20).toBe(100);
    expect(rule("automate").body).toMatch(/3\.5% to 13\.6%/);
    expect(rule("automate").body).toMatch(/40 months/);
    expect(rule("no-timing").body).toContain("$151,343");
    expect(rule("no-timing").body).toContain("$47,357");
  });

  it("does not repeat the unsourced '3-6 months' emergency-fund figure (the CFPB gives no fixed amount)", () => {
    expect(JSON.stringify(RULE_GROUPS)).not.toMatch(/3\s*(-|–|to)\s*6\s*months/i);
    expect(rule("safety-net").source.url).toContain("consumerfinance.gov");
  });
});
