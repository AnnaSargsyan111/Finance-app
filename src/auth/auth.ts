import { betterAuth } from "better-auth";
import { after } from "next/server";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, type Db } from "@/lib/db";
import { getAuthSecret, getEnv } from "@/lib/env";
import { APP, APP_NAME } from "@/config/app";
import { hashPassword, verifyPassword } from "./password-hash";
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./password-rules";
import { sendPasswordResetEmail } from "./email";
import { user, session, account, verification } from "./schema";

/**
 * Better Auth instance. We use it as a LIBRARY (users, sessions, credential accounts, reset tokens) and do not mount
 * its catch-all HTTP handler: our own thin routes (src/app/api/auth/*) call auth.api.* so that the contract,
 * error envelope, shared password rules, CSRF check and rate limiting are applied uniformly.
 */
function build(db: Db) {
  const env = getEnv();
  const prod = env.NODE_ENV === "production";
  return betterAuth({
    appName: APP_NAME,
    baseURL: env.APP_BASE_URL,
    secret: getAuthSecret(),
    database: drizzleAdapter(db, { provider: "pg", schema: { user, session, account, verification } }),
    emailAndPassword: {
      enabled: true,
      autoSignIn: true,
      requireEmailVerification: false, // owner: forgot-password only in v1
      minPasswordLength: PASSWORD_MIN_LENGTH,
      maxPasswordLength: PASSWORD_MAX_LENGTH,
      password: {
        hash: hashPassword,
        verify: ({ hash, password }: { hash: string; password: string }) => verifyPassword(hash, password),
      },
      resetPasswordTokenExpiresIn: APP.auth.resetTokenMinutes * 60,
      revokeSessionsOnPasswordReset: true, // old sessions are revoked after a reset (documented policy)
      sendResetPassword: async ({ user: u, token }) => {
        const template = process.env.PASSWORD_RESET_URL || `${env.APP_BASE_URL}/auth?mode=reset&token={token}`;
        const url = template.replace("{token}", encodeURIComponent(token));
        const first = (u as unknown as { firstName?: string }).firstName ?? "there";
        await sendPasswordResetEmail(u.email, first, url);
      },
    },
    user: {
      additionalFields: {
        firstName: { type: "string", required: true, input: true },
        lastName: { type: "string", required: true, input: true },
      },
    },
    session: {
      expiresIn: APP.auth.sessionDays * 24 * 3600,
      updateAge: APP.auth.sessionUpdateAgeHours * 3600, // sliding expiry
      cookieCache: { enabled: false }, // every request checks the DB, so sign-out is server-side revocation
    },
    // Reset tokens are stored as SHA-256 hashes (spike item 7): a DB leak does not reveal usable tokens.
    verification: { storeIdentifier: "hashed" },
    advanced: {
      cookiePrefix: "fa",
      useSecureCookies: prod,
      defaultCookieAttributes: { httpOnly: true, sameSite: "lax", secure: prod, path: "/" },
      // Email sending runs after the response is produced so "account exists" vs "unknown" take similar time
      // (timing side channel). Outside a Next request scope (scripts/tests) it degrades to fire-and-forget.
      backgroundTasks: {
        handler: (p: Promise<unknown>) => {
          try {
            after(p);
          } catch {
            p.catch(() => {});
          }
        },
      },
    },
    // Better Auth's own limiter only guards its HTTP handler (unused here); we enforce limits in our routes.
    rateLimit: { enabled: false },
    trustedOrigins: [env.APP_BASE_URL, ...(env.TRUSTED_ORIGINS ?? "").split(",").map((s) => s.trim()).filter(Boolean)],
  });
}

export type AuthInstance = ReturnType<typeof build>;

const KEY = Symbol.for("finance-app.auth");
type Holder = { db: Db; auth: AuthInstance };
const g = globalThis as typeof globalThis & { [KEY]?: Holder };

export async function getAuth(): Promise<AuthInstance> {
  const db = await getDb();
  const cached = g[KEY];
  if (cached && cached.db === db) return cached.auth;
  const auth = build(db);
  g[KEY] = { db, auth };
  return auth;
}
