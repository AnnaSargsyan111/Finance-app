import { createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/env";

/**
 * The "Stop these emails" link in every notification: base64url({ w: watchId }) + "." + HMAC-SHA256. It works without signing in
 * (an email link has no session), can only turn off that one watch, and has no expiry (an old email must still be able to stop the emails).
 */
const b64 = (b: Buffer) => b.toString("base64url");
const key = () => createHmac("sha256", getAuthSecret()).update("finova/watch-unsubscribe/v1").digest();

export function signUnsubscribeToken(watchId: string): string {
  const payload = b64(Buffer.from(JSON.stringify({ w: watchId })));
  return `${payload}.${b64(createHmac("sha256", key()).update(payload).digest())}`;
}

/** the watch id inside a valid token, or null */
export function verifyUnsubscribeToken(token: string): string | null {
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = createHmac("sha256", key()).update(payload).digest();
  const given = Buffer.from(sig, "base64url");
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const w = (JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { w?: unknown }).w;
    return typeof w === "string" && /^[0-9a-f-]{36}$/i.test(w) ? w : null;
  } catch {
    return null;
  }
}
