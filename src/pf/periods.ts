import { and, asc, eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { notFound } from "@/lib/errors";
import { period, periodExpense } from "./schema";
import { DEFAULT_EXPENSE_CATEGORIES, normaliseExpenses, type PeriodRef } from "./schemas";
import { buildView, type ExpenseRow, type PeriodView } from "./view";

/**
 * Period-based Personal Finance (Change Order 1, 17.1). Every query filters by userId; ids/periods that belong to
 * somebody else are indistinguishable from ones that do not exist.
 */
const defaultRows = (): ExpenseRow[] =>
  DEFAULT_EXPENSE_CATEGORIES.map((c) => ({ key: c.key as string | null, label: c.label as string, isCustom: false, amount: null }));

const iso = (d: Date | string) => new Date(d).toISOString();

async function findPeriod(userId: string, ref: PeriodRef) {
  const db = await getDb();
  const [row] = await db
    .select()
    .from(period)
    .where(and(eq(period.userId, userId), eq(period.startDate, ref.start), eq(period.endDate, ref.end)))
    .limit(1);
  return row ?? null;
}

/** Saved data for the period, or `exists:false` with the 7 default categories (never an error). */
export async function getPeriodView(userId: string, ref: PeriodRef): Promise<PeriodView> {
  const row = await findPeriod(userId, ref);
  if (!row) {
    return buildView({ period: ref, exists: false, income: null, expenses: defaultRows(), updatedAt: null });
  }
  const db = await getDb();
  const rows = await db.select().from(periodExpense).where(eq(periodExpense.periodId, row.id)).orderBy(asc(periodExpense.sortOrder), asc(periodExpense.label));
  const expenses: ExpenseRow[] = rows.map((r) => ({ key: r.categoryKey, label: r.label, isCustom: r.isCustom, amount: r.amount }));
  return buildView({
    period: { kind: row.kind as "month" | "custom", start: row.startDate, end: row.endDate },
    exists: true,
    income: row.income,
    expenses,
    updatedAt: iso(row.updatedAt),
  });
}

/**
 * Upsert the WHOLE period (income + category amounts). Default categories missing from the payload become "not entered";
 * custom categories missing from the payload are deleted. One transaction; other periods are never touched.
 */
export async function putPeriod(
  userId: string,
  ref: PeriodRef,
  input: { income: string | null; expenses: Parameters<typeof normaliseExpenses>[0] },
): Promise<PeriodView> {
  const expenses = normaliseExpenses(input.expenses);
  const db = await getDb();
  const saved = await db.transaction(async (tx) => {
    const [row] = await tx
      .insert(period)
      .values({ userId, kind: ref.kind, startDate: ref.start, endDate: ref.end, income: input.income })
      .onConflictDoUpdate({
        target: [period.userId, period.startDate, period.endDate],
        set: { kind: ref.kind, income: input.income, updatedAt: sql`now()` },
      })
      .returning();
    await tx.delete(periodExpense).where(eq(periodExpense.periodId, row.id));
    await tx.insert(periodExpense).values(
      expenses.map((e, i) => ({ periodId: row.id, categoryKey: e.key, label: e.label, isCustom: e.isCustom, amount: e.amount, sortOrder: i })),
    );
    return row;
  });
  return buildView({
    period: { kind: saved.kind as "month" | "custom", start: saved.startDate, end: saved.endDate },
    exists: true,
    income: saved.income,
    expenses: expenses.map((e) => ({ ...e })),
    updatedAt: iso(saved.updatedAt),
  });
}

export async function deletePeriod(userId: string, ref: PeriodRef): Promise<void> {
  const db = await getDb();
  const deleted = await db
    .delete(period)
    .where(and(eq(period.userId, userId), eq(period.startDate, ref.start), eq(period.endDate, ref.end)))
    .returning({ id: period.id });
  if (deleted.length === 0) throw notFound("Period");
}

export interface PeriodListItem {
  kind: "month" | "custom";
  start: string;
  end: string;
  hasData: boolean;
  updatedAt: string;
}

/** Saved periods for the selector, newest first. `hasData` = income entered or any expense amount > 0. */
export async function listPeriods(userId: string): Promise<PeriodListItem[]> {
  const db = await getDb();
  const res = await db.execute(sql`
    select p.kind, p.start_date::text as start, p.end_date::text as "end", p.updated_at,
           (p.income is not null or exists (
             select 1 from pf.period_expense e where e.period_id = p.id and coalesce(e.amount, 0) > 0
           )) as has_data
    from pf.period p
    where p.user_id = ${userId}
    order by p.end_date desc, p.start_date desc`);
  return (res.rows as { kind: string; start: string; end: string; updated_at: string | Date; has_data: boolean }[]).map((r) => ({
    kind: r.kind as "month" | "custom",
    start: r.start,
    end: r.end,
    hasData: r.has_data === true,
    updatedAt: iso(r.updated_at),
  }));
}

/** Account deletion support (handover 2.4): hard-delete all of one user's Personal Finance data. */
export async function deleteAllUserData(userId: string): Promise<void> {
  const db = await getDb();
  await db.delete(period).where(eq(period.userId, userId)); // period_expense cascades
}
