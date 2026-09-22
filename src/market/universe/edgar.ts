import { getEnv } from "@/lib/env";
import { NotConfiguredError, UpstreamError } from "@/lib/errors";
import { log } from "@/lib/log";
import { universeConfig, type UniverseConfig } from "@/lib/quant/config";
import { politeFetch } from "../http";

/**
 * SEC EDGAR XBRL "frames": one call returns one value per company for a concept and period
 * (data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{period}.json, 0.3-0.9 MB, keyless).
 * Requires a descriptive User-Agent with a real contact (SEC_USER_AGENT, never hard-coded); requests are spaced to
 * ~6/s by the polite HTTP layer (SEC fair-use limit is 10/s). Concept fallback chains come from methodology.v1.json.
 */
export interface FrameValue {
  val: number;
  end: string;
}

export async function fetchFrame(taxonomy: string, concept: string, unit: string, period: string): Promise<Map<string, FrameValue>> {
  const ua = getEnv().SEC_USER_AGENT;
  if (!ua) throw new NotConfiguredError("sec-edgar", "SEC_USER_AGENT must be set (\"AppName contact@example.com\") before calling SEC EDGAR");
  const url = `https://data.sec.gov/api/xbrl/frames/${taxonomy}/${concept}/${unit}/${period}.json`;
  const res = await politeFetch(url, { provider: "sec-edgar", userAgent: ua, timeoutMs: 40_000, retries: 1, allowStatus: [404] });
  // a concept that nobody reported for that period answers 404: an empty frame, not an error
  if (res.status === 404) return new Map();
  let json: { data?: { cik: number; val: number; end: string }[] };
  try {
    json = JSON.parse(await res.text());
  } catch {
    throw new UpstreamError("sec-edgar", `SEC returned invalid JSON for ${concept} ${period}`);
  }
  if (!Array.isArray(json.data)) throw new UpstreamError("sec-edgar", `SEC frame ${concept} ${period} has an unexpected shape`);
  const out = new Map<string, FrameValue>();
  for (const d of json.data) if (typeof d.val === "number" && Number.isFinite(d.val)) out.set(String(d.cik), { val: d.val, end: d.end });
  return out;
}

/** last completed calendar year with all 10-Ks filed (2026-09 -> 2025); before March the year before that */
export function pickFiscalYear(now: Date): number {
  const y = now.getUTCFullYear();
  return now.getUTCMonth() >= 2 ? y - 1 : y - 2;
}

/** last `n` calendar quarter labels (newest first) that ended before `now`, e.g. CY2026Q2I */
export function lastQuarterLabels(now: Date, n: number): string[] {
  let y = now.getUTCFullYear();
  let q = Math.floor(now.getUTCMonth() / 3) + 1; // current quarter (not complete)
  const out: string[] = [];
  for (let i = 0; i < n; i++) {
    q--;
    if (q === 0) {
      q = 4;
      y--;
    }
    out.push(`CY${y}Q${q}I`);
  }
  return out;
}

export interface MetricValue {
  val: number;
  end: string;
  concept: string;
}

export interface CompanyFundamentals {
  /** metric key -> offset (years back from FY) -> value */
  values: Record<string, Record<number, MetricValue>>;
  shares: { val: number; source: string } | null;
}

export interface FundamentalsResult {
  fiscalYear: number;
  byCik: Map<string, CompanyFundamentals>;
  /** number of frame calls made and per-metric FY coverage (of the requested CIKs) - real coverage stats */
  frameCalls: number;
  coverage: Record<string, number>;
  requested: number;
  failures: string[];
}

/**
 * Load every configured metric for the given CIKs. For each metric and year offset the chain is walked in order and the
 * first concept that has a value for a company wins (recorded per value); frames are only fetched while some CIK still
 * lacks a value.
 */
export async function loadFundamentals(ciks: string[], now: Date, cfg: UniverseConfig = universeConfig()): Promise<FundamentalsResult> {
  const fy = pickFiscalYear(now);
  const want = new Set(ciks);
  const byCik = new Map<string, CompanyFundamentals>();
  for (const c of ciks) byCik.set(c, { values: {}, shares: null });
  let frameCalls = 0;
  const failures: string[] = [];
  const cache = new Map<string, Map<string, FrameValue>>();
  const frame = async (taxonomy: string, concept: string, unit: string, period: string) => {
    const k = `${taxonomy}/${concept}/${unit}/${period}`;
    if (cache.has(k)) return cache.get(k)!;
    frameCalls++;
    try {
      const f = await fetchFrame(taxonomy, concept, unit, period);
      cache.set(k, f);
      return f;
    } catch (e) {
      if (e instanceof NotConfiguredError) throw e;
      failures.push(`${k}: ${e instanceof Error ? e.message : String(e)}`);
      log.warn("EDGAR frame failed", { frame: k, message: e instanceof Error ? e.message : String(e) });
      return new Map<string, FrameValue>();
    }
  };

  for (const m of cfg.fundamentals.metrics) {
    for (const offset of m.offsets) {
      const year = fy - offset;
      const period = m.kind === "instant" ? `CY${year}Q4I` : `CY${year}`;
      let missing = new Set(want);
      for (const concept of m.chain) {
        if (missing.size === 0) break;
        const f = await frame("us-gaap", concept, m.unit, period);
        for (const cik of [...missing]) {
          const v = f.get(cik);
          if (v) {
            byCik.get(cik)!.values[m.key] = { ...(byCik.get(cik)!.values[m.key] ?? {}), [offset]: { val: v.val, end: v.end, concept } };
            missing.delete(cik);
          }
        }
        missing = new Set([...missing]);
      }
    }
  }

  // shares outstanding: dei cover-page value (newest quarter first), then weighted diluted shares for the fiscal year
  const sh = cfg.fundamentals.shares;
  let missingShares = new Set(want);
  for (const label of lastQuarterLabels(now, sh.instantQuarters)) {
    if (missingShares.size === 0) break;
    const f = await frame(sh.instantTaxonomy, sh.instantConcept, "shares", label);
    for (const cik of [...missingShares]) {
      const v = f.get(cik);
      if (v && v.val > 0) {
        byCik.get(cik)!.shares = { val: v.val, source: `dei:${sh.instantConcept} ${label}` };
        missingShares.delete(cik);
      }
    }
  }
  if (missingShares.size) {
    const period = sh.fallbackKind === "instant" ? `CY${fy}Q4I` : `CY${fy}`;
    const f = await frame("us-gaap", sh.fallbackConcept, "shares", period);
    for (const cik of missingShares) {
      const v = f.get(cik);
      if (v && v.val > 0) byCik.get(cik)!.shares = { val: v.val, source: `us-gaap:${sh.fallbackConcept} ${period}` };
    }
  }

  const coverage: Record<string, number> = {};
  for (const m of cfg.fundamentals.metrics) coverage[m.key] = [...byCik.values()].filter((c) => c.values[m.key]?.[0] !== undefined).length;
  coverage.shares = [...byCik.values()].filter((c) => c.shares).length;
  return { fiscalYear: fy, byCik, frameCalls, coverage, requested: ciks.length, failures };
}
