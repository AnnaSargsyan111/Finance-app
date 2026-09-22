/** Calendar-date helpers. Calendar dates are plain "YYYY-MM-DD" strings; arithmetic is done in UTC so it is DST-proof. */
export const APP_TZ = "Asia/Yerevan"; // UTC+4, no DST

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isValidDate(s: string): boolean {
  const m = DATE_RE.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

const toUtc = (s: string) => {
  const m = DATE_RE.exec(s);
  if (!m) throw new Error(`Invalid date: ${s}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
};
const fmt = (d: Date) => d.toISOString().slice(0, 10);

/** Today's calendar date in the given IANA zone (default Asia/Yerevan). */
export function todayIn(tz: string = APP_TZ, now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export const addDays = (s: string, n: number) => fmt(new Date(toUtc(s).getTime() + n * 86_400_000));
export const diffDays = (a: string, b: string) => Math.round((toUtc(a).getTime() - toUtc(b).getTime()) / 86_400_000);

export function addMonths(s: string, n: number): string {
  const d = toUtc(s);
  const day = d.getUTCDate();
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(day, last));
  return fmt(t);
}
export const addYears = (s: string, n: number) => addMonths(s, n * 12);

export const firstOfMonth = (s: string) => `${s.slice(0, 7)}-01`;
export function lastOfMonth(s: string): string {
  const d = toUtc(s);
  return fmt(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}
export const monthOf = (s: string) => s.slice(0, 7);

/** Monday of the ISO week containing the date. */
export function weekStart(s: string): string {
  const d = toUtc(s);
  const dow = (d.getUTCDay() + 6) % 7; // Mon=0
  return addDays(s, -dow);
}

export function* eachDay(from: string, to: string): Generator<string> {
  for (let d = from; d <= to; d = addDays(d, 1)) yield d;
}

export function eachMonth(from: string, to: string): string[] {
  const out: string[] = [];
  for (let m = monthOf(from); m <= monthOf(to); m = monthOf(addMonths(`${m}-01`, 1))) out.push(m);
  return out;
}

export const dayOfWeek = (s: string) => toUtc(s).getUTCDay(); // 0=Sun

/** Current calendar month range in Asia/Yerevan. */
export function currentMonthRange(now: Date = new Date()): { from: string; to: string } {
  const today = todayIn(APP_TZ, now);
  return { from: firstOfMonth(today), to: lastOfMonth(today) };
}

/** epoch seconds -> calendar date in a given zone (market dates use America/New_York). */
export function epochToDate(sec: number, tz = "America/New_York"): string {
  return todayIn(tz, new Date(sec * 1000));
}
