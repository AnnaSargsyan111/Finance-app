import { describe, it, expect } from "vitest";
import { Client, newUser, anon, uid, fakeIp, PASSWORD, logAccount } from "./helpers";
import { waitResetToken, resetTokens, sleep } from "./devlog";

const ok = (s: string) => `qa.${s}.${uid()}@example.test`;

describe("A1 sign-up", () => {
  it("happy path: 201, user object, HttpOnly session cookie, no password/hash in body", async () => {
    const c = new Client();
    const email = ok("su");
    const r = await c.post("/api/auth/sign-up", { firstName: "  Ann ", lastName: "Sargsyan", email: email.toUpperCase(), password: PASSWORD });
    logAccount(email, "signup happy");
    expect(r.status).toBe(201);
    expect(r.body.user.email).toBe(email); // lower-cased
    expect(r.body.user.firstName).toBe("Ann"); // trimmed
    expect(Object.keys(r.body.user).sort()).toEqual(["email", "firstName", "id", "lastName"]);
    expect(r.text).not.toMatch(/hash|scrypt|password/i);
    const ck = r.setCookies.join("\n");
    expect(ck).toMatch(/fa\.session_token=/);
    expect(ck).toMatch(/HttpOnly/i);
    expect(ck).toMatch(/SameSite=Lax/i);
    expect(ck).toMatch(/Path=\//);
    const s = await c.get("/api/auth/session"); // auto-login
    expect(s.status).toBe(200);
    expect(s.body.user.email).toBe(email);
    expect(s.text).not.toMatch(/hash|scrypt|passw/i);
  });

  it("required fields / names / email / unknown fields", async () => {
    const c = anon();
    const base = { firstName: "A", lastName: "B", email: ok("v"), password: PASSWORD };
    for (const [k, v] of [
      ["firstName", ""],
      ["firstName", "   "],
      ["firstName", "x".repeat(61)],
      ["lastName", ""],
      ["lastName", "y".repeat(61)],
      ["email", ""],
      ["email", "not-an-email"],
      ["email", "a@b"],
      ["email", "a b@example.test"],
      ["email", "@example.test"],
      ["email", `${"a".repeat(250)}@example.test`],
    ] as const) {
      const r = await c.post("/api/auth/sign-up", { ...base, email: ok("v"), [k]: v });
      expect(r.status, `${k}=${String(v).slice(0, 20)}`).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
      expect(Object.keys(r.body.error.fields ?? {}), `${k}`).toContain(k);
    }
    for (const k of ["firstName", "lastName", "email", "password"]) {
      const b: Record<string, unknown> = { ...base, email: ok("v") };
      delete b[k];
      expect((await c.post("/api/auth/sign-up", b)).status, `missing ${k}`).toBe(400);
    }
    expect((await c.post("/api/auth/sign-up", { ...base, email: ok("v"), role: "admin" })).status).toBe(400);
    expect((await c.post("/api/auth/sign-up", { ...base, email: ok("v"), emailVerified: true })).status).toBe(400);
  });

  it("60-char names accepted; 128-char password accepted; 129 rejected", async () => {
    const e1 = ok("lim");
    const r = await anon().post("/api/auth/sign-up", { firstName: "n".repeat(60), lastName: "m".repeat(60), email: e1, password: "Aa1!" + "x".repeat(124) });
    logAccount(e1, "limits");
    expect(r.status).toBe(201);
    const r2 = await anon().post("/api/auth/sign-up", { firstName: "n", lastName: "m", email: ok("lim2"), password: "Aa1!" + "x".repeat(125) });
    expect(r2.status).toBe(400);
    expect(r2.body.error.fields.password).toBeTruthy();
  });

  it("each password rule fails individually with a field error; password never echoed", async () => {
    const cases: [string, string][] = [
      ["short", "Aa1!aaa"],
      ["no upper", "aa1!aaaaa"],
      ["no lower", "AA1!AAAAA"],
      ["no number", "Aa!aaaaaa"],
      ["no symbol", "Aa1aaaaaa"],
      ["space is not a symbol", "Aa1 aaaaa"],
    ];
    for (const [name, pw] of cases) {
      const r = await anon().post("/api/auth/sign-up", { firstName: "A", lastName: "B", email: ok("pw"), password: pw });
      expect(r.status, name).toBe(400);
      expect(r.body.error.fields.password, name).toBeTruthy();
      expect(r.text).not.toContain(pw);
    }
    const email = ok("pw");
    logAccount(email, "min valid password");
    expect((await anon().post("/api/auth/sign-up", { firstName: "A", lastName: "B", email, password: "Aa1!aaaa" })).status).toBe(201);
  });

  it("duplicate email -> 409 EMAIL_TAKEN (case-insensitive), generic wording, no cookie", async () => {
    const u = await newUser("dup");
    const r = await anon().post("/api/auth/sign-up", { firstName: "X", lastName: "Y", email: u.email.toUpperCase(), password: PASSWORD });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe("EMAIL_TAKEN");
    expect(r.setCookies.length).toBe(0);
  });

  it("CSRF / content-type: wrong Origin 403, cross-site fetch metadata 403, non-JSON 415, bad JSON 400, huge body rejected", async () => {
    const body = { firstName: "A", lastName: "B", email: ok("csrf"), password: PASSWORD };
    const evil = await anon().post("/api/auth/sign-up", body, { origin: "https://evil.example" });
    expect(evil.status).toBe(403);
    expect(evil.body.error.code).toBe("CSRF_ORIGIN_MISMATCH");
    expect((await anon().post("/api/auth/sign-up", body, { noOrigin: true, headers: { "sec-fetch-site": "cross-site" } })).status).toBe(403);
    expect((await anon().post("/api/auth/sign-up", body, { origin: "null" })).status).toBe(403);
    expect((await anon().req("POST", "/api/auth/sign-up", { raw: "firstName=A", contentType: "application/x-www-form-urlencoded" })).status).toBe(415);
    expect((await anon().req("POST", "/api/auth/sign-up", { raw: JSON.stringify(body), contentType: "text/plain" })).status).toBe(415);
    expect((await anon().req("POST", "/api/auth/sign-up", { raw: "{not json" })).status).toBe(400);
    const big = await anon().req("POST", "/api/auth/sign-up", { raw: JSON.stringify({ ...body, firstName: "x".repeat(200_000) }) });
    expect([400, 413]).toContain(big.status);
  });
});

describe("A2 sign-in", () => {
  it("identical response for unknown email vs wrong password (no enumeration)", async () => {
    const u = await newUser("si");
    const a = await new Client().post("/api/auth/sign-in", { email: u.email, password: "Wrong!Pass1x" });
    const b = await new Client().post("/api/auth/sign-in", { email: ok("nobody"), password: "Wrong!Pass1x" });
    expect(a.status).toBe(401);
    expect(b.status).toBe(401);
    expect(a.body).toEqual(b.body);
    expect(a.body.error.code).toBe("INVALID_CREDENTIALS");
    expect(a.setCookies.length + b.setCookies.length).toBe(0);
  });

  it("timing side channel (informational): unknown vs known email latency", async () => {
    const u = await newUser("tm");
    const time = async (email: string) => {
      const t = performance.now();
      await new Client().post("/api/auth/sign-in", { email, password: "Wrong!Pass1x" });
      return performance.now() - t;
    };
    const known: number[] = [];
    const unknown: number[] = [];
    for (let i = 0; i < 3; i++) {
      known.push(await time(u.email));
      unknown.push(await time(ok("tmx")));
    }
    const med = (a: number[]) => [...a].sort((x, y) => x - y)[1];
    console.log(`TIMING sign-in wrong password: known median ${med(known).toFixed(0)}ms vs unknown median ${med(unknown).toFixed(0)}ms`);
    expect(true).toBe(true);
  });

  it("success, e-mail case-insensitive, malformed/unknown-field bodies", async () => {
    const u = await newUser("si2");
    const c = new Client();
    expect((await c.post("/api/auth/sign-in", { email: u.email.toUpperCase(), password: u.password })).status).toBe(200);
    expect(c.hasCookie()).toBe(true);
    expect((await c.post("/api/auth/sign-in", { email: u.email })).status).toBe(400);
    expect((await c.post("/api/auth/sign-in", { email: u.email, password: u.password, extra: 1 })).status).toBe(400);
  });

  it("brute force: 5 failures -> 401, 6th attempt -> 429 + Retry-After, even with the CORRECT password", async () => {
    const u = await newUser("bf");
    const c = new Client(fakeIp());
    for (let i = 1; i <= 5; i++) {
      expect((await c.post("/api/auth/sign-in", { email: u.email, password: "Wrong!Pass" + i })).status, `attempt ${i}`).toBe(401);
    }
    const sixth = await c.post("/api/auth/sign-in", { email: u.email, password: "Wrong!Pass6" });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RATE_LIMITED");
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await c.post("/api/auth/sign-in", { email: u.email, password: u.password })).status).toBe(429);
    expect(c.hasCookie()).toBe(false);
    const other = new Client(fakeIp());
    const r = await other.post("/api/auth/sign-in", { email: u.email, password: u.password });
    console.log("OBSERVATION lockout keyed by (email, X-Forwarded-For IP): same account from another XFF value ->", r.status);
  });

  it("limiter also counts UNKNOWN emails (no enumeration via 429)", async () => {
    const email = ok("ghost");
    const c = new Client(fakeIp());
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) seen.push((await c.post("/api/auth/sign-in", { email, password: "Wrong!Pass1" })).status);
    expect(seen).toEqual([401, 401, 401, 401, 401, 429]);
  });

  it("session cookie flags", async () => {
    const u = await newUser("ck");
    const ck = u.res.setCookies.find((s) => s.startsWith("fa.session_token"))!;
    expect(ck).toMatch(/HttpOnly/i);
    expect(ck).toMatch(/SameSite=Lax/i);
    expect(ck).toMatch(/Max-Age=604800/);
    console.log("COOKIE (dev, http):", ck.replace(/=[^;]+/, "=<token>"));
  });
});

describe("A3 logout / session invalidation", () => {
  it("sign-out revokes the session server-side: replaying the old cookie -> 401", async () => {
    const u = await newUser("lo");
    const stolen = u.c.cookieHeader()!;
    expect((await u.c.get("/api/pf/periods")).status).toBe(200);
    const out = await u.c.post("/api/auth/sign-out");
    expect(out.status).toBe(204);
    expect(out.setCookies.join(";")).toMatch(/fa\.session_token=;|Max-Age=0/i);
    expect((await anon().get("/api/auth/session", { headers: { cookie: stolen } })).status).toBe(401);
    expect((await anon().get("/api/pf/periods", { headers: { cookie: stolen } })).status).toBe(401);
    expect((await anon().post("/api/auth/sign-out", undefined, { headers: { cookie: stolen } })).status).toBe(204);
    expect((await anon().post("/api/auth/sign-out")).status).toBe(204);
  });

  it("tampered / garbage cookies -> 401", async () => {
    const u = await newUser("tc");
    const good = u.c.cookieHeader()!;
    const name = good.split("=")[0];
    const val = good.slice(good.indexOf("=") + 1);
    for (const cookie of [
      `${name}=garbage`,
      `${name}=${val.slice(0, -4)}AAAA`,
      `${name}=${val.split(".")[0]}`,
      `${name}=${val.split(".")[0]}.${"A".repeat(44)}`,
      `${name}=`,
      `other=1`,
    ]) {
      expect((await anon().get("/api/auth/session", { headers: { cookie } })).status, cookie.slice(0, 40)).toBe(401);
    }
    expect((await u.c.get("/api/auth/session")).status).toBe(200);
  });

  it("sessions are independent: sign-out of one keeps the other", async () => {
    const u = await newUser("ind");
    const c2 = new Client();
    expect((await c2.post("/api/auth/sign-in", { email: u.email, password: u.password })).status).toBe(200);
    await u.c.post("/api/auth/sign-out");
    expect((await c2.get("/api/auth/session")).status).toBe(200);
  });
});

const ROUTES: [string, string, unknown?][] = [
  ["GET", "/api/auth/session"],
  ["GET", "/api/pf/periods"],
  ["GET", "/api/pf/period"],
  ["PUT", "/api/pf/period", { kind: "month", month: "2026-09", income: "1", expenses: [] }],
  ["DELETE", "/api/pf/period?kind=month&month=2026-09"],
  ["GET", "/api/market/fx/latest"],
  ["GET", "/api/market/fx/history?pair=USD/AMD&days=30"],
  ["GET", "/api/market/news"],
  ["POST", "/api/market/news/refresh", {}],
  ["GET", "/api/market/news/0123456789abcdef"],
  ["GET", "/api/market/stocks"],
  ["GET", "/api/market/stocks/NVDA/history?range=1m"],
  ["GET", "/api/market/providers"],
  ["GET", "/api/invest/convert?amountAmd=500000"],
  ["POST", "/api/invest/recommendation", { amountAmd: 500000, risk: "low", horizon: "long", mode: "single", notNeededForEmergencies: true }],
  ["POST", "/api/invest/comparison", { holdings: [{ symbol: "AAPL", shares: 1 }], window: "1Y" }],
  ["POST", "/api/invest/history", { saveToken: "x", result: {} }],
  ["GET", "/api/invest/history"],
  ["GET", "/api/invest/history/00000000-0000-0000-0000-000000000000"],
  ["DELETE", "/api/invest/history/00000000-0000-0000-0000-000000000000"],
];

describe("A4 every data route requires a session", () => {
  it("no cookie -> 401 UNAUTHENTICATED", async () => {
    for (const [m, p, b] of ROUTES) {
      const r = await anon().req(m, p, b !== undefined ? { json: b } : {});
      expect(r.status, `${m} ${p}`).toBe(401);
      expect(r.body?.error?.code, `${m} ${p}`).toBe("UNAUTHENTICATED");
    }
  });
  it("garbage cookie -> 401", async () => {
    for (const [m, p, b] of ROUTES) {
      const r = await anon().req(m, p, { ...(b !== undefined ? { json: b } : {}), headers: { cookie: "fa.session_token=abc.def" } });
      expect(r.status, `${m} ${p}`).toBe(401);
    }
  });
  it("revoked (signed-out) cookie -> 401", async () => {
    const u = await newUser("rv");
    const cookie = u.c.cookieHeader()!;
    await u.c.post("/api/auth/sign-out");
    for (const [m, p, b] of ROUTES) {
      const r = await anon().req(m, p, { ...(b !== undefined ? { json: b } : {}), headers: { cookie } });
      expect(r.status, `${m} ${p}`).toBe(401);
    }
  });
  it("public routes answer without a session; job routes need the bearer secret", async () => {
    expect((await anon().get("/api/health")).status).toBe(200);
    expect((await anon().get("/api/auth/password-rules")).status).toBe(200);
    for (const j of ["fx", "news", "stocks", "universe"]) {
      expect((await anon().post(`/api/jobs/${j}`, {})).status, j).toBe(403);
      expect((await anon().post(`/api/jobs/${j}`, {}, { headers: { authorization: "Bearer wrong" } })).status, j).toBe(403);
    }
  });
  it("unauthenticated requests never receive data bodies", async () => {
    expect((await anon().get("/api/market/stocks")).text).not.toMatch(/NVDA/);
  });
});

describe("A5 forgot / reset password end to end", () => {
  it("same response for known and unknown email", async () => {
    const u = await newUser("fp");
    const known = await new Client().post("/api/auth/forgot-password", { email: u.email });
    const unknown = await new Client().post("/api/auth/forgot-password", { email: ok("nx") });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);
    expect((await new Client().post("/api/auth/forgot-password", { email: "bad" })).status).toBe(400);
  });

  it("forgot limiter: 3/15min per email -> 4th 429, for a KNOWN and an UNKNOWN email alike", async () => {
    const u = await newUser("fp2");
    for (const email of [u.email, ok("fpx")]) {
      const seen: number[] = [];
      for (let i = 0; i < 4; i++) seen.push((await new Client().post("/api/auth/forgot-password", { email })).status);
      expect(seen, email).toEqual([202, 202, 202, 429]);
    }
  });

  it("full flow: token -> weak password rejected -> reset -> token single use -> old pw dead, new pw works, old session revoked", async () => {
    const u = await newUser("rs");
    const oldCookie = u.c.cookieHeader()!;
    expect((await new Client().post("/api/auth/forgot-password", { email: u.email })).status).toBe(202);
    const token = await waitResetToken(u.email);
    expect(token, "reset email printed to dev console").toBeTruthy();
    const c = new Client();
    const weak = await c.post("/api/auth/reset-password", { token, newPassword: "weak" });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");
    expect((await c.post("/api/auth/reset-password", { token: "x".repeat(24), newPassword: "New!Passw0rd" })).status).toBe(400);
    const newPw = "New!Passw0rd-2";
    const done = await c.post("/api/auth/reset-password", { token, newPassword: newPw });
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ ok: true });
    const again = await c.post("/api/auth/reset-password", { token, newPassword: "Another!Pass1" });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("TOKEN_INVALID_OR_EXPIRED");
    expect((await new Client().post("/api/auth/sign-in", { email: u.email, password: u.password })).status).toBe(401);
    expect((await new Client().post("/api/auth/sign-in", { email: u.email, password: newPw })).status).toBe(200);
    expect((await anon().get("/api/auth/session", { headers: { cookie: oldCookie } })).status).toBe(401);
    expect((await c.post("/api/auth/reset-password", { token: "short", newPassword: newPw })).status).toBe(400);
    expect((await c.post("/api/auth/reset-password", { token, newPassword: newPw, x: 1 })).status).toBe(400);
  });

  it("two reset requests: both tokens work once (observation on invalidation policy)", async () => {
    const u = await newUser("rs2");
    await new Client().post("/api/auth/forgot-password", { email: u.email });
    const t1 = await waitResetToken(u.email, 1);
    await sleep(1200);
    await new Client().post("/api/auth/forgot-password", { email: u.email });
    const t2 = await waitResetToken(u.email, 2);
    console.log("OBSERVATION two reset tokens issued; distinct:", t1 !== t2, "count in log:", resetTokens(u.email).length);
    const c = new Client();
    expect((await c.post("/api/auth/reset-password", { token: t2, newPassword: "New!Passw0rd-3" })).status).toBe(200);
    const r1 = await c.post("/api/auth/reset-password", { token: t1, newPassword: "New!Passw0rd-4" });
    console.log("OBSERVATION older token still valid after newer one used? ->", r1.status);
  });
});

describe("A6 hostile strings are stored inertly", () => {
  const xss = `<script>alert(1)</script><img src=x onerror=alert(2)>`;
  const sqli = `Robert'); DROP TABLE "user";--`;
  it("XSS / SQLi in names round-trip verbatim as data; JSON content-type; nosniff", async () => {
    const u = await newUser("xss", { first: xss.slice(0, 60), last: sqli });
    const s = await u.c.get("/api/auth/session");
    expect(s.body.user.firstName).toBe(xss.slice(0, 60));
    expect(s.body.user.lastName).toBe(sqli);
    expect(s.headers.get("content-type")).toMatch(/application\/json/);
    expect(s.headers.get("x-content-type-options")).toBe("nosniff");
    expect((await newUser("after-sqli")).res.status).toBe(201);
  });
  it("SQLi in email/password fields is just an invalid input / failed login", async () => {
    const c = new Client();
    expect((await c.post("/api/auth/sign-in", { email: "' OR '1'='1", password: "x" })).status).toBe(400);
    const u = await newUser("sqlpw");
    expect((await new Client().post("/api/auth/sign-in", { email: u.email, password: "' OR '1'='1" })).status).toBe(401);
    expect((await new Client().post("/api/auth/sign-in", { email: `${u.email}' --`, password: u.password })).status).toBe(400);
  });
});

describe("A7 headers / error hygiene", () => {
  it("security headers on API and pages", async () => {
    const r = await anon().get("/api/health");
    for (const h of ["x-content-type-options", "x-frame-options", "referrer-policy"]) expect(r.headers.get(h), h).toBeTruthy();
    const p = await anon().get("/auth");
    console.log("PAGE HEADERS /auth:", JSON.stringify(Object.fromEntries(p.headers)));
    expect(p.headers.get("x-content-type-options")).toBe("nosniff");
  });
  it("unknown API route -> 404 without stack traces", async () => {
    const u = await newUser("err");
    const r = await u.c.get("/api/does-not-exist");
    expect(r.status).toBe(404);
    expect(r.text).not.toMatch(/\bat\s+\S+\s+\(\S+:\d+:\d+\)|C:\\Users/);
    console.log("OBSERVATION unknown /api/* path returns content-type:", r.headers.get("content-type"));
  });
});
