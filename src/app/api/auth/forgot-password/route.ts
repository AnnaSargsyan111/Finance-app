import { route, json } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { forgotPassword, forgotSchema, FORGOT_MESSAGE } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/forgot-password { email } -> ALWAYS 202 (no account enumeration) | 429 RATE_LIMITED */
export const POST = route({ auth: false }, async ({ ip, body }) => {
  const input = parseOrThrow(forgotSchema, await body());
  await forgotPassword(input, ip);
  return json({ message: FORGOT_MESSAGE }, 202);
});
