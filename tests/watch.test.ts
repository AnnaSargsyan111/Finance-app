import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { I, registerUser, type TestUser } from "./helpers/routes";
import { fxHandler, mockFetch, type FetchMock } from "./helpers/fetch-mock";
import { buildSynthetic, seedSynthetic } from "./helpers/synthetic";
import { readLatestSnapshot } from "@/market/read";
import { devOutbox } from "@/auth/email";
import * as watchList from "@/app/api/watch/route";
import * as watchOne from "@/app/api/watch/[recommendationId]/route";
import * as watchCheck from "@/app/api/watch/[recommendationId]/check/route";
import * as watchUnsub from "@/app/api/watch/unsubscribe/route";
import * as watchJob from "@/app/api/watch/job/route";
import { compareViews, THRESHOLDS } from "@/watch/diff";
import { renderWatchEmail } from "@/watch/template";
import { signUnsubscribeToken, verifyUnsubscribeToken } from "@/watch/token";
import { viewFromSaved, type StockView, type WatchView } from "@/watch/view";

let mock: FetchMock;
const RATE = 363.44;
const body = (over: Record<string, unknown> = {}) => ({ amountAmd: Math.round(4000 * RATE), risk: "medium", horizon: "long", mode: "single", notNeededForEmergencies: true, ...over });

const stock = (over: Partial<StockView> = {}): StockView => ({
  symbol: "ABC",
  name: "Alpha Beta Corp",
  price: 100,
  shares: 10,
  costUsd: 1000,
  costAmd: 363_440,
  cashUsd: 50,
  cashAmd: 18_172,
  positionUsd: null,
  score: 70.4,
  fits: true,
  vol1y: 0.2,
  maxDD1y: 0.15,
  drivers: [{ label: "Return on equity", value: "20.0%", rawValue: 0.2, topPercent: 25 }],
  ...over,
});
const view = (stocks: StockView[], over: Partial<WatchView> = {}): WatchView => ({
  mode: "single",
  asOf: "2026-09-18",
  risk: "medium",
  horizon: "long",
  amountAmd: 400_000,
  budgetUsd: 1100,
  usdRate: "363.44",
  stocks,
  totalUsd: null,
  ...over,
});

describe("comparing two views", () => {
  it("identical views: every row unchanged, nothing meaningful", () => {
    const c = compareViews(view([stock()]), view([stock()]));
    expect(c.changedCount).toBe(0);
    expect(c.meaningful).toBe(false);
    expect(c.stocks[0].rows.map((r) => r.label)).toContain("Price per share");
    expect(c.stocks[0].rows.every((r) => !r.changed)).toBe(true);
  });

  it("small moves change the text but are not worth an email; big ones are", () => {
    const small = compareViews(view([stock()]), view([stock({ price: 101, score: 70.6 })]));
    expect(small.changedCount).toBeGreaterThan(0);
    expect(small.meaningful).toBe(false);
    const price = compareViews(view([stock()]), view([stock({ price: 100 * (1 + THRESHOLDS.price) + 1 })]));
    expect(price.meaningful).toBe(true);
    expect(compareViews(view([stock()]), view([stock({ score: 75 })])).meaningful).toBe(true);
    expect(compareViews(view([stock()]), view([stock({ vol1y: 0.25 })])).meaningful).toBe(true);
    expect(compareViews(view([stock()]), view([stock({ fits: false })])).meaningful).toBe(true);
    const driver = { label: "Return on equity", value: "12.0%", rawValue: 0.12, topPercent: 40 };
    expect(compareViews(view([stock()]), view([stock({ drivers: [driver] })])).meaningful).toBe(true);
  });

  it("a stock that vanished from the data is reported as not available", () => {
    const c = compareViews(view([stock()]), view([]));
    const price = c.stocks[0].rows.find((r) => r.key === "price")!;
    expect(price.next).toBe("not available");
    expect(c.meaningful).toBe(true);
  });

  it("portfolio: whole-portfolio value is compared too", () => {
    const a = view([stock({ positionUsd: 1000 })], { mode: "portfolio", totalUsd: 1000 });
    const b = view([stock({ positionUsd: 1100, price: 110 })], { mode: "portfolio", totalUsd: 1100 });
    const c = compareViews(a, b);
    expect(c.total?.changed).toBe(true);
    expect(c.total?.meaningful).toBe(true);
  });
});

describe("the email", () => {
  const prev = view([stock()]);
  const next = view([stock({ price: 110, score: 72 })], { asOf: "2026-09-25" });
  const mail = (test = false) => renderWatchEmail({ firstName: "Anna", prev, next, comparison: compareViews(prev, next), test, manageUrl: "http://localhost:3000/invest/history", unsubscribeUrl: "http://localhost:3000/api/watch/unsubscribe?t=x" });

  it("follows the template: greeting, sentence with the stock name, Parameters, previous and new, (unchanged), footer with the phone", () => {
    const m = mail();
    expect(m.subject).toBe('Changes to your "Alpha Beta Corp" stock parameters');
    for (const part of [m.text, m.html]) {
      expect(part).toContain("Dear Anna,");
      expect(part).toContain("Changes have been made to the parameters for your");
      expect(part).toContain("Alpha Beta Corp");
      expect(part).toContain("Parameters");
      expect(part).toContain("$100.00");
      expect(part).toContain("$110.00");
      expect(part).toContain("(unchanged)");
      expect(part).toContain("(+374) 77731713");
    }
    expect(m.text).toContain('Changes have been made to the parameters for your "Alpha Beta Corp" stock.');
    expect(m.html).toContain("Finova");
    expect(m.html).toContain("Stop these emails");
  });

  it("escapes names in the HTML and marks a test send", () => {
    const evil = view([stock({ name: '<img src=x onerror="1"> & Co' })]);
    const m = renderWatchEmail({ firstName: "<b>A</b>", prev: evil, next: evil, comparison: compareViews(evil, evil), test: true, manageUrl: "m", unsubscribeUrl: "u" });
    expect(m.html).not.toContain("<img");
    expect(m.html).not.toContain("<b>A</b>");
    expect(m.subject.startsWith("[Test] ")).toBe(true);
    expect(m.html).toContain("This is a test email");
    expect(m.text).toContain("No parameters have changed");
  });
});

describe("unsubscribe token", () => {
  it("round-trips, and rejects tampering", () => {
    const id = "6f1c2b6e-0d3a-4f55-9f43-7a1f2e3d4c5b";
    const t = signUnsubscribeToken(id);
    expect(verifyUnsubscribeToken(t)).toBe(id);
    expect(verifyUnsubscribeToken(t.slice(0, -2) + "xx")).toBeNull();
    expect(verifyUnsubscribeToken("a.b.c")).toBeNull();
    expect(verifyUnsubscribeToken("")).toBeNull();
    const [p] = t.split(".");
    expect(verifyUnsubscribeToken(`${p}.AAAA`)).toBeNull();
  });
});

describe("end to end: switch on, test email, scheduled job, unsubscribe", () => {
  let A: TestUser;
  let B: TestUser;
  let singleId = "";
  let portfolioId = "";
  let symbol = "";

  beforeAll(async () => {
    await useTestDb();
    mock = mockFetch(fxHandler());
    await seedSynthetic(buildSynthetic());
    A = await registerUser("watchA");
    B = await registerUser("watchB");
    const save = async (mode: "single" | "portfolio") => {
      const rec = (await call(I.recommendationRoute.POST, "POST", "/api/invest/recommendation", { json: body({ mode, amountAmd: Math.round((mode === "single" ? 4000 : 9000) * RATE) }), jar: A.jar })).body.data;
      const saved = await call(I.historyListRoute.POST, "POST", "/api/invest/history", { json: { saveToken: rec.saveToken, result: rec }, jar: A.jar });
      expect(saved.status).toBe(201);
      if (mode === "single") symbol = rec.pick.symbol;
      return saved.body.data.id as string;
    };
    singleId = await save("single");
    portfolioId = await save("portfolio");
  });
  afterAll(() => mock.restore());

  const put = (u: TestUser | null, id: string, enabled: unknown) => call(watchOne.PUT, "PUT", `/api/watch/${id}`, { json: { enabled }, jar: u?.jar, params: { recommendationId: id } });
  const test = (u: TestUser | null, id: string) => call(watchCheck.POST, "POST", `/api/watch/${id}/check`, { jar: u?.jar, params: { recommendationId: id } });
  const ids = async (u: TestUser) => (await call(watchList.GET, "GET", "/api/watch", { jar: u.jar })).body.data.ids as string[];

  it("needs a session; only the owner can switch a recommendation on; strict body", async () => {
    expect((await put(null, singleId, true)).status).toBe(401);
    expect((await put(B, singleId, true)).status).toBe(404);
    expect((await put(A, "not-a-uuid", true)).status).toBe(404);
    expect((await put(A, singleId, "yes")).status).toBe(400);
    expect(await ids(B)).toEqual([]);
  });

  it("switch on is idempotent and listed; off removes it", async () => {
    expect((await put(A, singleId, true)).status).toBe(200);
    expect((await put(A, singleId, true)).status).toBe(200);
    expect(await ids(A)).toEqual([singleId]);
    expect((await put(A, portfolioId, true)).status).toBe(200);
    expect((await put(A, portfolioId, false)).status).toBe(200);
    expect(await ids(A)).toEqual([singleId]);
    expect((await put(A, portfolioId, true)).status).toBe(200);
  });

  it("the test email goes to the user's own address only, with every parameter unchanged on unchanged data", async () => {
    expect((await test(B, singleId)).status).toBe(404);
    devOutbox.length = 0;
    const r = await test(A, singleId);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(r.body.data).toMatchObject({ sent: true, to: A.email.toLowerCase() });
    expect(devOutbox).toHaveLength(1);
    const m = devOutbox[0];
    expect(m.to).toBe(A.email.toLowerCase());
    expect(m.html).toContain("(unchanged)");
    expect(m.html).toContain(symbol);
    expect(r.body.data.changedCount, "saved values and the same snapshot must agree").toBe(0);
  });

  it("test email for a portfolio lists every holding and the portfolio value", async () => {
    devOutbox.length = 0;
    const r = await test(A, portfolioId);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(devOutbox[0].text).toContain("Value of your portfolio");
    expect(devOutbox[0].subject).toBe("[Test] Changes to the stocks in your portfolio");
  });

  it("test sends are limited to 5 per hour", async () => {
    let last = 200;
    for (let i = 0; i < 6; i++) last = (await test(A, singleId)).status;
    expect(last).toBe(429);
  });

  it("the job needs the cron secret", async () => {
    expect((await call(watchJob.POST, "POST", "/api/watch/job")).status).toBe(403);
  });

  it("job: nothing changed -> no email; after the data moves -> one email, then quiet again", async () => {
    process.env.CRON_SECRET = "cron-secret-for-tests-0123456789";
    const runJob = () => call(watchJob.POST, "POST", "/api/watch/job", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
    devOutbox.length = 0;
    const quiet = await runJob();
    expect(quiet.status, JSON.stringify(quiet.body)).toBe(200);
    expect(quiet.body.result).toMatchObject({ checked: 2, sent: 0, unchanged: 2, failed: 0 });
    expect(devOutbox).toHaveLength(0);

    const snap = await readLatestSnapshot();
    const rec = snap!.payload.records.find((r) => r.symbol === symbol)!;
    const oldPrice = rec.price;
    rec.price = (oldPrice ?? 100) * 1.2; // the snapshot object is memoised: restore afterwards
    try {
      const moved = await runJob();
      expect(moved.body.result.sent).toBeGreaterThanOrEqual(1);
      const toSingle = devOutbox.filter((m) => m.html?.includes(symbol) && !m.subject.startsWith("[Test]"));
      expect(toSingle.length).toBeGreaterThanOrEqual(1);
      expect(toSingle[0].to).toBe(A.email.toLowerCase());
      expect(toSingle[0].text).toMatch(/->/);
      const sent = devOutbox.length;
      const again = await runJob();
      expect(again.body.result.sent).toBe(0); // the new values are now the baseline
      expect(devOutbox).toHaveLength(sent);
    } finally {
      rec.price = oldPrice;
    }
  });

  it("the Stop link switches that one watch off without a session", async () => {
    const db = await getDb();
    const row = (await db.execute(sql`select id from watch.recommendation_watch where recommendation_id = ${singleId}`)).rows[0] as { id: string };
    const t = signUnsubscribeToken(row.id);
    const bad = await call(watchUnsub.GET, "GET", "/api/watch/unsubscribe?t=nope");
    expect(bad.status).toBe(400);
    const ok = await call(watchUnsub.GET, "GET", `/api/watch/unsubscribe?t=${t}`);
    expect(ok.status).toBe(200);
    expect(await ids(A)).toEqual([portfolioId]);
  });

  it("deleting nothing else is touched: removing the saved recommendation is not blocked by a watch", async () => {
    const del = await call(I.historyItemRoute.DELETE, "DELETE", `/api/invest/history/${portfolioId}`, { jar: A.jar, params: { id: portfolioId } });
    expect(del.status).toBe(204);
  });
});
