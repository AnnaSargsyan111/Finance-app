import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDb, getDb } from "@/lib/db";
import { call } from "./helpers/api";
import { R, registerUser, type TestUser } from "./helpers/routes";
import { resolvePeriodRef, DEFAULT_EXPENSE_CATEGORIES } from "@/pf/schemas";
import { apportionPercents } from "@/pf/view";

beforeAll(async () => {
  await useTestDb();
});

const getPeriod = (u: TestUser | null, q: string) => call(R.pfPeriod.GET, "GET", `/api/pf/period${q ? `?${q}` : ""}`, { jar: u?.jar });
const putPeriod = (u: TestUser | null, body: unknown) => call(R.pfPeriod.PUT, "PUT", "/api/pf/period", { json: body, jar: u?.jar });
const delPeriod = (u: TestUser | null, q: string) => call(R.pfPeriod.DELETE, "DELETE", `/api/pf/period?${q}`, { jar: u?.jar });
const listPeriods = (u: TestUser | null) => call(R.pfPeriods.GET, "GET", "/api/pf/periods", { jar: u?.jar });

const month = (m: string, income: unknown, expenses: unknown[] = []) => ({ kind: "month", month: m, income, expenses });

describe("AC-B11 fresh period, defaults, computed values", () => {
  it("a period that was never saved returns exists:false with the 7 default categories (never an error)", async () => {
    const u = await registerUser("fresh");
    const r = await getPeriod(u, "kind=month&month=2026-09");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      period: { kind: "month", start: "2026-09-01", end: "2026-09-30" },
      exists: false,
      income: null,
      totals: { income: "0.00", expensesTotal: "0.00", available: "0.00" },
      expenseBreakdown: [],
      cashFlow: { income: "0.00", expenses: "0.00", available: "0.00" },
      isEmpty: true,
      incomeMissing: false,
      updatedAt: null,
    });
    expect(r.body.expenses).toEqual(
      [
        ["housing", "Housing"], ["food_dining", "Food & Dining"], ["transportation", "Transportation"], ["bills_utilities", "Bills & Utilities"],
        ["shopping", "Shopping"], ["entertainment", "Entertainment"], ["other", "Other"],
      ].map(([key, label]) => ({ key, label, isCustom: false, amount: null })),
    );
    expect(DEFAULT_EXPENSE_CATEGORIES).toHaveLength(7);
    // the same for a custom range
    const c = await getPeriod(u, "kind=custom&start=2026-09-05&end=2026-09-20");
    expect(c.body).toMatchObject({ period: { kind: "custom", start: "2026-09-05", end: "2026-09-20" }, exists: false, isEmpty: true });
  });

  it("PUT upserts the whole period; available = income - expenses; breakdown percent sums to exactly 100 (largest remainder)", async () => {
    const u = await registerUser("golden");
    const res = await putPeriod(u, month("2026-09", "900000.00", [
      { key: "housing", amount: "250000.00" },
      { key: "bills_utilities", amount: "50000.00" },
      { key: "food_dining", amount: "200000.00" },
      { key: "transportation", amount: "60000.00" },
      { key: "other", amount: "80000.00" },
    ]));
    expect(res.status).toBe(200);
    expect(res.body.exists).toBe(true);
    expect(res.body.income).toBe("900000.00");
    expect(res.body.totals).toEqual({ income: "900000.00", expensesTotal: "640000.00", available: "260000.00" });
    expect(res.body.cashFlow).toEqual({ income: "900000.00", expenses: "640000.00", available: "260000.00" });
    expect(res.body.isEmpty).toBe(false);
    expect(res.body.incomeMissing).toBe(false);
    // 39.0625 / 31.25 / 12.5 / 9.375 / 7.8125  ->  39 / 31 / 13 / 9 / 8 = 100
    expect(res.body.expenseBreakdown).toEqual([
      { label: "Housing", amount: "250000.00", percent: 39 },
      { label: "Food & Dining", amount: "200000.00", percent: 31 },
      { label: "Other", amount: "80000.00", percent: 13 },
      { label: "Transportation", amount: "60000.00", percent: 9 },
      { label: "Bills & Utilities", amount: "50000.00", percent: 8 },
    ]);
    expect(res.body.expenseBreakdown.reduce((a: number, b: { percent: number }) => a + b.percent, 0)).toBe(100);
    // entries with no amount are simply not in the breakdown, but all 7 defaults are in `expenses`
    expect(res.body.expenses).toHaveLength(7);
    expect(res.body.expenses.find((e: { key: string }) => e.key === "shopping").amount).toBeNull();
    expect(res.body.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
    // GET returns exactly what PUT returned
    const again = await getPeriod(u, "kind=month&month=2026-09");
    expect(again.body).toEqual(res.body);
  });

  it("apportionPercents: always sums to 100 and is deterministic (property check)", () => {
    expect(apportionPercents([1n, 1n, 1n])).toEqual([34, 33, 33]);
    expect(apportionPercents([1n])).toEqual([100]);
    expect(apportionPercents([])).toEqual([]);
    let seed = 12345;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let t = 0; t < 300; t++) {
      const n = 1 + Math.floor(rnd() * 27);
      const amounts = Array.from({ length: n }, () => BigInt(1 + Math.floor(rnd() * 1_000_000)));
      const p = apportionPercents(amounts);
      expect(p.reduce((a, b) => a + b, 0)).toBe(100);
      expect(p).toEqual(apportionPercents(amounts));
      expect(p.every((x) => Number.isInteger(x) && x >= 0)).toBe(true);
    }
  });

  it("income missing: available goes negative, incomeMissing true; income only: available = income; explicit 0 income is not 'missing'", async () => {
    const u = await registerUser("flags");
    const noIncome = await putPeriod(u, month("2026-09", null, [{ key: "food_dining", amount: "12500.00" }]));
    expect(noIncome.body).toMatchObject({ income: null, incomeMissing: true, isEmpty: false, totals: { income: "0.00", expensesTotal: "12500.00", available: "-12500.00" } });
    const onlyIncome = await putPeriod(u, month("2026-09", "1000.50", []));
    expect(onlyIncome.body).toMatchObject({ incomeMissing: false, isEmpty: false, totals: { available: "1000.50" }, expenseBreakdown: [] });
    const zeroIncome = await putPeriod(u, month("2026-09", "0", [{ key: "other", amount: "0" }]));
    expect(zeroIncome.body).toMatchObject({ income: "0.00", incomeMissing: false, isEmpty: false });
    const allNull = await putPeriod(u, month("2026-09", null, [{ key: "other", amount: null }, { key: "housing", amount: "" }]));
    expect(allNull.body).toMatchObject({ exists: true, isEmpty: true, incomeMissing: false });
    // saved-but-empty periods are not listed as having data
    const list = await listPeriods(u);
    expect(list.body[0]).toMatchObject({ kind: "month", start: "2026-09-01", end: "2026-09-30", hasData: false });
  });

  it("no float drift: 0.10 + 0.20 = 0.30 exactly, and ten times 0.10 = 1.00", async () => {
    const u = await registerUser("drift");
    const r = await putPeriod(u, month("2026-09", "0.10", [{ key: "housing", amount: "0.10" }, { key: "food_dining", amount: "0.20" }]));
    expect(r.body.totals).toEqual({ income: "0.10", expensesTotal: "0.30", available: "-0.20" });
    const many = await putPeriod(u, month("2026-10", "1.00", Array.from({ length: 10 }, (_, i) => ({ label: `Custom ${i}`, amount: "0.10" }))));
    expect(many.body.totals.expensesTotal).toBe("1.00");
    expect(many.body.totals.available).toBe("0.00");
  });

  it("amount input: decimal strings preferred; JSON numbers and empty strings are tolerated; always returned as 2-decimal strings", async () => {
    const u = await registerUser("numbers");
    const r = await putPeriod(u, month("2026-09", 12500.5, [{ key: "housing", amount: 100 }, { key: "other", amount: "7.5" }, { key: "shopping", amount: "" }]));
    expect(r.status).toBe(200);
    expect(r.body.income).toBe("12500.50");
    expect(r.body.expenses[0].amount).toBe("100.00");
    expect(r.body.expenses.find((e: { key: string }) => e.key === "other").amount).toBe("7.50");
    expect(r.body.expenses.find((e: { key: string }) => e.key === "shopping").amount).toBeNull();
    expect(r.body.totals.expensesTotal).toBe("107.50");
    expect(r.body.totals.available).toBe("12393.00");
  });
});

describe("AC-B11 custom categories", () => {
  it("add, keep and remove custom categories (removed = omitted from the next save); they count in totals and the breakdown", async () => {
    const u = await registerUser("custom");
    const a = await putPeriod(u, month("2026-09", "5000", [
      { key: "housing", amount: "1000" },
      { label: "  Pets  ", amount: "250.25" },
      { label: "Gym", amount: "49.99" },
    ]));
    expect(a.status).toBe(200);
    expect(a.body.expenses.map((e: { label: string }) => e.label)).toEqual([
      "Housing", "Food & Dining", "Transportation", "Bills & Utilities", "Shopping", "Entertainment", "Other", "Pets", "Gym",
    ]);
    expect(a.body.expenses[7]).toEqual({ key: null, label: "Pets", isCustom: true, amount: "250.25" });
    expect(a.body.totals.expensesTotal).toBe("1300.24");
    expect(a.body.expenseBreakdown.map((b: { label: string }) => b.label)).toEqual(["Housing", "Pets", "Gym"]);
    // remove "Gym" by omitting it
    const b = await putPeriod(u, month("2026-09", "5000", [{ key: "housing", amount: "1000" }, { label: "Pets", amount: "250.25" }]));
    expect(b.body.expenses.map((e: { label: string }) => e.label)).not.toContain("Gym");
    expect(b.body.totals.expensesTotal).toBe("1250.25");
    // and a stored period never resurrects it
    const c = await getPeriod(u, "kind=month&month=2026-09");
    expect(c.body.expenses.filter((e: { isCustom: boolean }) => e.isCustom).map((e: { label: string }) => e.label)).toEqual(["Pets"]);
  });

  it("custom categories belong to THAT period only", async () => {
    const u = await registerUser("customscope");
    await putPeriod(u, month("2026-09", "100", [{ label: "Pets", amount: "5" }]));
    const other = await getPeriod(u, "kind=month&month=2026-10");
    expect(other.body.expenses).toHaveLength(7);
    expect(other.body.expenses.some((e: { isCustom: boolean }) => e.isCustom)).toBe(false);
  });

  it("custom label rules: 1-40 chars, case-insensitive unique, not equal to a default label, max 20 per period", async () => {
    const u = await registerUser("labels");
    const bad = async (expenses: unknown[]) => putPeriod(u, month("2026-09", "1", expenses));
    expect((await bad([{ label: "food & dining", amount: "1" }])).body.error.fields["expenses.0.label"]).toMatch(/default/i);
    expect((await bad([{ label: "OTHER", amount: "1" }])).status).toBe(400);
    expect((await bad([{ label: "Pets", amount: "1" }, { label: "pets", amount: "2" }])).body.error.fields["expenses.1.label"]).toMatch(/unique/i);
    expect((await bad([{ label: "", amount: "1" }])).status).toBe(400);
    expect((await bad([{ label: "   ", amount: "1" }])).status).toBe(400);
    expect((await bad([{ amount: "1" }])).body.error.fields["expenses.0.label"]).toBeTruthy();
    expect((await bad([{ label: "x".repeat(41), amount: "1" }])).status).toBe(400);
    expect((await bad([{ label: "x".repeat(40), amount: "1" }])).status).toBe(200);
    const twenty = Array.from({ length: 20 }, (_, i) => ({ label: `Cat ${i}`, amount: "1" }));
    expect((await bad(twenty)).status).toBe(200);
    const twentyOne = [...twenty, { label: "Cat 20", amount: "1" }];
    const r = await bad(twentyOne);
    expect(r.status).toBe(400);
    expect(r.body.error.fields.expenses).toMatch(/at most 20/i);
    // unknown / duplicate default keys
    expect((await bad([{ key: "rent", amount: "1" }])).body.error.fields["expenses.0.key"]).toBeTruthy();
    expect((await bad([{ key: "housing", amount: "1" }, { key: "housing", amount: "2" }])).body.error.fields["expenses.1.key"]).toMatch(/duplicate/i);
  });
});

describe("AC-B11 isolation between periods", () => {
  it("saving period A never changes period B; month and custom periods with different (start,end) are independent records", async () => {
    const u = await registerUser("iso");
    await putPeriod(u, month("2026-08", "111", [{ key: "housing", amount: "11" }]));
    await putPeriod(u, month("2026-09", "222", [{ key: "housing", amount: "22" }]));
    await putPeriod(u, { kind: "custom", start: "2026-09-05", end: "2026-09-20", income: "333", expenses: [{ key: "housing", amount: "33" }] });
    const before = (await getPeriod(u, "kind=month&month=2026-08")).body;
    // re-save September with different data
    await putPeriod(u, month("2026-09", "999", [{ label: "Pets", amount: "9" }]));
    expect((await getPeriod(u, "kind=month&month=2026-08")).body).toEqual(before);
    const custom = (await getPeriod(u, "kind=custom&start=2026-09-05&end=2026-09-20")).body;
    expect(custom).toMatchObject({ exists: true, income: "333.00", period: { kind: "custom" } });
    expect(custom.expenses[0].amount).toBe("33.00");
    expect((await getPeriod(u, "kind=month&month=2026-09")).body.income).toBe("999.00");
    // deleting the custom period leaves the month untouched
    expect((await delPeriod(u, "kind=custom&start=2026-09-05&end=2026-09-20")).status).toBe(204);
    expect((await getPeriod(u, "kind=custom&start=2026-09-05&end=2026-09-20")).body.exists).toBe(false);
    expect((await getPeriod(u, "kind=month&month=2026-09")).body.income).toBe("999.00");
    // a custom range that IS one whole calendar month is the same record as that month (normalised to kind "month")
    const whole = await getPeriod(u, "kind=custom&start=2026-08-01&end=2026-08-31");
    expect(whole.body.period.kind).toBe("month");
    expect(whole.body.income).toBe("111.00");
  });

  it("GET /api/pf/periods lists saved periods newest first with hasData/updatedAt", async () => {
    const u = await registerUser("list");
    expect((await listPeriods(u)).body).toEqual([]);
    await putPeriod(u, month("2026-07", "10"));
    await putPeriod(u, month("2026-09", "30"));
    await putPeriod(u, { kind: "custom", start: "2026-08-10", end: "2026-08-20", income: null, expenses: [{ key: "housing", amount: "5" }] });
    const list = await listPeriods(u);
    expect(list.status).toBe(200);
    expect(list.body.map((p: { start: string; end: string; kind: string }) => `${p.kind}:${p.start}..${p.end}`)).toEqual([
      "month:2026-09-01..2026-09-30",
      "custom:2026-08-10..2026-08-20",
      "month:2026-07-01..2026-07-31",
    ]);
    expect(list.body.every((p: { hasData: boolean; updatedAt: string }) => p.hasData && /^\d{4}-/.test(p.updatedAt))).toBe(true);
    expect(Object.keys(list.body[0]).sort()).toEqual(["end", "hasData", "kind", "start", "updatedAt"]);
  });

  it("parallel saves of the same period both succeed and leave ONE consistent record", async () => {
    const u = await registerUser("race");
    const [a, b] = await Promise.all([
      putPeriod(u, month("2026-09", "100", [{ key: "housing", amount: "1" }, { label: "A", amount: "1" }])),
      putPeriod(u, month("2026-09", "200", [{ key: "housing", amount: "2" }, { label: "B", amount: "2" }])),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const db = await getDb();
    const rows = await db.execute(sql`select count(*)::int as n from pf.period where user_id = ${u.id}`);
    expect((rows.rows[0] as { n: number }).n).toBe(1);
    const final = (await getPeriod(u, "kind=month&month=2026-09")).body;
    const labels = final.expenses.filter((e: { isCustom: boolean }) => e.isCustom).map((e: { label: string }) => e.label);
    expect(labels).toHaveLength(1);
    expect(["A", "B"]).toContain(labels[0]);
    expect((final.income === "100.00" && labels[0] === "A") || (final.income === "200.00" && labels[0] === "B")).toBe(true);
  });
});

describe("period addressing and validation", () => {
  it("default period (no query) = current calendar month in Asia/Yerevan; boundary behaviour around local midnight", async () => {
    // Yerevan is UTC+4 (no DST): 2026-08-31T20:30Z is already 2026-09-01 00:30 there
    expect(resolvePeriodRef({}, new Date("2026-08-31T20:30:00Z"))).toEqual({ kind: "month", start: "2026-09-01", end: "2026-09-30" });
    expect(resolvePeriodRef({}, new Date("2026-08-31T19:30:00Z"))).toEqual({ kind: "month", start: "2026-08-01", end: "2026-08-31" });
    expect(resolvePeriodRef({}, new Date("2028-02-10T12:00:00Z"))).toEqual({ kind: "month", start: "2028-02-01", end: "2028-02-29" });
    const u = await registerUser("defaultp");
    const r = await getPeriod(u, "");
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yerevan" }).format(new Date());
    expect(r.body.period).toMatchObject({ kind: "month", start: `${today.slice(0, 7)}-01` });
    expect(r.body.exists).toBe(false);
  });

  it("validation: month format, kind/field combinations, custom range order and the 366-day span", async () => {
    const u = await registerUser("valid");
    const g = async (q: string) => getPeriod(u, q);
    expect((await g("kind=month&month=2026-13")).body.error.fields.month).toBeTruthy();
    expect((await g("kind=month&month=2026-9")).status).toBe(400);
    expect((await g("kind=month")).body.error.fields.month).toBeTruthy();
    expect((await g("kind=month&month=2026-09&start=2026-09-01")).body.error.fields.start).toBeTruthy();
    expect((await g("kind=custom&start=2026-09-01")).body.error.fields.end).toBeTruthy();
    expect((await g("kind=custom&start=2026-09-20&end=2026-09-05")).body.error.fields.end).toMatch(/before start/i);
    expect((await g("kind=custom&start=2026-02-30&end=2026-03-01")).status).toBe(400);
    expect((await g("kind=weekly&month=2026-09")).body.error.fields.kind).toBeTruthy();
    expect((await g("kind=month&month=2026-09&extra=1")).status).toBe(400);
    expect((await g("kind=month&month=1989-12")).status).toBe(400);
    // 366 days inclusive is allowed, 367 is not
    expect((await g("kind=custom&start=2026-01-01&end=2026-12-31")).status).toBe(200); // 365 days
    expect((await g("kind=custom&start=2028-01-01&end=2028-12-31")).status).toBe(200); // 366 days (leap year)
    const tooLong = await g("kind=custom&start=2026-01-01&end=2027-01-02"); // 367 days
    expect(tooLong.status).toBe(400);
    expect(tooLong.body.error.fields.end).toMatch(/366/);
    // PUT: kind is required and the body is strict
    expect((await putPeriod(u, { month: "2026-09", income: "1", expenses: [] })).body.error.fields.kind).toBeTruthy();
    expect((await putPeriod(u, { ...month("2026-09", "1"), userId: "someone" })).body.error.fields.userId).toBeTruthy();
    expect((await putPeriod(u, { kind: "month", income: "1" })).body.error.fields.month).toBeTruthy();
    expect((await putPeriod(u, { kind: "custom", month: "2026-09", start: "2026-09-01", end: "2026-09-02", income: "1" })).status).toBe(400);
  });

  it("amount validation: >= 0, <= 2 decimals, <= 1e12, no exponent / garbage; error fields point at the field", async () => {
    const u = await registerUser("amounts");
    const inc = (income: unknown) => putPeriod(u, month("2026-09", income));
    expect((await inc("-1")).body.error.fields.income).toBeTruthy();
    expect((await inc(-5)).status).toBe(400);
    expect((await inc("1.234")).status).toBe(400);
    expect((await inc("1e3")).status).toBe(400);
    expect((await inc(1e21)).status).toBe(400);
    expect((await inc("abc")).status).toBe(400);
    expect((await inc("1,000")).status).toBe(400);
    expect((await inc("1000000000000.01")).status).toBe(400);
    expect((await inc(true)).status).toBe(400);
    expect((await inc("1000000000000")).status).toBe(200); // exactly 1e12
    expect((await inc("0")).status).toBe(200);
    expect((await inc("0.00")).status).toBe(200);
    expect((await inc(null)).status).toBe(200);
    const r = await putPeriod(u, month("2026-09", "1", [{ key: "housing", amount: "-2" }, { key: "other", amount: "9999999999999" }]));
    expect(r.status).toBe(400);
    expect(Object.keys(r.body.error.fields).sort()).toEqual(["expenses.0.amount", "expenses.1.amount"]);
  });

  it("stores hostile strings inertly (labels are data, returned verbatim as JSON)", async () => {
    const u = await registerUser("xss");
    const evil = `<img src=x onerror=alert(1)>'); DROP TABLE pf.period; --`.slice(0, 40);
    const r = await putPeriod(u, month("2026-09", "1", [{ label: evil, amount: "1" }]));
    expect(r.status).toBe(200);
    expect(r.body.expenses.at(-1).label).toBe(evil);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    expect((await getPeriod(u, "kind=month&month=2026-09")).body.expenses.at(-1).label).toBe(evil);
  });
});

describe("AC-B2 authorization (two accounts, every pf route)", () => {
  it("user B can never read, list, overwrite or delete user A's periods; unauthenticated calls are 401", async () => {
    const A = await registerUser("ownerA");
    const B = await registerUser("otherB");
    const saved = await putPeriod(A, month("2026-09", "777.00", [{ key: "housing", amount: "77.00" }, { label: "A secret", amount: "7.00" }]));
    expect(saved.status).toBe(200);

    // B sees "not saved" for the same period, and does not see it in the list
    const bView = await getPeriod(B, "kind=month&month=2026-09");
    expect(bView.body.exists).toBe(false);
    expect(bView.body.income).toBeNull();
    expect(JSON.stringify(bView.body)).not.toContain("A secret");
    expect((await listPeriods(B)).body).toEqual([]);
    // B saving the SAME (start,end) creates B's own record and does not touch A's
    const bSave = await putPeriod(B, month("2026-09", "5.00"));
    expect(bSave.status).toBe(200);
    const aAfter = await getPeriod(A, "kind=month&month=2026-09");
    expect(aAfter.body.income).toBe("777.00");
    expect(aAfter.body.expenses.some((e: { label: string }) => e.label === "A secret")).toBe(true);
    // B cannot delete A's period; a delete only removes the caller's own record
    const bDel = await delPeriod(B, "kind=month&month=2026-08");
    expect(bDel.status).toBe(404);
    expect((await delPeriod(B, "kind=month&month=2026-09")).status).toBe(204);
    expect((await getPeriod(A, "kind=month&month=2026-09")).body.income).toBe("777.00");
    expect((await getPeriod(B, "kind=month&month=2026-09")).body.exists).toBe(false);
    // no user id in the URL or body can be used to reach someone else's data
    const body = { ...month("2026-09", "1"), userId: A.id };
    expect((await putPeriod(B, body)).status).toBe(400);
    const db = await getDb();
    const owners = await db.execute(sql`select user_id, income::text as income from pf.period order by user_id, income`);
    expect((owners.rows as { user_id: string }[]).filter((r) => r.user_id === A.id)).toHaveLength(1);

    // no cookie -> 401 on every pf route
    for (const [h, m, p, json] of [
      [R.pfPeriods.GET, "GET", "/api/pf/periods", undefined],
      [R.pfPeriod.GET, "GET", "/api/pf/period?kind=month&month=2026-09", undefined],
      [R.pfPeriod.PUT, "PUT", "/api/pf/period", month("2026-09", "1")],
      [R.pfPeriod.DELETE, "DELETE", "/api/pf/period?kind=month&month=2026-09", undefined],
    ] as [unknown, string, string, unknown][]) {
      const r = await call(h, m, p, { json });
      expect(r.status, `${m} ${p}`).toBe(401);
      expect(r.body.error.code).toBe("UNAUTHENTICATED");
    }
    // A's data survived all of the above
    expect((await getPeriod(A, "kind=month&month=2026-09")).body.totals.available).toBe("693.00");
  });

  it("deleting a period cascades its category rows", async () => {
    const u = await registerUser("cascade");
    await putPeriod(u, month("2026-09", "1", [{ label: "Pets", amount: "1" }]));
    const db = await getDb();
    const count = async () => Number(((await db.execute(sql`select count(*)::int as n from pf.period_expense`)).rows[0] as { n: number }).n);
    const before = await count();
    expect((await delPeriod(u, "kind=month&month=2026-09")).status).toBe(204);
    expect(before - (await count())).toBe(8); // 7 defaults + 1 custom
    expect((await delPeriod(u, "kind=month&month=2026-09")).status).toBe(404); // already gone
    expect((await call(R.pfPeriod.DELETE, "DELETE", "/api/pf/period", { jar: u.jar })).status).toBe(400); // refuses to guess
  });
});
