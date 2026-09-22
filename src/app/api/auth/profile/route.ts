import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { updateProfile, updateProfileSchema } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * PATCH /api/auth/profile { firstName, lastName } -> 200 { user } (same shape as GET /api/auth/session).
 * Strict schema: email (or any other field) is rejected with 400 VALIDATION_ERROR before this runs - email is
 * never editable here. Every query is scoped to the caller's own session (no id in the request), so this can never
 * touch another account.
 */
export const PATCH = route({ auth: true }, async ({ req, user, body }) => {
  const input = parseOrThrow(updateProfileSchema, await body());
  const { user: updated, setCookies } = await updateProfile(user!, input, req.headers);
  return json({ user: updated }, 200, { setCookies });
});
