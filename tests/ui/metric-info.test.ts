import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { LABELS } from "@/invest/explain";
import { DRIVER_LABELS, INFO_KEYS, driverInfoKey, driverNumber, metricInfo, type InfoCtx } from "@/ui/invest/metric-info";

/** every number any explanation might use, so a missing value cannot hide a broken sentence */
const FULL: InfoCtx = {
  name: "Simon Property Group",
  value: 0.5,
  top: 7,
  price: 204.82,
  shares: 10,
  cost: 2048.2,
  allocatedAmd: 742_574,
  leftUsd: 158.39,
  leftAmd: 57_426,
  inputAmd: 800_000,
  unallocatedAmd: 57_426,
  score: 78,
  percent: 18.5,
  amountAmd: 100_000,
  count: 9,
  band: 0.2,
  p: 0.5,
  b: 0.4,
  window: "the last year",
  bench: "S&P 500 ETF",
  bText: "500 (index members)",
  text: "Return on equity 103.0% · P/E 14.45",
};

describe("metric explanations on the recommendation result", () => {
  it("every measure the recommendation engine can show in 'Why this match' has an explanation", () => {
    const engineLabels = Object.values(LABELS).map((l) => l.label);
    for (const label of engineLabels) {
      const key = driverInfoKey(label);
      expect(key, `no explanation key for "${label}"`).not.toBeNull();
      expect(metricInfo(key, FULL), label).not.toBeNull();
    }
    // and nothing in our list is for a label the engine no longer uses
    for (const label of DRIVER_LABELS) expect(engineLabels, label).toContain(label);
  });

  it("every benchmark metric and diversification row on screen has an explanation", () => {
    const src = fs.readFileSync("src/ui/invest/BenchmarkSection.tsx", "utf8");
    const metricKeys = [...src.matchAll(/\{ key: "(\w+)", label: "[^"]+", fmt:/g)].map((m) => m[1]);
    expect(metricKeys.length).toBeGreaterThanOrEqual(13);
    for (const k of metricKeys) expect(metricInfo(`bm.${k}`, FULL), `bm.${k}`).not.toBeNull();
    const divKeys = [...src.matchAll(/key: "(div\.\w+)"/g)].map((m) => m[1]);
    expect(divKeys.length).toBe(8);
    for (const k of divKeys) expect(metricInfo(k, FULL), k).not.toBeNull();
  });

  it("every explanation has all three parts, and the example uses real numbers (no NaN / undefined / null / empty)", () => {
    for (const key of INFO_KEYS) {
      const info = metricInfo(key, FULL)!;
      expect(info.title.length, key).toBeGreaterThan(2);
      expect(info.what.length, key).toBeGreaterThan(20);
      expect(info.read.length, key).toBeGreaterThan(20);
      expect(info.example, `${key} example`).not.toBeNull();
      for (const text of [info.what, info.read, info.example!]) expect(text, key).not.toMatch(/NaN|undefined|null|\[object/);
    }
  });

  it("an example is left out when the numbers it needs are missing, instead of printing nonsense", () => {
    for (const key of INFO_KEYS) {
      const info = metricInfo(key, {})!;
      if (info.example !== null) expect(info.example, key).not.toMatch(/NaN|undefined|null/);
    }
    expect(metricInfo("roe", {})!.example).toBeNull();
    expect(metricInfo("price", { price: 204.82 })!.example).toBe("One share of This stock costs $204.82.");
  });

  it("the Simon Property Group example from the result: return on equity 103.0% in the top 3%", () => {
    const info = metricInfo("roe", { name: "Simon Property Group", value: 1.03, top: 3 })!;
    expect(info.title).toBe("Return on equity");
    expect(info.example).toContain("Simon Property Group");
    expect(info.example).toContain("103.0%");
    expect(info.example).toContain("$1.03 of yearly profit for every $1");
    expect(info.example).toContain("top 3% of the eligible stocks");
  });

  it("the stock-card numbers are worked out from the real amounts", () => {
    const tip = { name: "Simon Property Group", price: 204.82, shares: 10, cost: 2048.2, allocatedAmd: 742_574, leftUsd: 158.39, leftAmd: 57_426 };
    expect(metricInfo("shares", tip)!.example).toBe("$2,048.20 buys 10 shares of Simon Property Group at $204.82 each.");
    expect(metricInfo("cost", tip)!.example).toContain("10 × $204.82 = $2,048.20");
    expect(metricInfo("cashLeft", tip)!.example).toContain("$158.39");
    // 19.1% of $2,048.20 is about $391
    expect(metricInfo("vol1y", { ...tip, value: 0.191 })!.example).toContain("19.1%");
    expect(metricInfo("vol1y", { ...tip, value: 0.191 })!.example).toContain("$391");
    // 13.3% of $2,048.20 is about $272
    expect(metricInfo("maxDD", { ...tip, value: -0.133 })!.example).toContain("13.3%");
    expect(metricInfo("maxDD", { ...tip, value: -0.133 })!.example).toContain("$272");
  });

  it("reads a driver's number back from its text when an older saved result has no raw value", () => {
    expect(driverNumber({ value: "103.0%", rawValue: 1.03 })).toBe(1.03);
    expect(driverNumber({ value: "103.0%" })).toBeCloseTo(1.03, 6);
    expect(driverNumber({ value: "-13.3%" })).toBeCloseTo(-0.133, 6);
    expect(driverNumber({ value: "14.45" })).toBe(14.45);
    expect(driverNumber({ value: "yes" })).toBe(1);
    expect(driverNumber({ value: "n/a" })).toBeNull();
  });

  it("is educational: no explanation tells anyone what to buy or sell", () => {
    for (const key of INFO_KEYS) {
      const info = metricInfo(key, FULL)!;
      for (const text of [info.what, info.read, info.example!]) expect(text, key).not.toMatch(/\byou should\b|\bwe recommend\b|\bbuy now\b|\bsell now\b|\bguaranteed? (return|profit|gain)/i);
    }
  });
});

describe("the info popover is wired into the result screens", () => {
  it("the stock card, 'Why this match', portfolio characteristics and holdings headers use it", () => {
    const src = fs.readFileSync("src/ui/invest/ResultViews.tsx", "utf8");
    for (const k of ["price", "shares", "cost", "cashLeft", "vol1y", "maxDD", "allocation", "sharesCol", "reasons", "matchScore", "allocated", "unallocated"]) expect(src, k).toContain(`k="${k}"`);
    expect(src).toContain("driverInfoKey(d.label)");
    expect(src).toContain("<MetricTip k={it.key}");
  });
});
