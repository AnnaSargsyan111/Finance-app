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

describe("POST /api/auth/change-password", () => {
  // Product decision (owner-approved): no currentPassword field/check at all - see src/auth/service.ts changePassword().
  const body = (newPassword: string, confirmPassword = newPassword) => ({ newPassword, confirmPassword });

  it("401 without a session; strict schema rejects unknown fields", async () => {
    const anon = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body("N3w!Passw0rd") });
    expect(anon.status).toBe(401);
    expect(anon.body.error.code).toBe("UNAUTHENTICATED");
    const u = await registerUser("cpw-strict");
    const extra = await call(R.changePassword.POST, "POST", "/api/auth/change-password", {
      json: { ...body("N3w!Passw0rd"), note: "hi" },
      jar: u.jar,
    });
    expect(extra.status).toBe(400);
    expect(extra.body.error.code).toBe("VALIDATION_ERROR");
    expect(extra.body.error.fields.note).toBeTruthy();
    // no currentPassword field exists on the new contract - sending one is an unknown field, same as any other
    const withOld = await call(R.changePassword.POST, "POST", "/api/auth/change-password", {
      json: { currentPassword: VALID_PASSWORD, ...body("N3w!Passw0rd") },
      jar: u.jar,
    });
    expect(withOld.status).toBe(400);
    expect(withOld.body.error.fields.currentPassword).toBeTruthy();
  });

  it("each newPassword composition rule is enforced (400 VALIDATION_ERROR, fields.newPassword, via the shared password-rules message)", async () => {
    const u = await registerUser("cpw-rules");
    for (const bad of ["Sh0rt!", "lowercase1!", "UPPERCASE1!", "NoNumbers!!", "NoSymbols123"]) {
      const r = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body(bad), jar: u.jar });
      expect(r.status, bad).toBe(400);
      expect(r.body.error.code).toBe("VALIDATION_ERROR");
      expect(r.body.error.fields.newPassword).toBeTruthy();
      expect(JSON.stringify(r.body)).not.toContain(bad); // password never echoed
    }
    expect((await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: { newPassword: "N3w!Passw0rd" }, jar: u.jar })).status).toBe(400);
  });

  it("mismatched confirmPassword -> 400 VALIDATION_ERROR, fields.confirmPassword, password never applied", async () => {
    const u = await registerUser("cpw-mismatch");
    const r = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body("N3w!Passw0rd", "SomethingElse1!"), jar: u.jar });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe("VALIDATION_ERROR");
    expect(r.body.error.fields).toEqual({ confirmPassword: "Passwords don't match." });
    // the old password still works
    const login = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, ip: freshIp() });
    expect(login.status).toBe(200);
  });

  it("abuse rate limit: 429 after 10 calls within an hour, keyed per user (a different user is unaffected)", async () => {
    const u = await registerUser("cpw-rate");
    const other = await registerUser("cpw-rate-other");
    for (let i = 1; i <= 10; i++) {
      const r = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body(`N3w!Passw0rd${i}`), jar: u.jar });
      expect(r.status, `call ${i}`).toBe(200);
    }
    const eleventh = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body("N3w!Passw0rdX"), jar: u.jar });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.error.code).toBe("RATE_LIMITED");
    expect(Number(eleventh.headers.get("retry-after"))).toBeGreaterThan(0);
    // a different user's own counter is untouched
    const otherOk = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body("N3w!Passw0rd"), jar: other.jar });
    expect(otherOk.status).toBe(200);
  });

  it("success: 200 {ok:true}, revokes every OTHER session but keeps the caller's own session valid (no forced re-login), rotates the password", async () => {
    const u = await registerUser("cpw-success");
    // a second, independent session for the same account (e.g. another device)
    const otherJar = new Jar();
    const otherLogin = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, jar: otherJar, ip: freshIp() });
    expect(otherLogin.status).toBe(200);
    expect((await call(R.session.GET, "GET", "/api/auth/session", { jar: otherJar })).status).toBe(200);

    const NEW = "N3w!Str0ngPassw0rd";
    const r = await call(R.changePassword.POST, "POST", "/api/auth/change-password", { json: body(NEW), jar: u.jar });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });

    // the caller's own session (possibly rotated) keeps working, with no re-login required
    const mine = await call(R.session.GET, "GET", "/api/auth/session", { jar: u.jar });
    expect(mine.status).toBe(200);
    expect(mine.body.user.email).toBe(u.email);

    // the OTHER session is revoked
    const otherAfter = await call(R.session.GET, "GET", "/api/auth/session", { jar: otherJar });
    expect(otherAfter.status).toBe(401);

    // old password rejected, new password accepted, from a fresh login - and no currentPassword was ever supplied
    const oldLogin = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: VALID_PASSWORD }, ip: freshIp() });
    expect(oldLogin.status).toBe(401);
    const newLogin = await call(R.signIn.POST, "POST", "/api/auth/sign-in", { json: { email: u.email, password: NEW }, ip: freshIp() });
    expect(newLogin.status).toBe(200);

    // password is stored only as a scrypt hash (same policy/format as every other password write)
    const db = await getDb();
    const rows = (await db.execute(sql`select password from auth.account where user_id = ${u.id} and provider_id = 'credential'`)).rows as {
      password: string;
    }[];
    expect(rows[0].password.startsWith("scrypt$131072$8$1$")).toBe(true);
  });
});

describe("PATCH /api/auth/profile", () => {
  it("401 without a session; strict schema rejects an email field (and any other unknown field)", async () => {
    const anon = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "A", lastName: "B" } });
    expect(anon.status).toBe(401);
    const u = await registerUser("profile-strict");
    const withEmail = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "A", lastName: "B", email: "new@example.com" }, jar: u.jar });
    expect(withEmail.status).toBe(400);
    expect(withEmail.body.error.code).toBe("VALIDATION_ERROR");
    expect(withEmail.body.error.fields.email).toBeTruthy();
    // the email must not have changed
    const sess = await call(R.session.GET, "GET", "/api/auth/session", { jar: u.jar });
    expect(sess.body.user.email).toBe(u.email);
    const extra = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "A", lastName: "B", isAdmin: true }, jar: u.jar });
    expect(extra.status).toBe(400);
    expect(extra.body.error.fields.isAdmin).toBeTruthy();
  });

  it("validation: required, trimmed, length 1-60 (same rules as sign-up)", async () => {
    const u = await registerUser("profile-validate");
    const bad = async (firstName: unknown, lastName: unknown) =>
      (await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName, lastName }, jar: u.jar })).status;
    expect(await bad("", "B")).toBe(400);
    expect(await bad("A", "")).toBe(400);
    expect(await bad("x".repeat(61), "B")).toBe(400);
    expect(await bad("x".repeat(60), "B")).toBe(200);
    const trimmed = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "  Anna  ", lastName: "  Sargsyan  " }, jar: u.jar });
    expect(trimmed.status).toBe(200);
    expect(trimmed.body.user).toMatchObject({ firstName: "Anna", lastName: "Sargsyan" });
  });

  it("success: 200 {user} in the exact GET /api/auth/session shape, and the session reflects it immediately", async () => {
    const u = await registerUser("profile-success");
    const r = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "Annie", lastName: "Newlast" }, jar: u.jar });
    expect(r.status).toBe(200);
    expect(Object.keys(r.body.user).sort()).toEqual(["email", "firstName", "id", "lastName"]);
    expect(r.body.user).toEqual({ id: u.id, firstName: "Annie", lastName: "Newlast", email: u.email });
    const sess = await call(R.session.GET, "GET", "/api/auth/session", { jar: u.jar });
    expect(sess.body.user).toEqual(r.body.user);
    // `name` is kept in sync server-side
    const db = await getDb();
    const rows = (await db.execute(sql`select name from auth."user" where id = ${u.id}`)).rows as { name: string }[];
    expect(rows[0].name).toBe("Annie Newlast");
  });

  it("two-user isolation: user B's update never affects user A's row, and vice versa", async () => {
    const A = await registerUser("profile-A");
    const B = await registerUser("profile-B");
    const rA = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "Alpha", lastName: "One" }, jar: A.jar });
    expect(rA.status).toBe(200);
    const rB = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: "Beta", lastName: "Two" }, jar: B.jar });
    expect(rB.status).toBe(200);
    const sessA = await call(R.session.GET, "GET", "/api/auth/session", { jar: A.jar });
    const sessB = await call(R.session.GET, "GET", "/api/auth/session", { jar: B.jar });
    expect(sessA.body.user).toMatchObject({ id: A.id, firstName: "Alpha", lastName: "One" });
    expect(sessB.body.user).toMatchObject({ id: B.id, firstName: "Beta", lastName: "Two" });
    expect(sessA.body.user.id).not.toBe(sessB.body.user.id);
  });

  it("stores hostile strings inertly (names are data, returned verbatim)", async () => {
    const u = await registerUser("profile-xss");
    const evil = `<img src=x onerror=alert(1)>'); DROP TABLE auth."user"; --`.slice(0, 60);
    const r = await call(R.profile.PATCH, "PATCH", "/api/auth/profile", { json: { firstName: evil, lastName: "B" }, jar: u.jar });
    expect(r.status).toBe(200);
    expect(r.body.user.firstName).toBe(evil);
    expect(r.headers.get("content-type")).toMatch(/application\/json/);
  });
});
