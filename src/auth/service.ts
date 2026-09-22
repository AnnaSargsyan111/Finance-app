import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getAuth } from "./auth";
import { getDb } from "@/lib/db";
import { APP } from "@/config/app";
import { ApiError } from "@/lib/errors";
import { log } from "@/lib/log";
import { checkPassword, passwordErrorMessage, PASSWORD_MAX_LENGTH } from "./password-rules";
import { enforceLimit, recordEvent } from "./rate-limit";
import { rateEvent, user as userTable } from "./schema";
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
/** currentPassword is checked against the stored hash, not against composition rules - only newPassword uses those. */
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Required").max(PASSWORD_MAX_LENGTH), newPassword })
  .strict();
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
 * Change the signed-in user's password (Settings page). Uses Better Auth's own `changePassword` primitive: it
 * checks `currentPassword` against the stored hash with our overridden scrypt verify() (src/auth/password-hash.ts),
 * and - with `revokeOtherSessions: true` - revokes every OTHER session for the user and issues a fresh session for
 * the CALLER (same "old sessions revoked" policy as the emailed reset flow's `revokeSessionsOnPasswordReset:true`,
 * just without signing the caller out). The new cookie (if any) is returned as `setCookies` for the route to forward
 * - route()'s existing plumbing appends it to the response exactly like every other auth route.
 * Brute-forcing currentPassword through a stolen session cookie is rate-limited per user, same numbers as login
 * (5 failures / 15 min -> 429 on the 6th), checked BEFORE verifying so a correct password on attempt 6 still 429s.
 */
export async function changePassword(userId: string, input: z.infer<typeof changePasswordSchema>, headers: Headers): Promise<string[]> {
  const windowMs = APP.auth.loginWindowMinutes * MIN;
  await enforceLimit({ scope: "change-password-fail", key: userId, limit: APP.auth.loginFailuresPerWindow, windowMs });
  const auth = await getAuth();
  let res;
  try {
    res = await auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword, revokeOtherSessions: true },
      headers,
      returnHeaders: true,
    });
  } catch (e) {
    const code = (e as { body?: { code?: string } })?.body?.code ?? "";
    if (code === "INVALID_PASSWORD") {
      await recordEvent("change-password-fail", userId);
      // ApiError.code stays INVALID_CREDENTIALS (same family as sign-in's wrong-password error) but, unlike sign-in,
      // this IS attributable to one field: the caller already proved account ownership via their session, so there is
      // no user-enumeration concern in naming `currentPassword` specifically.
      throw new ApiError("INVALID_CREDENTIALS", 401, "Current password is incorrect.", { currentPassword: "Current password is incorrect." });
    }
    log.error("change-password failed", { code, message: e instanceof Error ? e.message : String(e) });
    throw new ApiError("INTERNAL_ERROR", 500, "Could not change the password.");
  }
  // success clears this user's failure counter
  const db = await getDb();
  await db.delete(rateEvent).where(and(eq(rateEvent.scope, "change-password-fail"), eq(rateEvent.key, userId)));
  return res.headers.getSetCookie();
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
