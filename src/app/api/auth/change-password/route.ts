import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { changePassword, changePasswordSchema } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password { newPassword, confirmPassword } -> 200 { ok:true }
 *
 * SECURITY NOTE (explicit, owner-approved product decision - see changePassword() in src/auth/service.ts for the
 * full write-up): there is NO currentPassword field and none is checked. Any authenticated session for the account
 * can change the password unilaterally. This is intentional for this educational prototype, not an oversight.
 *
 * Errors: 400 VALIDATION_ERROR (fields.newPassword) when the new password fails the shared composition rules;
 * 400 VALIDATION_ERROR (fields.confirmPassword: "Passwords don't match.") when confirmPassword != newPassword;
 * 429 RATE_LIMITED after 10 calls within an hour for this user (flat abuse cap, not an anti-brute-force limit -
 * there is nothing left to brute-force once currentPassword verification is removed).
 * On success every OTHER session for this user is revoked; the caller's own session stays valid (no forced
 * re-login) - a fresh session cookie may be issued, forwarded automatically like every other route.
 */
export const POST = route({ auth: true }, async ({ req, user, body }) => {
  const input = parseOrThrow(changePasswordSchema, await body());
  const setCookies = await changePassword(user!.id, input, req.headers);
  return json({ ok: true }, 200, { setCookies });
});
