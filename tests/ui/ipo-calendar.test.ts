import { describe, expect, it } from "vitest";
import { byDate, monthGrid, shiftMonth, startMonth } from "@/ui/market/ipo-calendar";
import type { IpoItem } from "@/ui/api/types";

const item = (date: string | null, status: IpoItem["status"] = "expected", name = "Acme"): IpoItem => ({ date, filedDate: null, name, symbol: null, exchange: null, status, priceLow: null, priceHigh: null, shares: null, dealSizeUsd: null, filingsUrl: "" });

describe("IPO month calendar", () => {
  it("builds Monday-first weeks with blanks outside the month", () => {
    const weeks = monthGrid("2026-11"); // 1 Nov 2026 is a Sunday
    expect(weeks.every((w) => w.length === 7)).toBe(true);
    expect(weeks[0]).toEqual([null, null, null, null, null, null, "2026-11-01"]);
    expect(weeks.flat().filter(Boolean)).toHaveLength(30);
    expect(weeks[weeks.length - 1].at(-1)).toBeNull();
    // a month that starts on Monday has no leading blanks
    expect(monthGrid("2026-06")[0][0]).toBe("2026-06-01");
  });

  it("moves between months across the year end", () => {
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-05", 0)).toBe("2026-05");
  });

  it("groups by day and opens on the month of the next upcoming IPO", () => {
    const items = [item("2026-12-03"), item("2026-11-05"), item("2026-11-05", "filed", "Beta"), item("2026-10-16", "priced")];
    expect(byDate(items).get("2026-11-05")).toHaveLength(2);
    expect(startMonth(items, "2026-10-22")).toBe("2026-11");
    // nothing upcoming: today's month; a past "expected" date does not count
    expect(startMonth([item("2026-10-16", "priced"), item("2026-09-01")], "2026-10-22")).toBe("2026-10");
  });

  it("a company that has only filed has no IPO day: it is not on the calendar", () => {
    const filed = { ...item(null, "filed", "Filed Co"), filedDate: "2026-11-02" };
    expect(byDate([filed]).size).toBe(0);
    expect(startMonth([filed], "2026-10-22")).toBe("2026-10");
  });
});
