import { describe, expect, it } from "vitest";
import { REQUEST_FIELDS, toRecommendationBody } from "@/ui/api/invest";
import { MOCK } from "@/ui/api/mock-registry";
import { amountProblem, EMERGENCY_LABEL, progressPercent } from "@/ui/invest/labels";
import { safeNext } from "@/ui/api/client";

describe("investment request (AC-F6)", () => {
  it("contains only amountAmd, risk, horizon, mode, notNeededForEmergencies", () => {
    // even if a caller passes extra properties by mistake, they never reach the wire
    const dirty = { amountAmd: 500000, risk: "low", horizon: "long", mode: "single", income: 900000, expenses: [1], period: "2026-09" } as never;
    const body = toRecommendationBody(dirty);
    expect(Object.keys(body).sort()).toEqual([...REQUEST_FIELDS].sort());
    expect(body.notNeededForEmergencies).toBe(true);
  });

  it("uses the exact emergency checkbox wording", () => {
    expect(EMERGENCY_LABEL).toBe("This money isn't needed for emergencies.");
  });

  it("validates the amount (1,000 - 1,000,000,000 whole AMD)", () => {
    expect(amountProblem("")).not.toBeNull();
    expect(amountProblem("999")).toMatch(/at least 1,000/);
    expect(amountProblem("1000")).toBeNull();
    expect(amountProblem("1000000000")).toBeNull();
    expect(amountProblem("1000000001")).toMatch(/at most/);
    expect(amountProblem("12.5")).not.toBeNull();
  });

  it("progress bar fills a quarter per completed requirement", () => {
    expect(progressPercent({ amount: "", risk: null, horizon: null, confirmed: false })).toBe(0);
    expect(progressPercent({ amount: "500000", risk: null, horizon: null, confirmed: false })).toBe(25);
    expect(progressPercent({ amount: "500000", risk: "low", horizon: null, confirmed: false })).toBe(50);
    expect(progressPercent({ amount: "500000", risk: "low", horizon: "long", confirmed: false })).toBe(75);
    expect(progressPercent({ amount: "500000", risk: "low", horizon: "long", confirmed: true })).toBe(100);
  });
});

describe("mock registry", () => {
  it("has one boolean per endpoint and is fully LIVE (backend delivered everything, including profile edit)", () => {
    const entries = Object.entries(MOCK);
    expect(entries.length).toBeGreaterThanOrEqual(27);
    for (const [, v] of entries) expect(typeof v).toBe("boolean");
    expect(entries.filter(([, v]) => v).map(([k]) => k)).toEqual([]);
  });
});

describe("post-login redirect target", () => {
  it("only accepts same-app relative paths", () => {
    expect(safeNext("/market?tab=news")).toBe("/market?tab=news");
    expect(safeNext("//evil.test")).toBeNull();
    expect(safeNext("https://evil.test")).toBeNull();
    expect(safeNext("/\\evil")).toBeNull();
    expect(safeNext("/auth?mode=login")).toBeNull();
    expect(safeNext(null)).toBeNull();
  });
});
