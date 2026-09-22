import { describe, expect, it } from "vitest";
import {
  cleanAmountInput,
  currentMonthYerevan,
  formatAgo,
  formatAmd,
  formatDate,
  formatDateLong,
  formatDateTime,
  formatFx,
  formatNumber,
  formatPercent,
  formatSigned,
  formatUsd,
  yerevanDay,
} from "@/ui/lib/format";

describe("formatting rules (handover 11.8)", () => {
  it("formats AMD with thousands separators", () => {
    expect(formatAmd(850000)).toBe("850,000 AMD");
    expect(formatAmd("900000.00")).toBe("900,000 AMD");
    expect(formatAmd("120000.50")).toBe("120,000.50 AMD");
    expect(formatAmd(1000000000)).toBe("1,000,000,000 AMD");
    expect(formatAmd(null)).toBe("-");
  });

  it("formats USD without decimals by default", () => {
    expect(formatUsd("1375.74")).toBe("$1,376");
    expect(formatUsd(227.2, 2)).toBe("$227.20");
    expect(formatUsd(-12, 2)).toBe("-$12.00");
  });

  it("formats FX with 2 decimals, RUB with 4", () => {
    expect(formatFx("363.44", "USD/AMD")).toBe("363.44");
    expect(formatFx("4.3123", "RUB/AMD")).toBe("4.3123");
    expect(formatFx("4.31", "RUB/AMD")).toBe("4.3100");
  });

  it("uses a minus sign and explicit plus signs, never colour alone", () => {
    expect(formatNumber(-1234.5, 2)).toBe("-1,234.50");
    expect(formatSigned("-0.06")).toBe("-0.06");
    expect(formatSigned("0.0049", 4)).toBe("+0.0049");
    expect(formatSigned(0)).toBe("0.00");
    expect(formatPercent(-2.5, 1)).toBe("-2.5%");
    expect(formatPercent(2.1234, 2, { sign: true })).toBe("+2.12%");
    expect(formatNumber(-0.001, 2)).toBe("0.00"); // never "-0.00"
  });

  it("formats dates like 21 Sep 2026 and history headings like September 21, 2026", () => {
    expect(formatDate("2026-09-21")).toBe("21 Sep 2026");
    expect(formatDate("2026-01-05")).toBe("5 Jan 2026");
    expect(formatDateLong("2026-09-21")).toBe("September 21, 2026");
  });

  it("shows times in Asia/Yerevan (UTC+4)", () => {
    expect(formatDateTime("2026-09-21T17:59:45.000Z")).toBe("21 Sep 2026, 21:59");
    expect(yerevanDay("2026-09-21T21:30:00.000Z")).toBe("2026-09-22"); // 01:30 next day in Yerevan
    expect(currentMonthYerevan(new Date("2026-08-31T21:00:00Z"))).toBe("2026-09");
  });

  it("describes relative time", () => {
    const now = new Date("2026-09-21T12:00:00Z");
    expect(formatAgo("2026-09-21T11:55:00Z", now)).toBe("5 min ago");
    expect(formatAgo("2026-09-21T11:59:50Z", now)).toBe("just now");
    expect(formatAgo("2026-09-20T12:00:00Z", now)).toBe("1 d ago");
  });

  it("cleans pasted money", () => {
    expect(cleanAmountInput("850,000 AMD")).toBe("850000");
    expect(cleanAmountInput(" 1 200.5 ")).toBe("1200.5");
    expect(cleanAmountInput("$1.2.3")).toBe("1.23");
  });
});
