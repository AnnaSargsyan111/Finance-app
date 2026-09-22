import { z } from "zod";

/**
 * Environment handling. Values are read lazily (getEnv()) so tests can set process.env first.
 * Empty strings (e.g. from a copied .env.example) are treated as "not set".
 * Secrets live only in .env.local / the hosting provider's env - never in code.
 */
const blankToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);
const optStr = z.preprocess(blankToUndefined, z.string().optional());
const optInt = z.preprocess(blankToUndefined, z.coerce.number().int().positive().optional());
const bool = (def: boolean) =>
  z.preprocess(
    (v) => (typeof v === "string" ? ["1", "true", "yes", "on"].includes(v.trim().toLowerCase()) : v),
    z.boolean().default(def),
  );

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** postgres://... (Neon in production) | pglite:<dir> | pglite:memory. Default: local PGlite dir. */
  DATABASE_URL: optStr,
  BETTER_AUTH_SECRET: optStr,
  APP_BASE_URL: z.preprocess(blankToUndefined, z.string().url().default("http://localhost:3000")),
  /** comma separated extra allowed origins for state-changing requests */
  TRUSTED_ORIGINS: optStr,
  /** Descriptive User-Agent for polite scraping (RSS, CBA, Yahoo, constituents CSV). No email hard-coded. */
  HTTP_USER_AGENT: z.preprocess(
    blankToUndefined,
    z.string().default("FinanceAppPrototype/0.1 (educational project; set HTTP_USER_AGENT)"),
  ),
  /** SEC requires "Company/App name contact-email". Required for EDGAR calls; never hard-coded. */
  SEC_USER_AGENT: optStr,
  FINNHUB_API_KEY: optStr,
  TWELVE_DATA_API_KEY: optStr,
  RESEND_API_KEY: optStr,
  EMAIL_FROM: optStr,
  /** auto = use keyed providers when a key exists, else report notConfigured. fixture = serve recorded fixtures (isFixture:true). */
  KEYED_PROVIDER_MODE: z.enum(["auto", "fixture"]).default("auto"),
  /** Unofficial Yahoo endpoints are ToS-restricted: prototype-only fallback, can be switched off. */
  ALLOW_YAHOO_PROTOTYPE: bool(true),
  /** Bearer secret for /api/jobs/* (Vercel Cron / GitHub Actions). Jobs are refused when unset. */
  CRON_SECRET: optStr,
  /** Dev runs of the universe batch may be limited to the first N constituents. */
  UNIVERSE_LIMIT: optInt,
  /** Outbound calls disabled entirely (offline tests): every provider throws UPSTREAM_UNAVAILABLE. */
  OFFLINE: bool(false),
});

export type Env = z.infer<typeof schema>;

export function getEnv(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${msg}`);
  }
  return parsed.data;
}

export const DEV_ONLY_AUTH_SECRET = "dev-only-insecure-secret-change-me-0123456789abcdef";

export function getAuthSecret(): string {
  const env = getEnv();
  if (env.BETTER_AUTH_SECRET) return env.BETTER_AUTH_SECRET;
  if (env.NODE_ENV === "production") {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }
  return DEV_ONLY_AUTH_SECRET;
}

export function isFixtureMode(): boolean {
  return getEnv().KEYED_PROVIDER_MODE === "fixture";
}
