import { pgSchema, text, uuid, timestamp, boolean, numeric, date, integer, uniqueIndex, check, index } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Schema `pf` (Personal Finance) - PERIOD based (Change Order 1, handover 17.1): one income amount per period and
 * expense amounts per category per period. NO foreign keys to `market`, `invest` or `auth`: user_id is an opaque
 * text id that every query filters on.
 * Deviation from the DDL in 2.6/17.1: amounts are numeric(15,2) (not 14,2) so the documented maximum of 1e12 fits.
 */
export const pfSchema = pgSchema("pf");

export const period = pfSchema.table(
  "period",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    /** 'month' => start = 1st day, end = last day of that month; anything else is 'custom' */
    kind: text("kind").notNull(),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }).notNull(),
    income: numeric("income", { precision: 15, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("pf_period_user_range_uq").on(t.userId, t.startDate, t.endDate),
    index("pf_period_user_start_idx").on(t.userId, t.startDate),
    check("pf_period_kind_chk", sql`${t.kind} in ('month','custom')`),
    check("pf_period_dates_chk", sql`${t.startDate} <= ${t.endDate}`),
    check("pf_period_income_chk", sql`${t.income} is null or ${t.income} >= 0`),
  ],
);

export const periodExpense = pfSchema.table(
  "period_expense",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => period.id, { onDelete: "cascade" }),
    /** fixed key for the 7 default categories, NULL for custom categories */
    categoryKey: text("category_key"),
    label: text("label").notNull(),
    isCustom: boolean("is_custom").notNull().default(false),
    amount: numeric("amount", { precision: 15, scale: 2 }),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    uniqueIndex("pf_period_expense_label_uq").on(t.periodId, sql`lower(${t.label})`),
    check("pf_period_expense_amount_chk", sql`${t.amount} is null or ${t.amount} >= 0`),
  ],
);
