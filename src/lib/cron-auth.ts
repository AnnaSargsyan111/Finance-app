import { timingSafeEqual } from "node:crypto";
import { getEnv } from "./env";

/**
 * `Authorization: Bearer $CRON_SECRET`: how Vercel Cron, GitHub Actions and the health monitor authenticate to the job and health
 * endpoints (no session). Refused when CRON_SECRET is unset or the header is missing / wrong; compared in constant time.
 */
export function cronAuthorised(header: string | null): boolean {
  const secret = getEnv().CRON_SECRET;
  if (!secret || !header?.startsWith("Bearer ")) return false;
  const a = Buffer.from(header.slice(7));
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
