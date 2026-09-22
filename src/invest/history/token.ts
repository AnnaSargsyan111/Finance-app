import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getAuthSecret } from "@/lib/env";

/**
 * Tamper protection for "Add to history" (Change Order 1, 17.5): every recommendation response carries
 * saveToken = base64url(payload) + "." + base64url(HMAC-SHA256(secret, base64url(payload))),
 * payload = { u: userId, h: sha256(canonical result), e: expiry (epoch s, <= 60 min) }.
 * POST /api/invest/history re-hashes the submitted result and verifies signature, user, expiry and hash.
 */
const VOLATILE_KEYS = ["saveToken", "saveTokenExpiresAt"];

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const o = value as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}

export function stripVolatile<T extends Record<string, unknown>>(result: T): Omit<T, "saveToken" | "saveTokenExpiresAt"> {
  const copy: Record<string, unknown> = { ...result };
  for (const k of VOLATILE_KEYS) delete copy[k];
  return copy as Omit<T, "saveToken" | "saveTokenExpiresAt">;
}

export const hashResult = (result: Record<string, unknown>): string => createHash("sha256").update(canonicalJson(stripVolatile(result))).digest("hex");

const b64 = (b: Buffer) => b.toString("base64url");
const key = () => createHmac("sha256", getAuthSecret()).update("finova/save-token/v1").digest();

export function signSaveToken(userId: string, resultHash: string, ttlMinutes: number, now: Date = new Date()): { token: string; expiresAt: string } {
  const exp = Math.floor(now.getTime() / 1000) + Math.min(60, ttlMinutes) * 60;
  const payload = b64(Buffer.from(JSON.stringify({ u: userId, h: resultHash, e: exp })));
  const sig = b64(createHmac("sha256", key()).update(payload).digest());
  return { token: `${payload}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export type TokenCheck = { ok: true; hash: string } | { ok: false; reason: "malformed" | "signature" | "expired" | "user" | "hash" };

export function verifySaveToken(token: string, userId: string, submittedResult: Record<string, unknown>, now: Date = new Date()): TokenCheck {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "malformed" };
  const expected = createHmac("sha256", key()).update(payload).digest();
  let given: Buffer;
  try {
    given = Buffer.from(sig, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return { ok: false, reason: "signature" };
  let p: { u?: string; h?: string; e?: number };
  try {
    p = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const nowS = Math.floor(now.getTime() / 1000);
  if (typeof p.e !== "number" || p.e <= nowS || p.e - nowS > 3600) return { ok: false, reason: "expired" };
  if (p.u !== userId) return { ok: false, reason: "user" };
  const h = hashResult(submittedResult);
  if (p.h !== h) return { ok: false, reason: "hash" };
  return { ok: true, hash: h };
}
