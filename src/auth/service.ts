import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDb } from "@/lib/db";
import { APP } from "@/config/app";
import { ApiError } from "@/lib/errors";
import { log } from "@/lib/log";
import { checkPassword, passwordErrorMessage, PASSWORD_MAX_LENGTH } from "./password-rules";
import { hashPassword } from "./password-hash";
import { enforceLimit, recordEvent } from "./rate-limit";
import { account, rateEvent, user as userTable } from "./schema";
import { toSessionUser, type SessionUser } from "./session";

const MIN = 60_000;

const name = z.string().trim().min(1, "Required").max(APP.pf.nameMax, `At most ${APP.pf.nameMax} characters`);
export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "Email is too long")
  .pipe(z.email("Enter a valid email address"));

/** New password: shared composition rules (src/auth/password-rules.ts). */
const newPassword = z.string().superRefine((p, ctx) => {
  const msg = passwordErrorMessage(checkPassword(p));
  if (msg) ctx.addIssue({ code: "custom", message: msg });
});

export const signUpSchema = z.object({ firstName: name, lastName: name, email: emailField, password: newPassword }).strict();
export const signInSchema = z
  .object({ email: emailField, password: z.string().min(1, "Required").max(PASSWORD_MAX_LENGTH) })
  .strict();
export const forgotSchema = z.object({ email: emailField }).strict();
export const resetSchema = z
  .object({ token: z.string().min(10).max(200), newPassword })
  .strict();
/**
 * PRODUCT DECISION (explicit, owner-approved - see changePassword() below for the full security note): this
 * endpoint does NOT verify the caller's current password. newPassword uses the shared composition rules;
 * confirmPassword only has to match newPassword byte-for-byte (checked below, mapped to a field error on
 * confirmPassword so the UI can point at the right input).
 */
export const changePasswordSchema = z
  .object({ newPassword, confirmPassword: z.string().min(1, "Required").max(PASSWORD_MAX_LENGTH) })
  .strict()
  .superRefine((v, ctx) => {
    if (v.confirmPassword !== v.newPassword) {
      ctx.addIssue({ code: "custom", message: "Passwords don't match.", path: ["confirmPassword"] });
    }
  });
/** Same name validator as sign-up. No email field on purpose - see updateProfile(). */
export const updateProfileSchema = z.object({ firstName: name, lastName: name }).strict();

type AuthResult = { user: SessionUser; setCookies: string[] };

export async function signUp(input: z.infer<typeof signUpSchema>, headers: Headers, ip: string): Promise<AuthResult> {
  await enforceLimit({ scope: "signup-ip", key: ip, limit: APP.auth.signUpPerIpPerHour, windowMs: 60 * MIN });
  const auth = await getAuth();
  await recordEvent("signup-ip", ip);
  try {
    const res = await auth.api.signUpEmail({
      body: {
        name: `${input.firstName} ${input.lastName}`.trim(),
        email: input.email,
        password: input.password,
        firstName: input.firstName,
        lastName: input.lastName,
      },
      headers,
      returnHeaders: true,
    });
    const u = res.response?.user;
    if (!u) throw new ApiError("INTERNAL_ERROR", 500, "Could not create the account.");
    return { user: toSessionUser({ ...u, firstName: input.firstName, lastName: input.lastName }), setCookies: res.headers.getSetCookie() };
  } catch (e) {
    if (e instanceof ApiError) throw e;
    const code = (e as { body?: { code?: string } })?.body?.code ?? "";
    const msg = e instanceof Error ? e.message : "";
    // Better Auth pre-check (USER_ALREADY_EXISTS...) OR the DB unique index winning a sign-up race
    // (Better Auth then reports a generic FAILED_TO_CREATE_USER without the cause, so re-check the table).
    let taken = /USER_ALREADY_EXISTS/i.test(code);
    if (!taken && /FAILED_TO_CREATE_USER/i.test(code)) {
      const db = await getDb();
      const [row] = await db.select({ id: userTable.id }).from(userTable).where(eq(userTable.email, input.email)).limit(1);
      taken = Boolean(row);
    }
    if (taken) {
      throw new ApiError("EMAIL_TAKEN", 409, "We couldn't create an account with these details. Try logging in or resetting your password.");
    }
    log.error("sign-up failed", { code, message: msg });
    throw new ApiError("VALIDATION_ERROR", 400, "We couldn't create the account.");
  }
}

export async function signIn(input: z.infer<typeof signInSchema>, headers: Headers, ip: string): Promise<AuthResult> {
  const windowMs = APP.auth.loginWindowMinutes * MIN;
  const key = `${input.email}|${ip}`;
  // Checked BEFORE verifying the password: the 6th failed attempt in the window is rejected even with a correct password.
  await enforceLimit({ scope: "login-fail", key, limit: APP.auth.loginFailuresPerWindow, windowMs });
  await enforceLimit({ scope: "login-fail-ip", key: ip, limit: APP.auth.loginPerIpLimit, windowMs });
  const auth = await getAuth();
  let res;
  try {
    res = await auth.api.signInEmail({ body: { email: input.email, password: input.password }, headers, returnHeaders: true });
  } catch {
    await recordEvent("login-fail", key);
    await recordEvent("login-fail-ip", ip);
    throw new ApiError("INVALID_CREDENTIALS", 401, "Email or password is incorrect.");
  }
  const u = res.response?.user;
  if (!u) {
    await recordEvent("login-fail", key);
    throw new ApiError("INVALID_CREDENTIALS", 401, "Email or password is incorrect.");
  }
  // success clears this (email, ip) failure counter
  const db = await getDb();
  await db.delete(rateEvent).where(and(eq(rateEvent.scope, "login-fail"), eq(rateEvent.key, key)));
  return { user: toSessionUser(u), setCookies: res.headers.getSetCookie() };
}

export async function signOut(headers: Headers): Promise<string[]> {
  const auth = await getAuth();
  try {
    const res = await auth.api.signOut({ headers, returnHeaders: true });
    return res.headers.getSetCookie();
  } catch {
    return []; // already signed out: idempotent
  }
}

export const FORGOT_MESSAGE = "If an account exists, we've sent an email.";

export async function forgotPassword(input: z.infer<typeof forgotSchema>, ip: string): Promise<void> {
  const windowMs = APP.auth.forgotWindowMinutes * MIN;
  await enforceLimit({ scope: "forgot-email", key: input.email, limit: APP.auth.forgotPerEmailPerWindow, windowMs });
  await enforceLimit({ scope: "forgot-ip", key: ip, limit: APP.auth.forgotPerIpPerWindow, windowMs });
  // counted regardless of whether the account exists (no enumeration through the limiter either)
  await recordEvent("forgot-email", input.email);
  await recordEvent("forgot-ip", ip);
  const auth = await getAuth();
  try {
    await auth.api.requestPasswordReset({ body: { email: input.email } });
  } catch (e) {
    log.warn("forgot-password internal error (masked from caller)", { message: e instanceof Error ? e.message : String(e) });
  }
}

export async function resetPassword(input: z.infer<typeof resetSchema>): Promise<void> {
  const auth = await getAuth();
  try {
    await auth.api.resetPassword({ body: { token: input.token, newPassword: input.newPassword } });
  } catch {
    throw new ApiError("TOKEN_INVALID_OR_EXPIRED", 400, "This reset link is invalid or has expired.");
  }
}

/**
 * Change the signed-in user's password (Settings page).
 *
 * SECURITY NOTE - explicit, owner-approved product decision, NOT an oversight: this endpoint does not verify the
 * caller's current password at all (changePasswordSchema above has no currentPassword field - only newPassword +
 * confirmPassword). That means ANY valid session for the account - including one left open on an unattended device,
 * or hijacked via a stolen cookie / XSS - can change the password unilaterally, with no proof of the current
 * credential. Accepted for this educational prototype; flagged here plainly (and in API-CONTRACT.md) so it is never
 * mistaken for a bug later.
 *
 * Because there is no currentPassword to check, Better Auth's `changePassword` primitive (which REQUIRES it
 * internally and throws if it's missing) cannot be used here. Instead this writes the new hash directly to the
 * `account` table's credential-provider row (pattern: direct drizzle write + .returning(), same style as
 * src/pf/periods.ts / src/invest/history/repo.ts), using the exact same hashPassword() - scrypt N=2^17/r=8/p=1,
 * src/auth/password-hash.ts - Better Auth itself uses. Only *how* the new hash gets written changed, not the hash
 * format, so existing sign-in / verifyPassword logic needs no changes.
 *
 * Session policy is UNCHANGED from the old currentPassword-verified design: every OTHER session for this user is
 * revoked, the caller's own session stays valid (no forced re-login). That still goes through a Better Auth
 * primitive - `auth.api.revokeOtherSessions` - which implements exactly "revoke every session but the one making
 * this request" (verified in node_modules/better-auth: it diffs the caller's own session token out of the user's
 * session list), so there's no need to hand-roll that diff ourselves.
 */
export async function changePassword(userId: string, input: z.infer<typeof changePasswordSchema>, headers: Headers): Promise<string[]> {
  // Not an anti-brute-force limit (nothing is verified, so nothing can be brute-forced) - just a flat abuse cap so a
  // mutating endpoint isn't left completely unlimited.
  const windowMs = APP.auth.changePasswordWindowMinutes * MIN;
  await enforceLimit({ scope: "change-password", key: userId, limit: APP.auth.changePasswordPerUserPerWindow, windowMs });
  await recordEvent("change-password", userId);

  const db = await getDb();
  const hash = await hashPassword(input.newPassword);
  const [row] = await db
    .update(account)
    .set({ password: hash, updatedAt: new Date() })
    .where(and(eq(account.userId, userId), eq(account.providerId, "credential")))
    .returning({ id: account.id });
  if (!row) {
    // Should not happen for a session that just authenticated via route()'s auth guard, but a credential-less
    // account (e.g. future OAuth-only users) must not silently no-op.
    log.error("change-password: no credential account row for user", { userId });
    throw new ApiError("INTERNAL_ERROR", 500, "Could not change the password.");
  }

  const auth = await getAuth();
  try {
    const res = await auth.api.revokeOtherSessions({ headers, returnHeaders: true });
    return res.headers.getSetCookie();
  } catch (e) {
    // The password WAS already changed above; a failure only here means other sessions weren't revoked - log
    // loudly but don't turn an already-successful password change into a 500 for the caller.
    log.error("change-password: revokeOtherSessions failed after password write", {
      userId,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

/**
 * Update the signed-in user's first/last name (Settings page). Email is never accepted: updateProfileSchema is
 * .strict() with no email field (a client sending one gets 400 VALIDATION_ERROR before this runs at all), and this
 * function only ever forwards the two validated fields to Better Auth - never the raw request body - so there is no
 * path for an email to reach the underlying primitive either. Uses Better Auth's `updateUser` (verified against the
 * additionalFields firstName/lastName registered in src/auth/auth.ts); `name` is kept in sync as
 * "<firstName> <lastName>", the same construction sign-up already uses.
 */
export async function updateProfile(
  current: SessionUser,
  input: z.infer<typeof updateProfileSchema>,
  headers: Headers,
): Promise<{ user: SessionUser; setCookies: string[] }> {
  const auth = await getAuth();
  let res;
  try {
    res = await auth.api.updateUser({
      body: { name: `${input.firstName} ${input.lastName}`.trim(), firstName: input.firstName, lastName: input.lastName },
      headers,
      returnHeaders: true,
    });
  } catch (e) {
    log.error("update-profile failed", { message: e instanceof Error ? e.message : String(e) });
    throw new ApiError("INTERNAL_ERROR", 500, "Could not update the profile.");
  }
  return { user: { ...current, firstName: input.firstName, lastName: input.lastName }, setCookies: res.headers.getSetCookie() };
}
