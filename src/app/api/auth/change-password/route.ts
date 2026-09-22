import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { changePassword, changePasswordSchema } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/change-password { currentPassword, newPassword } -> 200 { ok:true }
 * Errors: 400 VALIDATION_ERROR (fields.newPassword) when the new password fails the shared rules;
 * 401 INVALID_CREDENTIALS (fields.currentPassword: "Current password is incorrect.") when currentPassword is wrong;
 * 429 RATE_LIMITED on the 6th failed currentPassword attempt within 15 minutes for this user.
 * On success every OTHER session for this user is revoked; the caller's own session stays valid (no forced
 * re-login) - a fresh session cookie may be issued, forwarded automatically like every other route.
 */
export const POST = route({ auth: true }, async ({ req, user, body }) => {
  const input = parseOrThrow(changePasswordSchema, await body());
  const setCookies = await changePassword(user!.id, input, req.headers);
  return json({ ok: true }, 200, { setCookies });
});
