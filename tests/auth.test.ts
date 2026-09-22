import { beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { useTestDb, getDb } from "@/lib/db";
import { call, Jar, freshIp } from "./helpers/api";
import { R, registerUser, VALID_PASSWORD } from "./helpers/routes";
import { checkPassword, PASSWORD_RULES } from "@/auth/password-rules";
import { hashPassword, verifyPassword, SCRYPT_PARAMS } from "@/auth/password-hash";
import { devOutbox } from "@/auth/email";

beforeAll(async () => {
  await useTestDb();
});

async function waitForEmail(to: string, timeoutMs = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const m = [...devOutbox].reverse().find((x) => x.to === to);
    if (m) return m;
    await new Promise((r) => setTimeout(r, 50));
  }
  return undefined;
}
const tokenFrom = (text: string) => decodeURIComponent(/token=([^\s&]+)/.exec(text)![1]);

describe("password rules (shared module)", () => {
  it("each rule fails individually with a precise reason", () => {
    expect(checkPassword("Sh0rt!").failed).toEqual(["minLength"]);
    expect(checkPassword("lowercase1!").failed).toEqual(["uppercase"]);
    expect(checkPassword("UPPERCASE1!").failed).toEqual(["lowercase"]);
    expect(checkPassword("NoNumbers!!").failed).toEqual(["number"]);
    expect(checkPassword("NoSymbols123").failed).toEqual(["symbol"]);
    expect(checkPassword(VALID_PASSWORD).valid).toBe(true);
    expect(PASSWORD_RULES.map((r) => r.id)).toEqual(["minLength", "uppercase", "lowercase", "number", "symbol"]);
  });
  it("rejects > 128 chars", () => {
    expect(checkPassword("Aa1!" + "x".repeat(130)).tooLong).toBe(true);
  });
});

describe("password hashing meets OWASP scrypt minimum (AC-B1 'strong hashes')", () => {
  it("uses N=2^17, r=8, p=1 and verifies", async () => {
    expect(SCRYPT_PARAMS.N).toBe(131072);
    expect(SCRYPT_PARAMS.r).toBe(8);
    expect(SCRYPT_PARAMS.p).toBe(1);
    const h = await hashPassword("Abcdef1!");
    expect(h.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(await verifyPassword(h, "Abcdef1!")).toBe(true);
    expect(await verifyPassword(h, "Abcdef1?")).toBe(false);
    expect(await verifyPassword("garbage", "x")).toBe(false);
  });
});

describe("AC-B1 sign-up / sign-in / sign-out", () => {
  it("sign-up: 201, user shape, session cookie flags, session endpoint works", async () => {
    const jar = new Jar();
    const email = `Happy.Path+${Date.now()}@Example.COM`;
    const res = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
      json: { firstName: "  Anna ", lastName: "Sargsyan", email, password: VALID_PASSWORD },
      jar,
      ip: freshIp(),
    });
    expect(res.status).toBe(201);
    expect(res.body.user).toMatchObject({ firstName: "Anna", lastName: "Sargsyan", email: email.toLowerCase() });
    expect(Object.keys(res.body.user).sort()).toEqual(["email", "firstName", "id", "lastName"]);
    expect(res.body.user.password).toBeUndefined();
    const cookie = res.setCookies.join("\n");
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\//i);
    const s = await call(R.session.GET, "GET", "/api/auth/session", { jar });
    expect(s.status).toBe(200);
    expect(s.body.user.email).toBe(email.toLowerCase());
  });

  it("sign-up validation: field errors, strict schema, name length, email format", async () => {
    const ip = freshIp();
    const bad = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
      json: { firstName: "", lastName: "x".repeat(61), email: "not-an-email", password: "weak" },
      ip,
    });
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe("VALIDATION_ERROR");
    expect(Object.keys(bad.body.error.fields).sort()).toEqual(["email", "firstName", "lastName", "password"]);
    const extra = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
      json: { firstName: "A", lastName: "B", email: "a@example.com", password: VALID_PASSWORD, isAdmin: true },
      ip,
    });
    expect(extra.status).toBe(400);
    expect(extra.body.error.fields.isAdmin).toBeTruthy();
    const tooLongEmail = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
      json: { firstName: "A", lastName: "B", email: `${"a".repeat(250)}@example.com`, password: VALID_PASSWORD },
      ip,
    });
    expect(tooLongEmail.status).toBe(400);
  });

  it("each password rule is enforced at sign-up", async () => {
    const ip = freshIp();
    for (const pw of ["Sh0rt!", "lowercase1!", "UPPERCASE1!", "NoNumbers!!", "NoSymbols123"]) {
      const r = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
        json: { firstName: "A", lastName: "B", email: `pw${Math.random()}@example.com`, password: pw },
        ip,
      });
      expect(r.status, pw).toBe(400);
      expect(r.body.error.fields.password, pw).toBeTruthy();
      expect(JSON.stringify(r.body)).not.toContain(pw); // password never echoed
    }
  });

  it("duplicate email -> 409 EMAIL_TAKEN with neutral wording; concurrent race yields exactly one account", async () => {
    const u = await registerUser("dup");
    const dup = await call(R.signUp.POST, "POST", "/api/auth/sign-up", {
      json: { firstName: "A", lastName: "B", email: u.email.toUpperCase(), password: VALID_PASSWORD },
      ip: freshIp(),
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe("EMAIL_TAKEN");
    expect(dup.body.error.message).not.toMatch(/already (exists|registered)/i);

    const email = `race-${Date.now()}@example.com`;
    const [a, b] = await Promise.all(
      [freshIp(), freshIp()].map((ip) =>
        call(R.signUp.POST, "POST", "/api/auth/sign-up", { json: { firstName: "A", lastName: "B", email, password: VALID_PASSWORD }, ip }),
      ),
    );
    expect([a.status, b.status].sort()).toEqual([201, 409]);
  });

  it("passwords are stored only as scrypt hashes", async () => {
    const u = await registerUser("hash");
    const db = await getDb();
    const rows = (await db.execute(sql`select password from auth.account where account_id = ${u.id}`)).rows as { password: string }[];
    expect(rows).toHaveLength(1);
    expect(rows[0].password.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(rows[0].password).not.toContain(VALID_PASSWORD);
  });

  it("sign-in success sets a cookie; unknown email and wrong password give IDENTICAL errors", async () => {
    const u = await registerUser("login");
    const ok = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, ip: freshIp() });
    expect(ok.status).toBe(200);
    expect(ok.setCookies.length).toBeGreaterThan(0);
    const wrong = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: "Wrong!Passw0rd" }, ip: freshIp() });
    const unknown = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: "nobody@example.com", password: "Wrong!Passw0rd" }, ip: freshIp() });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body);
    expect(wrong.body.error.code).toBe("INVALID_CREDENTIALS");
  });

  it("rate limit: 5 failures are answered 401, the 6th attempt within 15 min is 429 (even with the right password)", async () => {
    const u = await registerUser("rl");
    const ip = freshIp();
    for (let i = 1; i <= 5; i++) {
      const r = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: "Wrong!Passw0rd" }, ip });
      expect(r.status, `attempt ${i}`).toBe(401);
    }
    const sixth = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, ip });
    expect(sixth.status).toBe(429);
    expect(sixth.body.error.code).toBe("RATE_LIMITED");
    expect(Number(sixth.headers.get("retry-after"))).toBeGreaterThan(0);
    // a different client IP for the same email is not blocked by this (email, IP) counter
    const other = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, ip: freshIp() });
    expect(other.status).toBe(200);
  });

  it("sign-out revokes the session SERVER-SIDE (replaying the old cookie fails) and is idempotent", async () => {
    const u = await registerUser("out");
    const oldCookie = u.jar.header()!;
    expect((await call(R.session.GET, "GET", "/api/auth/session", { jar: u.jar })).status).toBe(200);
    const out = await call(R.signOut.POST, "POST", "/api/auth/sign-out", { jar: u.jar });
    expect(out.status).toBe(204);
    expect(u.jar.size).toBe(0);
    const replay = await call(R.session.GET, "GET", "/api/auth/session", { headers: { cookie: oldCookie } });
    expect(replay.status).toBe(401);
    expect(replay.body.error.code).toBe("UNAUTHENTICATED");
    expect((await call(R.signOut.POST, "POST", "/api/auth/sign-out", {})).status).toBe(204);
  });

  it("CSRF: foreign Origin rejected; non-JSON content type rejected", async () => {
    const r = await call(R.signIn.POST, "POST", "/api/auth/sign-in", {
      json: { email: "a@example.com", password: "x" },
      headers: { origin: "https://evil.example" },
      ip: freshIp(),
    });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe("CSRF_ORIGIN_MISMATCH");
    const ct = await call(R.signIn.POST, "POST", "/api/auth/sign-in", {
      rawBody: "email=a@example.com&password=x",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      ip: freshIp(),
    });
    expect(ct.status).toBe(415);
    const ok = await call(R.signIn.POST, "POST", "/api/auth/sign-in", {
      json: { email: "a@example.com", password: "x" },
      headers: { origin: "http://localhost:3000" },
      ip: freshIp(),
    });
    expect(ok.status).toBe(401); // origin accepted, credentials simply wrong
  });
});

describe("AC-B1 forgot / reset password", () => {
  it("forgot-password answers identically for known and unknown emails; email carries a single-use hashed token", async () => {
    const u = await registerUser("forgot");
    const known = await call(R.forgot.POST, "POST", "/api/auth/forgot-password", { json: { email: u.email }, ip: freshIp() });
    const unknown = await call(R.forgot.POST, "POST", "/api/auth/forgot-password", { json: { email: "ghost@example.com" }, ip: freshIp() });
    expect(known.status).toBe(202);
    expect(unknown.status).toBe(202);
    expect(known.body).toEqual(unknown.body);

    const mail = await waitForEmail(u.email);
    expect(mail, "dev console adapter must capture the email").toBeTruthy();
    expect(mail!.text).toContain("60 minutes");
    expect(await waitForEmail("ghost@example.com", 300)).toBeUndefined();

    const token = tokenFrom(mail!.text);
    // token is NOT stored in clear text
    const db = await getDb();
    const rows = (await db.execute(sql`select identifier from auth.verification`)).rows as { identifier: string }[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.identifier.includes(token))).toBe(false);

    // weak new password rejected by the shared rules
    const weak = await call(R.reset.POST, "POST", "/api/auth/reset-password", { json: { token, newPassword: "weakweak" }, ip: freshIp() });
    expect(weak.status).toBe(400);
    expect(weak.body.error.code).toBe("VALIDATION_ERROR");

    // an existing session is revoked by the reset
    const before = await call(R.session.GET, "GET", "/api/auth/session", { jar: u.jar });
    expect(before.status).toBe(200);

    const NEW = "N3w!Passw0rdX";
    const done = await call(R.reset.POST, "POST", "/api/auth/reset-password", { json: { token, newPassword: NEW }, ip: freshIp() });
    expect(done.status).toBe(200);

    // single use
    const again = await call(R.reset.POST, "POST", "/api/auth/reset-password", { json: { token, newPassword: "An0ther!Passw0rd" }, ip: freshIp() });
    expect(again.status).toBe(400);
    expect(again.body.error.code).toBe("TOKEN_INVALID_OR_EXPIRED");

    const after = await call(R.session.GET, "GET", "/api/auth/session", { jar: u.jar });
    expect(after.status).toBe(401);

    const oldLogin = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, ip: freshIp() });
    expect(oldLogin.status).toBe(401);
    const newLogin = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: NEW }, ip: freshIp() });
    expect(newLogin.status).toBe(200);
  });

  it("expired token is rejected", async () => {
    const u = await registerUser("expire");
    await call(R.forgot.POST, "POST", "/api/auth/forgot-password", { json: { email: u.email }, ip: freshIp() });
    const mail = await waitForEmail(u.email);
    const token = tokenFrom(mail!.text);
    const db = await getDb();
    await db.execute(sql`update auth.verification set expires_at = now() - interval '1 minute'`);
    const r = await call(R.reset.POST, "POST", "/api/auth/reset-password", { json: { token, newPassword: "Val1d!Passw0rd" }, ip: freshIp() });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("TOKEN_INVALID_OR_EXPIRED");
    const garbage = await call(R.reset.POST, "POST", "/api/auth/reset-password", { json: { token: "x".repeat(30), newPassword: "Val1d!Passw0rd" }, ip: freshIp() });
    expect(garbage.body.error.code).toBe("TOKEN_INVALID_OR_EXPIRED");
  });

  it("forgot-password is rate limited per email (RATE_LIMITED)", async () => {
    const email = `spam-${Date.now()}@example.com`;
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) {
      statuses.push((await call(R.forgot.POST, "POST", "/api/auth/forgot-password", { json: { email }, ip: freshIp() })).status);
    }
    expect(statuses).toEqual([202, 202, 202, 429, 429]);
  });
});
