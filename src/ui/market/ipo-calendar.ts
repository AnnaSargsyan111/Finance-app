import type { IpoItem } from "../api/types";

/** Month-grid helpers for the IPO calendar. Dates are plain "YYYY-MM-DD" strings and months "YYYY-MM"; arithmetic is in UTC so it is DST-proof. */

const pad = (n: number) => String(n).padStart(2, "0");

export const monthOf = (iso: string): string => iso.slice(0, 7);

/** "2026-12" shifted by n months ("2027-01" for +1) */
export function shiftMonth(ym: string, n: number): string {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

/** the weeks of a month, Monday first; days outside the month are null */
export function monthGrid(ym: string): (string | null)[][] {
  const [y, m] = ym.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1, 1));
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7;
  const cells: (string | null)[] = [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${ym}-${pad(i + 1)}`)];
  while (cells.length % 7 !== 0) cells.push(null);
  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** the IPOs of each day */
export function byDate(items: readonly IpoItem[]): Map<string, IpoItem[]> {
  const map = new Map<string, IpoItem[]>();
  // a company that has only filed has no IPO day: it is not on the calendar
  for (const i of items) if (i.date) map.set(i.date, [...(map.get(i.date) ?? []), i]);
  return map;
}

/** the month to open on: the one with the next upcoming IPO, otherwise the current month */
export function startMonth(items: readonly IpoItem[], today: string): string {
  const next = items
    .filter((i): i is IpoItem & { date: string } => (i.status === "expected" || i.status === "other") && i.date !== null && i.date >= today)
    .map((i) => i.date)
    .sort()[0];
  return monthOf(next ?? today);
}
