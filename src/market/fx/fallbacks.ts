import { UpstreamError } from "@/lib/errors";
import { normaliseDecimal } from "@/lib/money";
import { isValidDate } from "@/lib/time";
import { fetchJson } from "../http";
import type { FxLatestResult, FxObservation, FxProvider } from "./types";

/**
 * Frankfurter v2 with providers=CBA: the SAME central-bank data re-served as JSON (community-run service).
 * Range endpoint returns working days only, per-unit rates.
 */
const FRANKFURTER = "https://api.frankfurter.dev/v2";

/** JS numbers from JSON.parse are shortest-round-trip decimal text, so String() recovers the published digits. */
function numToDecimal(n: unknown, provider: string): string {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) throw new UpstreamError(provider, `${provider} returned an invalid rate`);
  const s = String(n);
  if (/e/i.test(s)) return normaliseDecimal(n.toFixed(10), 2);
  return normaliseDecimal(s, 2);
}

export const frankfurterProvider: FxProvider = {
  name: "Frankfurter",
  async latest(isos): Promise<FxLatestResult> {
    const observations: FxObservation[] = [];
    let currentDate = "";
    for (const iso of isos) {
      const j = await fetchJson<{ date?: string; rate?: number }>(`${FRANKFURTER}/rate/${iso}/AMD?providers=CBA`, { provider: "Frankfurter" });
      if (!j.date || !isValidDate(j.date)) throw new UpstreamError("Frankfurter", "Frankfurter returned an invalid date");
      observations.push({ iso, date: j.date, rate: numToDecimal(j.rate, "Frankfurter"), diff: null });
      if (j.date > currentDate) currentDate = j.date;
    }
    return { currentDate, observations };
  },
  async range(from, to, isos) {
    const out: FxObservation[] = [];
    for (const iso of isos) {
      const rows = await fetchJson<{ date: string; rate: number }[]>(
        `${FRANKFURTER}/rates?providers=CBA&from=${from}&to=${to}&base=${iso}&quotes=AMD`,
        { provider: "Frankfurter" },
      );
      if (!Array.isArray(rows)) throw new UpstreamError("Frankfurter", "Frankfurter range response has an unexpected shape");
      for (const r of rows) {
        if (!isValidDate(r.date)) throw new UpstreamError("Frankfurter", "Frankfurter returned an invalid date");
        out.push({ iso, date: r.date, rate: numToDecimal(r.rate, "Frankfurter"), diff: null });
      }
    }
    return out;
  },
};

/**
 * fawazahmed0 currency-api on jsDelivr (CC0). Market-derived, calendar-daily, NOT the CBA reference rate:
 * used only as a last-resort LATEST fallback (history for 30 days would need 30 x 4 calls).
 */
export const fawazahmedProvider: FxProvider = {
  name: "fawazahmed0",
  async latest(isos): Promise<FxLatestResult> {
    const observations: FxObservation[] = [];
    let currentDate = "";
    for (const iso of isos) {
      const base = iso.toLowerCase();
      const j = await fetchJson<Record<string, unknown>>(
        `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/${base}.json`,
        { provider: "fawazahmed0" },
      );
      const date = String(j.date ?? "");
      const amd = (j[base] as Record<string, unknown> | undefined)?.amd;
      if (!isValidDate(date)) throw new UpstreamError("fawazahmed0", "fawazahmed0 returned an invalid date");
      const rounded = typeof amd === "number" ? Number(amd.toFixed(4)) : NaN;
      observations.push({ iso, date, rate: numToDecimal(rounded, "fawazahmed0"), diff: null });
      if (date > currentDate) currentDate = date;
    }
    return { currentDate, observations };
  },
};
