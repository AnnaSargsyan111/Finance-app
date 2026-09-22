import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";
import { methodologyVersion } from "@/lib/methodology";
import { universeConfig } from "@/lib/quant/config";
import { buildRecord, computeStableLeaders, finaliseRecords, type RecordInput } from "@/lib/quant/records";
import type { SnapshotCoverage, SnapshotPayload, SnapshotRecord } from "@/lib/quant/types";
import { fundamentals as fundamentalsTable, jobRun, universe as universeTable } from "../schema";
import { dedupeIssuers, fetchConstituents, type Constituent } from "./constituents";
import { loadFundamentals, type CompanyFundamentals, type FundamentalsResult } from "./edgar";
import { refreshBars, storedBars, windowStart } from "./prices";
import { loadLatestSnapshot, pruneSnapshots, writeSnapshotAtomic } from "./snapshot-store";

/**
 * Nightly universe batch (handover 5.4 / 10.6):
 *   constituents CSV -> EDGAR frames (concept fallback chains) -> price history -> factor inputs + scores
 *   -> atomic snapshot write (write the full snapshot, then flip the `latest` pointer in one transaction).
 * Partial failures (a symbol without prices, a missing concept) never block the snapshot: the symbol is marked
 * incomplete and excluded. Run it from GitHub Actions / a shell (`npm run job:universe`), not from a serverless request.
 */
export interface BatchOptions {
  /** dev runs: only the first N issuers (env UNIVERSE_LIMIT is used when omitted) */
  limit?: number | null;
  now?: Date;
  /** abort the price stage after this many CONSECUTIVE provider failures (do not hammer a blocking upstream) */
  maxConsecutivePriceFailures?: number;
  onProgress?: (msg: string) => void;
}

export interface BatchStats {
  snapshotId: number;
  asOf: string;
  methodologyVersion: string;
  coverage: SnapshotCoverage;
  priceFailures: { symbol: string; error: string }[];
  frameCalls: number;
  frameFailures: string[];
  durationMs: number;
  priceStageAborted: boolean;
  notes: string[];
}

const v = (c: CompanyFundamentals | undefined, key: string, offset: number): number | null => c?.values[key]?.[offset]?.val ?? null;

export function fundamentalsFor(c: CompanyFundamentals | undefined, fy: number): RecordInput["fundamentals"] {
  return {
    price: null,
    sharesOut: c?.shares?.val ?? null,
    revenue: v(c, "revenue", 0),
    revenuePrev: v(c, "revenue", 1),
    revenue3yAgo: v(c, "revenue", 3),
    netIncome: v(c, "netIncome", 0),
    netIncomePrev: v(c, "netIncome", 1),
    netIncome2yAgo: v(c, "netIncome", 2),
    eps: v(c, "eps", 0),
    epsPrev: v(c, "eps", 1),
    grossProfit: v(c, "grossProfit", 0),
    opIncome: v(c, "opIncome", 0),
    equity: v(c, "equity", 0),
    assets: v(c, "assets", 0),
    liabilities: v(c, "liabilities", 0),
    opCashFlow: v(c, "opCashFlow", 0),
    capex: v(c, "capex", 0),
    dps: v(c, "dps", 0),
    fiscalYear: c && Object.keys(c.values).length ? fy : null,
    fiscalPeriodEnd: c?.values.revenue?.[0]?.end ?? c?.values.netIncome?.[0]?.end ?? c?.values.equity?.[0]?.end ?? null,
  };
}

async function persistUniverse(kept: Constituent[], dropped: { symbol: string; keptSymbol: string }[], allRows: Constituent[]): Promise<void> {
  const db = await getDb();
  const rows = [
    ...kept.map((k) => ({ symbol: k.symbol, cik: k.cik, name: k.name, sector: k.sector, industry: k.industry, inIndex: true, dropReason: null as string | null })),
    ...dropped.map((d) => {
      const r = allRows.find((x) => x.symbol === d.symbol)!;
      return { symbol: d.symbol, cik: r.cik, name: r.name, sector: r.sector, industry: r.industry, inIndex: true, dropReason: `duplicate share class (kept ${d.keptSymbol})` };
    }),
  ];
  for (let i = 0; i < rows.length; i += 200) {
    await db
      .insert(universeTable)
      .values(rows.slice(i, i + 200))
      .onConflictDoUpdate({
        target: universeTable.symbol,
        set: {
          cik: sql.raw('excluded."cik"'),
          name: sql.raw('excluded."name"'),
          sector: sql.raw('excluded."sector"'),
          industry: sql.raw('excluded."industry"'),
          inIndex: sql.raw('excluded."in_index"'),
          dropReason: sql.raw('excluded."drop_reason"'),
          updatedAt: sql`now()`,
        },
      });
  }
}

async function persistFundamentals(kept: Constituent[], fund: FundamentalsResult): Promise<void> {
  const db = await getDb();
  const rows = kept
    .filter((k) => k.cik && fund.byCik.get(k.cik) && Object.keys(fund.byCik.get(k.cik)!.values).length)
    .map((k) => {
      const c = fund.byCik.get(k.cik!)!;
      const f = fundamentalsFor(c, fund.fiscalYear);
      const s = (n: number | null) => (n === null ? null : String(n));
      return {
        symbol: k.symbol,
        fiscalYear: fund.fiscalYear,
        revenue: s(f.revenue),
        netIncome: s(f.netIncome),
        epsDiluted: s(f.eps),
        grossProfit: s(f.grossProfit),
        operatingIncome: s(f.opIncome),
        equity: s(f.equity),
        assets: s(f.assets),
        liabilities: s(f.liabilities),
        opCashFlow: s(f.opCashFlow),
        capex: s(f.capex),
        dividendsPerShare: s(f.dps),
        sharesOut: c.shares ? String(Math.round(c.shares.val)) : null,
        sources: Object.fromEntries(Object.entries(c.values).map(([key, byOffset]) => [key, byOffset[0] ? { concept: byOffset[0].concept, end: byOffset[0].end } : null])) as never,
      };
    });
  for (let i = 0; i < rows.length; i += 100) {
    await db
      .insert(fundamentalsTable)
      .values(rows.slice(i, i + 100))
      .onConflictDoUpdate({
        target: [fundamentalsTable.symbol, fundamentalsTable.fiscalYear],
        set: {
          revenue: sql.raw('excluded."revenue"'),
          netIncome: sql.raw('excluded."net_income"'),
          epsDiluted: sql.raw('excluded."eps_diluted"'),
          grossProfit: sql.raw('excluded."gross_profit"'),
          operatingIncome: sql.raw('excluded."operating_income"'),
          equity: sql.raw('excluded."equity"'),
          assets: sql.raw('excluded."assets"'),
          liabilities: sql.raw('excluded."liabilities"'),
          opCashFlow: sql.raw('excluded."op_cash_flow"'),
          capex: sql.raw('excluded."capex"'),
          dividendsPerShare: sql.raw('excluded."dividends_per_share"'),
          sharesOut: sql.raw('excluded."shares_out"'),
          sources: sql.raw('excluded."sources"'),
          updatedAt: sql`now()`,
        },
      });
  }
}

export async function runUniverseBatch(opts: BatchOptions = {}): Promise<BatchStats> {
  const started = Date.now();
  const now = opts.now ?? new Date();
  const cfg = universeConfig();
  const env = getEnv();
  const limit = opts.limit ?? env.UNIVERSE_LIMIT ?? null;
  const say = (m: string) => {
    log.info(`universe: ${m}`);
    opts.onProgress?.(m);
  };
  const db = await getDb();
  const [job] = await db.insert(jobRun).values({ job: "universe" }).returning({ id: jobRun.id });
  const notes: string[] = [];
  try {
    say("fetching constituents");
    const all = await fetchConstituents();
    const { kept: issuers, dropped } = dedupeIssuers(all, cfg.preferredShareClasses);
    const kept = limit ? issuers.slice(0, limit) : issuers;
    if (limit) notes.push(`DEV RUN: limited to the first ${limit} of ${issuers.length} issuers`);
    const ciks = [...new Set(kept.map((k) => k.cik).filter((c): c is string => Boolean(c)))];
    await persistUniverse(kept, dropped, all);

    say(`loading EDGAR frames for ${ciks.length} CIKs`);
    const fund = await loadFundamentals(ciks, now, cfg);
    await persistFundamentals(kept, fund);
    say(`EDGAR: ${fund.frameCalls} frame calls, revenue coverage ${fund.coverage.revenue}/${ciks.length}`);

    // benchmark + risk-free first (needed for beta)
    const ph = cfg.priceHistory;
    for (const sym of [ph.benchmark, ph.riskFreeSymbol]) {
      const r = await refreshBars(sym, { now });
      if (r.error) notes.push(`benchmark series ${sym} failed: ${r.error}`);
    }
    const start = windowStart(now, ph.years);
    const bench = await storedBars(ph.benchmark, start);

    say(`fetching prices for ${kept.length} symbols`);
    const priceFailures: { symbol: string; error: string }[] = [];
    let consecutive = 0;
    let aborted = false;
    const maxConsec = opts.maxConsecutivePriceFailures ?? 8;
    for (const [i, k] of kept.entries()) {
      if (aborted) {
        priceFailures.push({ symbol: k.symbol, error: "price stage aborted after repeated provider failures" });
        continue;
      }
      const r = await refreshBars(k.symbol, { now });
      if (r.error) {
        priceFailures.push({ symbol: k.symbol, error: r.error });
        if (++consecutive >= maxConsec) {
          aborted = true;
          notes.push(`price stage aborted after ${maxConsec} consecutive failures (provider blocking or down) - remaining symbols excluded`);
        }
      } else consecutive = 0;
      if ((i + 1) % 50 === 0) say(`prices ${i + 1}/${kept.length}`);
    }

    say("computing factor inputs and scores");
    const records: SnapshotRecord[] = [];
    for (const k of kept) {
      const bars = await storedBars(k.symbol, start);
      records.push(
        buildRecord(
          {
            symbol: k.symbol,
            cik: k.cik,
            name: k.name,
            sector: k.sector,
            industry: k.industry,
            fundamentals: fundamentalsFor(k.cik ? fund.byCik.get(k.cik) : undefined, fund.fiscalYear),
            bars: bars.length ? bars : null,
            bench: bench.length ? bench : null,
          },
          cfg,
        ),
      );
    }
    finaliseRecords(records, cfg);
    const prev = await loadLatestSnapshot();
    const stableLeaders = computeStableLeaders(records, prev?.payload.stableLeaders ?? null, cfg);

    const eligibleByRisk = {
      low: records.filter((r) => r.eligibleByRisk.low).length,
      medium: records.filter((r) => r.eligibleByRisk.medium).length,
      high: records.filter((r) => r.eligibleByRisk.high).length,
    };
    const hardEligible = records.filter((r) => r.hardEligible).length;
    if (hardEligible === 0) throw new Error("No eligible stocks after scoring: the previous snapshot is kept unchanged.");

    const cov = fund.coverage;
    const coverage: SnapshotCoverage = {
      constituents: all.length,
      issuers: issuers.length,
      withCik: issuers.filter((i) => i.cik).length,
      duplicatesDropped: dropped.length,
      withFundamentals: records.filter((r) => r.revenue !== null || r.netIncome !== null).length,
      withPrices: records.filter((r) => r.price !== null).length,
      priceFailures: priceFailures.length,
      hardEligible,
      eligibleByRisk,
      revenueCoverage: cov.revenue ?? 0,
      netIncomeCoverage: cov.netIncome ?? 0,
      epsCoverage: cov.eps ?? 0,
      opIncomeCoverage: cov.opIncome ?? 0,
      grossProfitCoverage: cov.grossProfit ?? 0,
      equityCoverage: cov.equity ?? 0,
      assetsCoverage: cov.assets ?? 0,
      opCashFlowCoverage: cov.opCashFlow ?? 0,
      dividendCoverage: cov.dps ?? 0,
      sharesCoverage: cov.shares ?? 0,
      incomplete: records.filter((r) => r.status === "incomplete").length,
      fundamentalsFiscalYear: fund.fiscalYear,
      limit,
    };
    const asOf = records.reduce((m, r) => (r.priceAsOf && r.priceAsOf > m ? r.priceAsOf : m), "") || now.toISOString().slice(0, 10);
    const payload: SnapshotPayload = {
      records,
      stableLeaders,
      coverage,
      benchmark: { symbol: ph.benchmark, lastDate: bench.at(-1)?.date ?? null, bars: bench.length },
      notes,
    };
    const snapshotId = await writeSnapshotAtomic(asOf, methodologyVersion(), payload);
    await pruneSnapshots(5).catch(() => 0);
    const stats: BatchStats = {
      snapshotId,
      asOf,
      methodologyVersion: methodologyVersion(),
      coverage,
      priceFailures: priceFailures.slice(0, 50),
      frameCalls: fund.frameCalls,
      frameFailures: fund.failures.slice(0, 20),
      durationMs: Date.now() - started,
      priceStageAborted: aborted,
      notes,
    };
    await db.update(jobRun).set({ finishedAt: new Date(), status: "ok", stats: stats as never }).where(eq(jobRun.id, job.id));
    say(`snapshot ${snapshotId} written (${hardEligible} eligible of ${records.length})`);
    return stats;
  } catch (e) {
    await db
      .update(jobRun)
      .set({ finishedAt: new Date(), status: "failed", stats: { error: e instanceof Error ? e.message : String(e) } as never })
      .where(eq(jobRun.id, job.id));
    throw e;
  }
}
