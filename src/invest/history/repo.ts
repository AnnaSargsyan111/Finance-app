import { and, count, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { ApiError, notFound } from "@/lib/errors";
import { APP_TZ, todayIn } from "@/lib/time";
import { savedRecommendation } from "../schema";
import { stripVolatile } from "./token";

/**
 * The ONLY place in `invest` that touches the database (Change Order 1, 17.5): it writes only to
 * invest.saved_recommendation, only on the explicit Add action, always scoped to the caller's user id, and it has no
 * relationship to any Personal Finance table.
 */
type Row = typeof savedRecommendation.$inferSelect;
type R = Record<string, unknown>;

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown): string | null => (typeof v === "string" ? v : null);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function summarise(result: R) {
  const mode = result.mode === "portfolio" ? "portfolio" : "single";
  if (mode === "single") {
    const pick = (result.pick ?? {}) as R;
    return {
      headline: `${str(pick.symbol) ?? "?"} - ${str(pick.name) ?? ""}`.trim(),
      holdings: [{ symbol: str(pick.symbol), name: str(pick.name), allocationPercent: 100 }],
    };
  }
  const hs = (Array.isArray(result.holdings) ? result.holdings : []) as R[];
  return {
    headline: `${hs.length} holdings`,
    holdings: hs.map((h) => ({ symbol: str(h.symbol), name: str(h.name), allocationPercent: num(h.allocationPercent) })),
  };
}

function benchmarkSummary(result: R): R | null {
  const b = result.benchmark as R | null | undefined;
  if (!b || typeof b !== "object") return null;
  const m = (b.metrics ?? {}) as { portfolio?: R; benchmark?: R };
  return {
    window: b.window ?? null,
    start: b.start ?? null,
    end: b.end ?? null,
    portfolioTotalReturn: num(m.portfolio?.totalReturn),
    benchmarkTotalReturn: num(m.benchmark?.totalReturn),
    portfolioMaxDrawdown: num(m.portfolio?.maxDrawdown),
    benchmarkMaxDrawdown: num(m.benchmark?.maxDrawdown),
  };
}

export function toItem(r: Row) {
  const result = r.result as R;
  const s = summarise(result);
  return {
    id: r.id,
    createdAt: new Date(r.createdAt).toISOString(),
    mode: r.mode,
    inputs: r.inputs,
    usdRate: String(r.usdRate).replace(/(\.\d*?)0+$/, "$1").replace(/\.$/, ""),
    score: num(result.score),
    headline: s.headline,
    holdings: s.holdings,
    methodologyVersion: r.methodologyVersion,
    snapshotDate: r.snapshotDate,
  };
}

/** Saves a VERIFIED result (the route has already checked the HMAC token and the hash). Idempotent per (user, resultHash). */
export async function saveRecommendation(userId: string, result: R, resultHash: string): Promise<{ item: ReturnType<typeof toItem>; created: boolean }> {
  const inputs = result.inputs as { amountAmd?: unknown; risk?: unknown; horizon?: unknown } | undefined;
  const mode = result.mode;
  const usdRate = str(result.usdRate);
  const methodologyVersion = str(result.methodologyVersion);
  const snapshotDate = str(result.snapshotDate);
  if ((mode !== "single" && mode !== "portfolio") || !inputs || !usdRate || !methodologyVersion || !snapshotDate) {
    throw new ApiError("INVALID_SAVE_TOKEN", 400, "This recommendation cannot be saved.");
  }
  const db = await getDb();
  const clean = stripVolatile(result) as R;
  const [row] = await db
    .insert(savedRecommendation)
    .values({
      userId,
      mode,
      inputs: { amountAmd: inputs.amountAmd, risk: inputs.risk, horizon: inputs.horizon } as never,
      usdRate,
      result: clean as never,
      benchmarkSummary: benchmarkSummary(clean) as never,
      methodologyVersion,
      snapshotDate,
      resultHash,
    })
    .onConflictDoNothing()
    .returning();
  if (row) return { item: toItem(row), created: true };
  const [existing] = await db
    .select()
    .from(savedRecommendation)
    .where(and(eq(savedRecommendation.userId, userId), eq(savedRecommendation.resultHash, resultHash)))
    .limit(1);
  return { item: toItem(existing), created: false };
}

const monthName = (isoDate: string) =>
  new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${isoDate}T12:00:00Z`));

/** newest first, paginated, grouped by the Asia/Yerevan calendar day of created_at */
export async function listHistory(userId: string, page: number, pageSize: number) {
  const db = await getDb();
  const [{ n }] = await db.select({ n: count() }).from(savedRecommendation).where(eq(savedRecommendation.userId, userId));
  const rows = await db
    .select()
    .from(savedRecommendation)
    .where(eq(savedRecommendation.userId, userId))
    .orderBy(desc(savedRecommendation.createdAt), desc(savedRecommendation.id))
    .limit(pageSize)
    .offset((page - 1) * pageSize);
  const groups: { date: string; label: string; items: ReturnType<typeof toItem>[] }[] = [];
  for (const r of rows) {
    const date = todayIn(APP_TZ, new Date(r.createdAt));
    let g = groups.find((x) => x.date === date);
    if (!g) groups.push((g = { date, label: monthName(date), items: [] }));
    g.items.push(toItem(r));
  }
  return { groups, page, pageSize, total: Number(n) };
}

export async function getHistoryItem(userId: string, id: string) {
  if (!UUID_RE.test(id)) throw notFound("Saved recommendation");
  const db = await getDb();
  const [r] = await db.select().from(savedRecommendation).where(and(eq(savedRecommendation.id, id), eq(savedRecommendation.userId, userId))).limit(1);
  if (!r) throw notFound("Saved recommendation");
  return { ...toItem(r), result: r.result, benchmarkSummary: r.benchmarkSummary };
}

export async function deleteHistoryItem(userId: string, id: string): Promise<void> {
  if (!UUID_RE.test(id)) throw notFound("Saved recommendation");
  const db = await getDb();
  const del = await db.delete(savedRecommendation).where(and(eq(savedRecommendation.id, id), eq(savedRecommendation.userId, userId))).returning({ id: savedRecommendation.id });
  if (del.length === 0) throw notFound("Saved recommendation");
}
