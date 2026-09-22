import { route, noContent } from "@/lib/route";
import { signOut } from "@/auth/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/auth/sign-out -> 204. Revokes the session server-side and clears the cookie. Idempotent. */
export const POST = route({ auth: false }, async ({ req }) => {
  const setCookies = await signOut(req.headers);
  return noContent({ setCookies });
});
