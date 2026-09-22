import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { signUp, signUpSchema } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/auth/sign-up  { firstName, lastName, email, password } -> 201 { user } + session cookie
 * The user is signed in automatically (no email verification in v1, handover 17.6).
 */
export const POST = route({ auth: false }, async ({ req, ip, body }) => {
  const input = parseOrThrow(signUpSchema, await body());
  const { user, setCookies } = await signUp(input, req.headers, ip);
  return json({ user }, 201, { setCookies });
});
