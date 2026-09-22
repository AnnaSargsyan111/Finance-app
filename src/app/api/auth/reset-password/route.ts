import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { resetPassword, resetSchema } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/reset-password { token, newPassword } -> 200 | 400 TOKEN_INVALID_OR_EXPIRED | 400 VALIDATION_ERROR */
export const POST = route({ auth: false }, async ({ body }) => {
  const input = parseOrThrow(resetSchema, await body());
  await resetPassword(input);
  return json({ ok: true });
});
