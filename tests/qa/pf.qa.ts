import { describe, it, expect } from "vitest";
import { newUser, yerevanToday, addDays, cents } from "./helpers";

const DEFAULTS = [
  ["housing", "Housing"],
  ["food_dining", "Food & Dining"],
  ["transportation", "Transportation"],
  ["bills_utilities", "Bills & Utilities"],
  ["shopping", "Shopping"],
  ["entertainment", "Entertainment"],
  ["other", "Other"],
];
const put = (c: { put: Function }, body: unknown) => c.put("/api/pf/period", body);
const month = "2026-09";

describe("C1 defaults / empty state", () => {
  it("new user: default period = current Asia/Yerevan month, exists:false, 7 default categories in order, null amounts, isEmpty", async () => {
    const { c } = await newUser("pf1");
    const r = await c.get("/api/pf/period");
    expect(r.status).toBe(200);
    const today = yerevanToday();
    expect(r.body.period.kind).toBe("month");
    expect(r.body.period.start).toBe(`${today.slice(0, 7)}-01`);
    const [y, m] = today.split("-").map(Number);
    expect(r.body.period.end).toBe(new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10));
    expect(r.body.exists).toBe(false);
    expect(r.body.income).toBeNull();
    expect(r.body.expenses.map((e: { key: string; label: string }) => [e.key, e.label])).toEqual(DEFAULTS);
    expect(r.body.expenses.every((e: { amount: unknown; isCustom: boolean }) => e.amount === null && e.isCustom === false)).toBe(true);
    expect(r.body.isEmpty).toBe(true);
    expect(r.body.incomeMissing).toBe(false);
    expect(r.body.expenseBreakdown).toEqual([]);
    expect(r.body.updatedAt).toBeNull();
    expect((await c.get("/api/pf/periods")).body).toEqual([]);
    // GET never persists an unsaved period
    await c.get(`/api/pf/period?kind=month&month=2031-01`);
    expect((await c.get("/api/pf/periods")).body).toEqual([]);
  });

  it("selector validation: bad month / kind / dates -> 400 with fields, never 500", async () => {
    const { c } = await newUser("pf1b");
    for (const q of [
      "kind=month&month=2026-13",
      "kind=month&month=2026-9",
      "kind=month&month=abc",
      "kind=month",
      "kind=custom&start=2026-02-30&end=2026-03-01",
      "kind=custom&start=2026-03-05&end=2026-03-01",
      "kind=custom&start=2026-01-01&end=2027-01-02", // 367 days
      "kind=custom&start=2026-01-01",
      "kind=weird&month=2026-09",
      "kind=month&month=2026-09&extra=1",
    ]) {
      const r = await c.get(`/api/pf/period?${q}`);
      expect(r.status, q).toBe(400);
      expect(r.body.error.code, q).toBe("VALIDATION_ERROR");
    }
    const ok = await c.get("/api/pf/period?kind=custom&start=2026-01-01&end=2026-12-31"); // 365 days
    expect(ok.status).toBe(200);
    expect((await c.get("/api/pf/period?kind=custom&start=2024-01-01&end=2024-12-31")).status).toBe(200); // 366 days leap year
    expect((await c.get("/api/pf/period?kind=custom&start=2026-09-05&end=2026-09-05")).status).toBe(200); // one day
  });
});

describe("C2 exact maths", () => {
  it("0.10 + 0.20 = 0.30 exactly, available = income - expenses to the cent", async () => {
    const { c } = await newUser("pf2");
    const r = await put(c, { kind: "month", month, income: "0.30", expenses: [{ key: "housing", amount: "0.10" }, { key: "food_dining", amount: "0.20" }] });
    expect(r.status).toBe(200);
    expect(r.body.totals).toEqual({ income: "0.30", expensesTotal: "0.30", available: "0.00" });
    const r2 = await put(c, { kind: "month", month, income: "0.1", expenses: [{ key: "housing", amount: "0.2" }] });
    expect(r2.body.totals.available).toBe("-0.10");
    expect(r2.body.totals.expensesTotal).toBe("0.20");
  });

  it("golden data (spec 12.3 mapped to the period model): available 260,000.00; percents sum to 100", async () => {
    const { c } = await newUser("pf2g");
    const r = await put(c, {
      kind: "month",
      month,
      income: "900000.00",
      expenses: [
        { key: "housing", amount: "250000.00" },
        { key: "bills_utilities", amount: "50000.00" },
        { key: "food_dining", amount: "200000.00" },
        { key: "transportation", amount: "60000.00" },
        { key: "other", amount: "80000.00" },
      ],
    });
    expect(r.body.totals).toEqual({ income: "900000.00", expensesTotal: "640000.00", available: "260000.00" });
    expect(r.body.cashFlow).toEqual({ income: "900000.00", expenses: "640000.00", available: "260000.00" });
    const bd = r.body.expenseBreakdown as { label: string; amount: string; percent: number }[];
    expect(bd.reduce((a, b) => a + b.percent, 0)).toBe(100);
    expect(bd[0].label).toBe("Housing");
    expect(bd[0].percent).toBe(39); // 39.06 % -> integer
    expect(bd.map((b) => b.percent)).toEqual([39, 31, 13, 9, 8]);
    expect(r.body.isEmpty).toBe(false);
    expect(r.body.incomeMissing).toBe(false);
  });

  it("property: 150 random expense sets -> total in cents exact, percents integer, sum 100, ordering by amount desc", async () => {
    const { c } = await newUser("pf2p");
    const keys = DEFAULTS.map((d) => d[0]);
    for (let n = 0; n < 150; n++) {
      const chosen = keys.filter(() => Math.random() < 0.6);
      const exp = chosen.map((k) => ({ key: k, amount: (Math.floor(Math.random() * 10_000_000) / 100).toFixed(2) }));
      const income = (Math.floor(Math.random() * 100_000_000) / 100).toFixed(2);
      const r = await put(c, { kind: "month", month: "2027-01", income, expenses: exp });
      expect(r.status).toBe(200);
      const sumC = exp.reduce((a, e) => a + Math.round(Number(e.amount) * 100), 0);
      expect(cents(r.body.totals.expensesTotal)).toBe(sumC);
      expect(cents(r.body.totals.available)).toBe(Math.round(Number(income) * 100) - sumC);
      const bd = r.body.expenseBreakdown as { amount: string; percent: number }[];
      const positive = exp.filter((e) => Number(e.amount) > 0);
      expect(bd.length).toBe(positive.length);
      if (bd.length) {
        expect(bd.reduce((a, b) => a + b.percent, 0)).toBe(100);
        for (const b of bd) {
          expect(Number.isInteger(b.percent)).toBe(true);
          const exact = (Number(b.amount) / (sumC / 100)) * 100;
          expect(Math.abs(b.percent - exact)).toBeLessThan(1.0001);
        }
        const amts = bd.map((b) => cents(b.amount)!);
        expect([...amts].sort((a, b) => b - a)).toEqual(amts);
      }
    }
  });

  it("flags: only income / only expenses / all zero / explicit 0", async () => {
    const { c } = await newUser("pf2f");
    let r = await put(c, { kind: "month", month: "2027-02", income: "1000", expenses: [] });
    expect([r.body.isEmpty, r.body.incomeMissing, r.body.totals.available, r.body.expenseBreakdown.length]).toEqual([false, false, "1000.00", 0]);
    r = await put(c, { kind: "month", month: "2027-03", income: null, expenses: [{ key: "housing", amount: "40" }] });
    expect([r.body.isEmpty, r.body.incomeMissing, r.body.totals.available, r.body.income]).toEqual([false, true, "-40.00", null]);
    r = await put(c, { kind: "month", month: "2027-04", income: "", expenses: [{ key: "housing", amount: "0" }, { key: "other", amount: null }] });
    console.log("FLAGS income='' & zero expenses ->", JSON.stringify({ e: r.body.isEmpty, im: r.body.incomeMissing, exists: r.body.exists }));
    expect(r.body.isEmpty).toBe(true);
    expect(r.body.expenseBreakdown).toEqual([]); // amount 0 not in breakdown
    r = await put(c, { kind: "month", month: "2027-05", income: "0", expenses: [] });
    console.log("FLAGS income='0' & no expenses -> isEmpty:", r.body.isEmpty);
  });

  it("limits: 1e12 ok, above rejected; 2 decimals only; negatives / junk rejected; number and string forms accepted", async () => {
    const { c } = await newUser("pf2l");
    const p = (income: unknown, exp: unknown[] = []) => put(c, { kind: "month", month: "2027-06", income, expenses: exp });
    expect((await p("1000000000000")).status).toBe(200);
    expect((await p("1000000000000.00")).status).toBe(200);
    expect((await p("1000000000000.01")).status).toBe(400);
    expect((await p("1000000000001")).status).toBe(400);
    expect((await p("999999999999.99", [{ key: "housing", amount: "999999999999.99" }])).body.totals.available).toBe("0.00");
    for (const bad of ["-1", "-0.01", "1.234", "abc", "1e3", "NaN", "Infinity", "1,000", "0x10", "--1", "1.", ".", "٣"]) {
      const r = await p(bad);
      expect(r.status, `income=${bad}`).toBe(400);
      expect(r.body.error.fields?.income, `income=${bad}`).toBeTruthy();
    }
    expect((await p(-5)).status).toBe(400);
    expect((await p(12.5)).status).toBe(200);
    expect((await p(0.1 + 0.2)).status, "0.30000000000000004 as number").toBeLessThan(500);
    expect((await p(1e21)).status).toBe(400);
    expect((await p([1])).status).toBe(400);
    expect((await p({})).status).toBe(400);
    expect((await p(true)).status).toBe(400);
    const e = await p("10", [{ key: "housing", amount: "-1" }]);
    expect(e.status).toBe(400);
    console.log("expense error fields:", JSON.stringify(e.body.error.fields));
  });
});

describe("C3 custom categories", () => {
  it("add, order, remove by omission, trimmed, case-insensitive unique, not a default label, max 20, 1-40 chars", async () => {
    const { c } = await newUser("pf3");
    const base = { kind: "month", month: "2027-07", income: "100" };
    let r = await put(c, { ...base, expenses: [{ label: "  Pets  ", amount: "10" }, { label: "Gym", amount: "5.5" }] });
    expect(r.status).toBe(200);
    const custom = r.body.expenses.filter((e: { isCustom: boolean }) => e.isCustom);
    expect(custom.map((e: { label: string }) => e.label)).toEqual(["Pets", "Gym"]);
    expect(r.body.expenses.slice(0, 7).map((e: { key: string }) => e.key)).toEqual(DEFAULTS.map((d) => d[0]));
    expect(r.body.expenseBreakdown.map((b: { label: string }) => b.label)).toEqual(["Pets", "Gym"]);
    // remove by omission
    r = await put(c, { ...base, expenses: [{ label: "Gym", amount: "5.5" }] });
    expect(r.body.expenses.filter((e: { isCustom: boolean }) => e.isCustom).map((e: { label: string }) => e.label)).toEqual(["Gym"]);
    // duplicates (case-insensitive)
    for (const dupe of [
      [{ label: "Pets", amount: "1" }, { label: "pets", amount: "2" }],
      [{ label: "Pets", amount: "1" }, { label: " PETS ", amount: "2" }],
    ]) {
      const d = await put(c, { ...base, expenses: dupe });
      expect(d.status).toBe(400);
    }
    // equals a default label (case-insensitive)
    for (const l of ["Housing", "housing", "FOOD & DINING", "Other", "Bills & Utilities", "shopping", "  Entertainment "]) {
      const d = await put(c, { ...base, expenses: [{ label: l, amount: "1" }] });
      expect(d.status, `label=${l}`).toBe(400);
    }
    // length limits
    expect((await put(c, { ...base, expenses: [{ label: "", amount: "1" }] })).status).toBe(400);
    expect((await put(c, { ...base, expenses: [{ label: "   ", amount: "1" }] })).status).toBe(400);
    expect((await put(c, { ...base, expenses: [{ label: "x".repeat(41), amount: "1" }] })).status).toBe(400);
    expect((await put(c, { ...base, expenses: [{ label: "x".repeat(40), amount: "1" }] })).status).toBe(200);
    // max 20
    const twenty = Array.from({ length: 20 }, (_, i) => ({ label: `Cat ${i + 1}`, amount: "1" }));
    const r20 = await put(c, { ...base, expenses: twenty });
    expect(r20.status).toBe(200);
    expect(r20.body.totals.expensesTotal).toBe("20.00");
    const r21 = await put(c, { ...base, expenses: [...twenty, { label: "Cat 21", amount: "1" }] });
    expect(r21.status).toBe(400);
    // 20 customs still there after the failed 21st
    expect((await c.get(`/api/pf/period?kind=month&month=2027-07`)).body.expenses.filter((e: { isCustom: boolean }) => e.isCustom).length).toBe(20);
  });

  it("custom label with empty/unentered amount is kept; customs belong to one period only", async () => {
    const { c } = await newUser("pf3b");
    await put(c, { kind: "month", month: "2027-08", income: "10", expenses: [{ label: "Zoo", amount: null }, { label: "Kite", amount: "3" }] });
    const a = (await c.get("/api/pf/period?kind=month&month=2027-08")).body;
    console.log("custom with null amount ->", JSON.stringify(a.expenses.filter((e: { isCustom: boolean }) => e.isCustom)));
    const b = (await c.get("/api/pf/period?kind=month&month=2027-09")).body;
    expect(b.expenses.filter((e: { isCustom: boolean }) => e.isCustom)).toEqual([]);
  });

  it("hostile labels are stored verbatim (XSS/SQLi/emoji) and returned as JSON data", async () => {
    const { c } = await newUser("pf3x");
    const labels = [`<script>alert(1)</script>`, `Robert'); DROP TABLE pf.period;--`, `"; --`, `😀 Café ñ`, `{{7*7}}`, `%s %n`];
    const r = await put(c, { kind: "month", month: "2027-10", income: "1", expenses: labels.map((label) => ({ label, amount: "1" })) });
    expect(r.status).toBe(200);
    expect(r.body.expenses.filter((e: { isCustom: boolean }) => e.isCustom).map((e: { label: string }) => e.label)).toEqual(labels);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
    const again = await c.get("/api/pf/period?kind=month&month=2027-10");
    expect(again.body.expenses.filter((e: { isCustom: boolean }) => e.isCustom).map((e: { label: string }) => e.label)).toEqual(labels);
  });

  it("strict body: unknown keys, bad keys, duplicate default keys, key+label mismatch, huge arrays", async () => {
    const { c } = await newUser("pf3s");
    const base = { kind: "month", month: "2027-11", income: "5" };
    expect((await put(c, { ...base, extra: 1, expenses: [] })).status).toBe(400);
    expect((await put(c, { ...base, expenses: [{ key: "nonsense", amount: "1" }] })).status).toBe(400);
    expect((await put(c, { ...base, expenses: [{ key: "housing", amount: "1" }, { key: "housing", amount: "2" }] })).status).toBe(400);
    expect((await put(c, { ...base, expenses: [{ key: "housing", amount: "1", foo: 1 }] })).status).toBe(400);
    const mism = await put(c, { ...base, expenses: [{ key: "housing", label: "Something else", amount: "1" }] });
    console.log("key+label mismatch ->", mism.status, JSON.stringify(mism.body.expenses?.[0]));
    const huge = await put(c, { ...base, expenses: Array.from({ length: 500 }, (_, i) => ({ label: `L${i}`, amount: "1" })) });
    expect(huge.status).toBe(400);
    expect((await put(c, { ...base })).status, "expenses omitted").toBeLessThan(500);
    expect((await put(c, { kind: "month", month, expenses: [] })).status, "income omitted").toBeLessThan(500);
    expect((await put(c, {})).status).toBe(400);
    expect((await put(c, { kind: "month", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "month", month, start: "2026-09-01", end: "2026-09-30", income: "1", expenses: [] })).status).toBe(400);
  });
});

describe("C4 periods are independent; delete cascades", () => {
  it("saving A never changes B; delete A leaves B; deleted A comes back empty", async () => {
    const { c } = await newUser("pf4");
    const a = { kind: "month", month: "2027-01", income: "1000", expenses: [{ key: "housing", amount: "100" }, { label: "Pets", amount: "50" }] };
    const b = { kind: "month", month: "2027-02", income: "2000", expenses: [{ key: "food_dining", amount: "300" }] };
    await put(c, a);
    const bRes = await put(c, b);
    const bBefore = (await c.get("/api/pf/period?kind=month&month=2027-02")).body;
    await put(c, { ...a, income: "1", expenses: [{ key: "housing", amount: "1" }, { label: "Dogs", amount: "2" }] });
    const bAfter = (await c.get("/api/pf/period?kind=month&month=2027-02")).body;
    expect(bAfter).toEqual(bBefore);
    expect(bAfter.updatedAt).toBe(bRes.body.updatedAt);
    // custom in A does not leak into B
    expect(bAfter.expenses.some((e: { label: string }) => e.label === "Dogs" || e.label === "Pets")).toBe(false);
    const list = (await c.get("/api/pf/periods")).body as { start: string; hasData: boolean }[];
    expect(list.map((p) => p.start)).toEqual(["2027-02-01", "2027-01-01"]); // newest first
    expect(list.every((p) => p.hasData)).toBe(true);
    expect((await c.del("/api/pf/period?kind=month&month=2027-01")).status).toBe(204);
    expect((await c.get("/api/pf/period?kind=month&month=2027-01")).body.exists).toBe(false);
    expect((await c.get("/api/pf/period?kind=month&month=2027-01")).body.expenses.filter((e: { isCustom: boolean }) => e.isCustom)).toEqual([]);
    expect((await c.get("/api/pf/period?kind=month&month=2027-02")).body).toEqual(bBefore);
    expect((await c.del("/api/pf/period?kind=month&month=2027-01")).status).toBe(404);
    expect((await c.del("/api/pf/period")).status).toBe(400);
    // re-create after delete works (cascade left no orphans blocking the unique index)
    expect((await put(c, a)).status).toBe(200);
  });

  it("custom period vs month: whole-month custom range normalises to the month record; other ranges are separate records", async () => {
    const { c } = await newUser("pf5");
    await put(c, { kind: "month", month: "2027-03", income: "500", expenses: [{ key: "housing", amount: "5" }] });
    const same = await c.get("/api/pf/period?kind=custom&start=2027-03-01&end=2027-03-31");
    expect(same.status).toBe(200);
    expect(same.body.period.kind).toBe("month");
    expect(same.body.exists).toBe(true);
    expect(same.body.income).toBe("500.00");
    const partial = await put(c, { kind: "custom", start: "2027-03-05", end: "2027-03-20", income: "77", expenses: [] });
    expect(partial.status).toBe(200);
    expect(partial.body.period).toEqual({ kind: "custom", start: "2027-03-05", end: "2027-03-20" });
    expect((await c.get("/api/pf/period?kind=month&month=2027-03")).body.income).toBe("500.00");
    const list = (await c.get("/api/pf/periods")).body;
    expect(list.length).toBe(2);
    // PUT custom==whole month updates the month record (no duplicate row)
    await put(c, { kind: "custom", start: "2027-03-01", end: "2027-03-31", income: "600", expenses: [] });
    expect((await c.get("/api/pf/periods")).body.length).toBe(2);
    expect((await c.get("/api/pf/period?kind=month&month=2027-03")).body.income).toBe("600.00");
    // Feb non-leap / leap normalisation
    await put(c, { kind: "custom", start: "2028-02-01", end: "2028-02-29", income: "1", expenses: [] });
    expect((await c.get("/api/pf/period?kind=month&month=2028-02")).body.exists).toBe(true);
    // custom validation on PUT
    expect((await put(c, { kind: "custom", start: "2027-03-20", end: "2027-03-05", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "custom", start: "2027-01-01", end: "2028-01-02", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "custom", start: "2027-01-01", end: "2027-12-31", income: "1", expenses: [] })).status).toBe(200);
    expect((await put(c, { kind: "custom", start: "2027-02-30", end: "2027-03-01", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "custom", start: "1989-12-31", end: "1990-01-05", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "custom", start: "2100-12-30", end: "2101-01-02", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "month", month: "1989-12", income: "1", expenses: [] })).status).toBe(400);
    expect((await put(c, { kind: "month", month: "2101-01", income: "1", expenses: [] })).status).toBe(400);
  });

  it("PUT replaces the whole period: omitted defaults become 'not entered'", async () => {
    const { c } = await newUser("pf6");
    await put(c, { kind: "month", month: "2027-04", income: "10", expenses: [{ key: "housing", amount: "1" }, { key: "other", amount: "2" }] });
    const r = await put(c, { kind: "month", month: "2027-04", income: "10", expenses: [{ key: "housing", amount: "9" }] });
    const other = r.body.expenses.find((e: { key: string }) => e.key === "other");
    expect(other.amount).toBeNull();
    expect(r.body.totals.expensesTotal).toBe("9.00");
  });

  it("concurrent first saves of the same new period do not 500 (unique-index race)", async () => {
    const { c } = await newUser("pf7");
    const rs = await Promise.all(
      Array.from({ length: 8 }, (_, i) => put(c, { kind: "month", month: "2027-05", income: String(100 + i), expenses: [{ label: `X${i}`, amount: "1" }] })),
    );
    console.log("concurrent PUT statuses:", rs.map((r) => r.status).join(","));
    expect(rs.every((r) => r.status === 200), "all concurrent upserts succeed").toBe(true);
    const list = (await c.get("/api/pf/periods")).body;
    expect(list.length).toBe(1);
  });
});

describe("C6 CSRF on state-changing PF routes", () => {
  it("PUT / DELETE with a foreign Origin -> 403 and nothing saved", async () => {
    const { c } = await newUser("pf8");
    const body = { kind: "month", month: "2027-06", income: "1", expenses: [] };
    expect((await c.put("/api/pf/period", body, { origin: "https://evil.example" })).status).toBe(403);
    expect((await c.put("/api/pf/period", body, { noOrigin: true, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await c.req("PUT", "/api/pf/period", { raw: JSON.stringify(body), contentType: "text/plain" })).status).toBe(415);
    expect((await c.del("/api/pf/period?kind=month&month=2027-06", { origin: "https://evil.example" })).status).toBe(403);
    expect((await c.get("/api/pf/periods")).body).toEqual([]);
  });
});
