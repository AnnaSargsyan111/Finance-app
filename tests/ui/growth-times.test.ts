import { afterEach, describe, expect, it } from "vitest";
import { driverTextFor } from "@/invest/explain";
import { driverShown } from "@/ui/invest/labels";
import { driverNumber, metricInfo } from "@/ui/invest/metric-info";
import { setCurrentLocale } from "@/ui/i18n/locale";
import { tg } from "@/ui/i18n/translate";

afterEach(() => setCurrentLocale("en"));

const EPS = "EPS growth (year on year)";
const T = ((k: string, p?: Record<string, string | number>) => tg(k as never, p as never)) as never;

describe("very large growth is shown as how many times larger", () => {
  it("backend: from 1,000% up, only for the growth measures", () => {
    expect(driverTextFor(EPS, 41.733, "4173.3%")).toBe("42.7×");
    expect(driverTextFor("Revenue growth (year on year)", 10, "1000.0%")).toBe("11.0×");
    expect(driverTextFor(EPS, 9.99, "999.0%")).toBe("999.0%");
    expect(driverTextFor(EPS, -0.4, "-40.0%")).toBe("-40.0%");
    // a big percentage on another measure stays a percentage
    expect(driverTextFor("Return on equity", 41.7, "4170.0%")).toBe("4170.0%");
  });

  it("screen: English 42.7×, Armenian 42.7 անգամ, also for older saved results that only have the number", () => {
    const fresh = { label: EPS, value: "42.7×", rawValue: 41.733 };
    const old = { label: EPS, value: "4173.3%", rawValue: 41.733 };
    expect(driverShown(T, fresh)).toBe("42.7×");
    expect(driverShown(T, old)).toBe("42.7×");
    setCurrentLocale("hy");
    expect(driverShown(T, fresh)).toBe("42.7 անգամ");
    expect(driverShown(T, old)).toBe("42.7 անգամ");
    setCurrentLocale("en");
    expect(driverShown(T, { label: EPS, value: "18.4%", rawValue: 0.184 })).toBe("18.4%");
  });

  it("the number behind '42.7×' reads back as growth, and the tooltip says how many times", () => {
    expect(driverNumber({ value: "42.7×" })).toBeCloseTo(41.7, 5);
    const en = metricInfo("epsGrowth", { name: "Acme", value: 41.733, top: 1 })!;
    expect(en.example).toContain("about 42.7 times");
    expect(en.example).not.toContain("4173");
    setCurrentLocale("hy");
    const hy = metricInfo("epsGrowth", { name: "Acme", value: 41.733, top: 1 })!;
    expect(hy.example).toContain("42.7 անգամ");
    setCurrentLocale("en");
    expect(metricInfo("epsGrowth", { name: "Acme", value: 0.25 })!.example).toContain("25.0%");
  });
});
