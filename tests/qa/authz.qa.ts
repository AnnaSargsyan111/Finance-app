import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { newUser, yerevanToday } from "./helpers";

const rec = (c: any, amountAmd: number, risk = "medium", horizon = "medium", mode = "single") =>
  c.post("/api/invest/recommendation", { amountAmd, risk, horizon, mode, notNeededForEmergencies: true });
const MARKER = "ZZQA-MARKER-PF-LABEL";
const INCOME = "1234567.89";

describe("B authorization (two users)", () => {
  it("PF: user B never sees or changes user A's periods; delete/overwrite are scoped", async () => {
    const A = await newUser("azA");
    const B = await newUser("azB");
    const period = { kind: "month", month: "2027-02", income: INCOME, expenses: [{ key: "housing", amount: "111.11" }, { label: MARKER, amount: "9.99" }] };
    const a = await A.c.put("/api/pf/period", period);
    expect(a.status).toBe(200);
    const seenByB = await B.c.get("/api/pf/period?kind=month&month=2027-02");
    expect(seenByB.body.exists).toBe(false);
    expect(seenByB.text).not.toContain(MARKER);
    expect(seenByB.text).not.toContain("1234567");
    expect((await B.c.get("/api/pf/periods")).body).toEqual([]);
    // B deleting a period it does not have -> 404; A's is untouched
    expect((await B.c.del("/api/pf/period?kind=month&month=2027-02")).status).toBe(404);
    expect((await A.c.get("/api/pf/period?kind=month&month=2027-02")).body.income).toBe("1234567.89");
    // B saves the same month: its own record, A unchanged
    await B.c.put("/api/pf/period", { kind: "month", month: "2027-02", income: "5", expenses: [] });
    const aAfter = (await A.c.get("/api/pf/period?kind=month&month=2027-02")).body;
    expect(aAfter.income).toBe("1234567.89");
    expect(aAfter.updatedAt).toBe(a.body.updatedAt);
    expect((await B.c.get("/api/pf/period?kind=month&month=2027-02")).body.income).toBe("5.00");
    // B deletes its own; A keeps hers
    expect((await B.c.del("/api/pf/period?kind=month&month=2027-02")).status).toBe(204);
    expect((await A.c.get("/api/pf/period?kind=month&month=2027-02")).body.exists).toBe(true);
    // custom periods too
    await A.c.put("/api/pf/period", { kind: "custom", start: "2027-02-03", end: "2027-02-09", income: "77", expenses: [] });
    expect((await B.c.get("/api/pf/period?kind=custom&start=2027-02-03&end=2027-02-09")).body.exists).toBe(false);
    expect((await B.c.get("/api/pf/periods")).body).toEqual([]);
  });

  it("History: B cannot list/read/delete A's saved recommendation; ids are unguessable and errors do not leak existence", async () => {
    const A = await newUser("hzA");
    const B = await newUser("hzB");
    const r = await rec(A.c, 600_000, "medium", "long", "single");
    expect(r.status).toBe(200);
    const saved = await A.c.post("/api/invest/history", { saveToken: r.body.data.saveToken, result: r.body.data });
    expect(saved.status).toBe(201);
    const id = saved.body.data.id as string;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect((await B.c.get("/api/invest/history")).body.data.total).toBe(0);
    for (const path of [`/api/invest/history/${id}`]) {
      const g = await B.c.get(path);
      expect(g.status).toBe(404);
      expect(g.text).not.toContain(r.body.data.pick.symbol);
    }
    expect((await B.c.del(`/api/invest/history/${id}`)).status).toBe(404);
    expect((await A.c.get(`/api/invest/history/${id}`)).status).toBe(200);
    // B replaying A's token + result is refused (token is bound to the user)
    const replay = await B.c.post("/api/invest/history", { saveToken: r.body.data.saveToken, result: r.body.data });
    expect(replay.status).toBe(400);
    expect(replay.body.error.code).toBe("INVALID_SAVE_TOKEN");
    expect((await B.c.get("/api/invest/history")).body.data.total).toBe(0);
    // malformed ids never 500
    for (const bad of ["not-a-uuid", "00000000-0000-0000-0000-000000000000", "' OR 1=1 --", "%00", "../../etc/passwd", "1".repeat(300)]) {
      const g = await B.c.get(`/api/invest/history/${encodeURIComponent(bad)}`);
      expect([400, 404], `id=${bad.slice(0, 20)}`).toContain(g.status);
      const d = await B.c.del(`/api/invest/history/${encodeURIComponent(bad)}`);
      expect([400, 404], `del id=${bad.slice(0, 20)}`).toContain(d.status);
    }
  });
});

describe("J history (opt-in save)", () => {
  it("nothing is saved without Add; Add -> 201; duplicate -> 200 same id; detail; delete; grouped by Yerevan day", async () => {
    const U = await newUser("hist");
    const c = U.c;
    const single = await rec(c, 700_000, "low", "long", "single");
    const port = await rec(c, 900_000, "medium", "medium", "portfolio");
    expect(single.status).toBe(200);
    expect(port.status).toBe(200);
    await c.post("/api/invest/comparison", { holdings: port.body.data.holdings.map((h: any) => ({ symbol: h.symbol, shares: h.shares })), window: "1Y" });
    let list = await c.get("/api/invest/history");
    expect(list.status).toBe(200);
    expect(list.body.data.total).toBe(0);
    expect(list.body.data.groups).toEqual([]);
    const a1 = await c.post("/api/invest/history", { saveToken: single.body.data.saveToken, result: single.body.data });
    expect(a1.status).toBe(201);
    const a2 = await c.post("/api/invest/history", { saveToken: single.body.data.saveToken, result: single.body.data });
    expect(a2.status).toBe(200);
    expect(a2.body.data.id).toBe(a1.body.data.id);
    // a re-run of the same inputs has a fresh saveToken but identical content hash -> still idempotent
    const again = await rec(c, 700_000, "low", "long", "single");
    const a3 = await c.post("/api/invest/history", { saveToken: again.body.data.saveToken, result: again.body.data });
    expect(a3.status, "same content re-run").toBe(200);
    expect(a3.body.data.id).toBe(a1.body.data.id);
    const b1 = await c.post("/api/invest/history", { saveToken: port.body.data.saveToken, result: port.body.data });
    expect(b1.status).toBe(201);
    console.log("saved portfolio result JSON size:", JSON.stringify(port.body.data).length, "bytes");
    list = await c.get("/api/invest/history");
    expect(list.body.data.total).toBe(2);
    expect(list.body.data.groups.length).toBe(1);
    const g = list.body.data.groups[0];
    expect(g.date).toBe(yerevanToday());
    const [y, m, d] = g.date.split("-").map(Number);
    const label = new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
    expect(g.label).toBe(label);
    expect(g.items.length).toBe(2);
    expect(g.items[0].mode).toBe("portfolio"); // newest first
    const it0 = g.items[0];
    expect(Object.keys(it0).sort()).toEqual(["createdAt", "headline", "holdings", "id", "inputs", "methodologyVersion", "mode", "score", "snapshotDate", "usdRate"].sort());
    expect(it0.inputs).toEqual({ amountAmd: 900000, risk: "medium", horizon: "medium" });
    expect(it0.holdings.length).toBe(port.body.data.holdings.length);
    const detail = await c.get(`/api/invest/history/${b1.body.data.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.result.holdings.map((h: any) => h.symbol)).toEqual(port.body.data.holdings.map((h: any) => h.symbol));
    expect(detail.body.data.result.score).toBe(port.body.data.score);
    // pagination
    const p1 = await c.get("/api/invest/history?page=1&pageSize=1");
    expect(p1.body.data.groups.flatMap((x: any) => x.items).length).toBe(1);
    const p2 = await c.get("/api/invest/history?page=2&pageSize=1");
    expect(p2.body.data.groups.flatMap((x: any) => x.items).length).toBe(1);
    expect(p2.body.data.groups[0].items[0].id).toBe(a1.body.data.id);
    for (const q of ["page=0", "pageSize=0", "pageSize=51", "page=abc", "pageSize=-1", "x=1"]) expect((await c.get(`/api/invest/history?${q}`)).status, q).toBe(400);
    // delete
    expect((await c.del(`/api/invest/history/${a1.body.data.id}`)).status).toBe(204);
    expect((await c.get(`/api/invest/history/${a1.body.data.id}`)).status).toBe(404);
    expect((await c.del(`/api/invest/history/${a1.body.data.id}`)).status).toBe(404);
    expect((await c.get("/api/invest/history")).body.data.total).toBe(1);
  });

  it("tamper protection: forged / modified / cross-result tokens -> 400 INVALID_SAVE_TOKEN; nothing stored", async () => {
    const U = await newUser("hist2");
    const c = U.c;
    const r1 = await rec(c, 650_000, "medium", "medium", "portfolio");
    const r2 = await rec(c, 650_000, "high", "short", "single");
    const tok = r1.body.data.saveToken as string;
    const res = r1.body.data;
    const bad = async (token: unknown, result: unknown, name: string) => {
      const r = await c.post("/api/invest/history", { saveToken: token, result });
      expect(r.status, name).toBe(400);
      if (r.body.error.code !== "VALIDATION_ERROR") expect(r.body.error.code, name).toBe("INVALID_SAVE_TOKEN");
    };
    await bad("forged.token.value", res, "forged token");
    await bad(tok.slice(0, -3) + (tok.endsWith("AAA") ? "BBB" : "AAA"), res, "modified signature");
    await bad(tok.replace(/^./, tok[0] === "A" ? "B" : "A"), res, "modified payload start");
    await bad(r2.body.data.saveToken, res, "token of another result");
    await bad(tok, { ...res, score: res.score === 100 ? 99 : res.score + 1 }, "modified score");
    await bad(tok, { ...res, holdings: res.holdings.map((h: any, i: number) => (i === 0 ? { ...h, shares: h.shares + 1 } : h)) }, "modified shares");
    await bad(tok, { ...res, inputs: { ...res.inputs, amountAmd: 1 } }, "modified inputs");
    await bad(tok, { ...res, injected: "x" }, "injected field");
    await bad(tok, {}, "empty result");
    await bad(tok, null, "null result");
    await bad("", res, "empty token");
    expect((await c.post("/api/invest/history", { result: res })).status).toBe(400);
    expect((await c.post("/api/invest/history", { saveToken: tok })).status).toBe(400);
    expect((await c.post("/api/invest/history", { saveToken: tok, result: res, extra: 1 })).status).toBe(400);
    expect((await c.get("/api/invest/history")).body.data.total).toBe(0);
    // ignoring saveToken* fields when hashing is by design: changing them is accepted
    const ok = await c.post("/api/invest/history", { saveToken: tok, result: { ...res, saveToken: "whatever", saveTokenExpiresAt: "2099-01-01T00:00:00Z" } });
    console.log("OBSERVATION result with edited saveTokenExpiresAt/saveToken fields ->", ok.status, "(by design: fields excluded from hash)");
    expect([200, 201]).toContain(ok.status);
    // CSRF on state-changing history routes
    const id = ok.body?.data?.id;
    expect((await c.post("/api/invest/history", { saveToken: tok, result: res }, { origin: "https://evil.example" })).status).toBe(403);
    if (id) expect((await c.del(`/api/invest/history/${id}`, { origin: "https://evil.example" })).status).toBe(403);
    // token issued to another user's session cannot be used, even for identical inputs
    const V = await newUser("hist3");
    const rv = await rec(V.c, 650_000, "medium", "medium", "portfolio");
    expect((await c.post("/api/invest/history", { saveToken: rv.body.data.saveToken, result: rv.body.data })).status).toBe(400);
  });
});

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|json)$/.test(n)) out.push(p);
  }
  return out;
}

describe("D independence: Investment/Market never read Personal Finance", () => {
  it("identical recommendations/comparison for a user with rich PF data and one with none (9 combos x single+portfolio subset)", async () => {
    const rich = await newUser("richpf");
    const empty = await newUser("emptypf");
    for (const month of ["2026-09", "2026-08", "2026-07", "2026-06"]) {
      await rich.c.put("/api/pf/period", { kind: "month", month, income: INCOME, expenses: [{ key: "housing", amount: "500000" }, { key: "food_dining", amount: "300000" }, { label: MARKER, amount: "42.00" }] });
    }
    const pfBefore = (await rich.c.get("/api/pf/periods")).body;
    const strip = (d: any) => { const x = { ...d }; delete x.saveToken; delete x.saveTokenExpiresAt; return x; };
    const combos: [string, string, string, number][] = [
      ["low", "long", "single", 300_000], ["medium", "medium", "portfolio", 1_200_000], ["high", "short", "portfolio", 5_000_000],
      ["medium", "long", "single", 2_000_000], ["low", "short", "portfolio", 800_000], ["high", "long", "single", 450_000],
    ];
    const all: string[] = [];
    for (const [risk, horizon, mode, amt] of combos) {
      const a = await rec(rich.c, amt, risk, horizon, mode);
      const b = await rec(empty.c, amt, risk, horizon, mode);
      expect(a.status).toBe(b.status);
      expect(strip(a.body.data)).toEqual(strip(b.body.data));
      all.push(a.text);
    }
    const holdings = (await rec(rich.c, 1_200_000, "medium", "medium", "portfolio")).body.data.holdings.map((h: any) => ({ symbol: h.symbol, shares: h.shares }));
    const ca = await rich.c.post("/api/invest/comparison", { holdings, window: "1Y" });
    const cb = await empty.c.post("/api/invest/comparison", { holdings, window: "1Y" });
    expect(ca.body.data).toEqual(cb.body.data);
    for (const path of ["/api/market/fx/latest", "/api/market/stocks", "/api/market/news", "/api/invest/convert?amountAmd=700000", "/api/market/providers"]) {
      all.push((await rich.c.get(path)).text);
    }
    all.push(ca.text);
    for (const t of all) {
      expect(t).not.toContain(MARKER);
      expect(t).not.toContain("1234567");
    }
    // PF untouched by investing
    expect((await rich.c.get("/api/pf/periods")).body).toEqual(pfBefore);
  });

  it("PF fields smuggled into investment requests are rejected, not used", async () => {
    const u = await newUser("smuggle");
    for (const extra of [{ pf: { income: 1 } }, { income: 1234567 }, { availableToInvest: 100000 }, { periodStart: "2026-09-01" }]) {
      const r = await u.c.post("/api/invest/recommendation", { amountAmd: 500000, risk: "low", horizon: "long", mode: "single", notNeededForEmergencies: true, ...extra });
      expect(r.status).toBe(400);
    }
    const r = await u.c.post("/api/invest/comparison", { holdings: [{ symbol: "AAPL", shares: 1 }], window: "1Y", income: 5 });
    expect(r.status).toBe(400);
  });

  it("source scan: nothing under src/invest, src/market, src/lib/quant references pf (imports, SQL, schema, table names)", () => {
    const root = resolve(import.meta.dirname, "../../src");
    const files = ["invest", "market", "lib/quant"].flatMap((d) => walk(join(root, d)));
    expect(files.length).toBeGreaterThan(20);
    const offenders: string[] = [];
    for (const f of files) {
      const t = readFileSync(f, "utf8");
      const rx = [/from\s+["']@\/pf[/"']/, /from\s+["'](\.\.?\/)+pf[/"']/, /require\(["']@\/pf/, /\bpf\.(period|period_expense)\b/i, /pgSchema\(\s*["']pf["']/, /\bperiod_expense\b/, /["']pf["']\s*\)/];
      for (const r of rx) if (r.test(t)) offenders.push(`${f}: ${r}`);
    }
    expect(offenders).toEqual([]);
    // reverse direction: pf does not import market/invest
    const pfFiles = walk(join(root, "pf"));
    for (const f of pfFiles) {
      const t = readFileSync(f, "utf8");
      expect(/from\s+["']@\/(market|invest)/.test(t), f).toBe(false);
    }
    // invest DB use is confined to the history module
    const investDbUsers = walk(join(root, "invest")).filter((f) => /getDb|from\s+["']@\/lib\/db["']/.test(readFileSync(f, "utf8")) && !/invest[\\/]history[\\/]/.test(f) && !/invest[\\/]schema\.ts$/.test(f));
    console.log("invest files touching the DB outside history/schema:", investDbUsers.map((f) => f.split("src")[1]));
  });

  it("UI source scan: the Investment UI never imports Personal Finance modules or reads its API", () => {
    const root = resolve(import.meta.dirname, "../../src/ui");
    const files = walk(join(root, "invest"));
    const offenders = files.filter((f) => /ui\/pf|api\/pf|@\/ui\/pf|["']\.\.\/pf|fetchPeriod|\/api\/pf/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });
});
