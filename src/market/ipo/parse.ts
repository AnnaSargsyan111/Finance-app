/** Small readers shared by the IPO sources. */

/** "16.00-18.00", "$16.00 - $18.00", "17" or "" -> low and high (equal for a single price) */
export function parsePrice(text: string): { low: number | null; high: number | null } {
  const nums = (text.match(/\d+(?:\.\d+)?/g) ?? []).map(Number).filter((x) => Number.isFinite(x) && x > 0);
  if (nums.length === 0) return { low: null, high: null };
  const low = Math.min(nums[0], nums[nums.length - 1]);
  const high = Math.max(nums[0], nums[nums.length - 1]);
  return { low, high };
}

/** "$199,999,998" / "11,111,111" -> number, or null */
export function parseAmount(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v > 0 ? v : null;
  if (typeof v !== "string") return null;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Nasdaq's "10/16/2026" -> "2026-10-16"; anything else -> null */
export function usDateToIso(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(v.trim());
  if (!m) return null;
  const [mo, d, y] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export const cleanStr = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
