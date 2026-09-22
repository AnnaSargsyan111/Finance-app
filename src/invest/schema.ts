import { pgSchema, text, uuid, timestamp, jsonb, numeric, date, uniqueIndex, index, check } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Schema `invest`. Since Change Order 1 (handover 17.5) the Investment module may write ONLY here, and only to
 * `saved_recommendation` (opt-in "Add" action). There is deliberately NO relationship to `pf` (no FK, no shared columns).
 */
export const investSchema = pgSchema("invest");

export const savedRecommendation = investSchema.table(
  "saved_recommendation",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    mode: text("mode").notNull(),
    /** { amountAmd, risk, horizon } */
    inputs: jsonb("inputs").notNull(),
    usdRate: numeric("usd_rate", { precision: 18, scale: 8 }).notNull(),
    /** the full recommendation payload as returned to the client (pick/holdings, scores, amounts, warnings) */
    result: jsonb("result").notNull(),
    benchmarkSummary: jsonb("benchmark_summary"),
    methodologyVersion: text("methodology_version").notNull(),
    snapshotDate: date("snapshot_date", { mode: "string" }).notNull(),
    resultHash: text("result_hash").notNull(),
  },
  (t) => [
    uniqueIndex("invest_saved_user_hash_uq").on(t.userId, t.resultHash),
    index("invest_saved_user_created_idx").on(t.userId, t.createdAt),
    check("invest_saved_mode_chk", sql`${t.mode} in ('single','portfolio')`),
  ],
);
