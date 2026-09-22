import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { signIn, signInSchema } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/sign-in  { email, password } -> 200 { user } + cookie | 401 INVALID_CREDENTIALS | 429 RATE_LIMITED */
export const POST = route({ auth: false }, async ({ req, ip, body }) => {
  const input = parseOrThrow(signInSchema, await body());
  const { user, setCookies } = await signIn(input, req.headers, ip);
  return json({ user }, 200, { setCookies });
});
