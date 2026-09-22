import path from "node:path";
import fs from "node:fs";
import type { PgDatabase } from "drizzle-orm/pg-core";
import { getEnv } from "./env";
import { log } from "./log";

/**
 * Database access. One code path, two drivers behind a DATABASE_URL switch:
 *  - unset / "pglite:<dir>" / "pglite:memory"  -> PGlite (embedded Postgres in WASM) for local dev and tests
 *  - "postgres://..." / "postgresql://..."       -> node-postgres (Neon pooled connection string in production)
 * All SQL is plain Postgres so the switch needs no code changes. The `pg` path is NOT exercised by the
 * automated tests here (no Postgres server was available) - see README-backend "Known limitations".
 *
 * MIGRATIONS ARE NOT AUTO-RUN AGAINST `pg`/Neon. `createPglite()` below calls drizzle's `migrate()` itself (that is
 * why local dev "just works" with no extra step) but `createPg()` deliberately does not: running DDL from inside a
 * request handler against a shared production database on every cold start is not something to do implicitly. Against
 * Neon you MUST run `npm run db:migrate` (with DATABASE_URL pointed at Neon) yourself, once before first use and again
 * after every schema change - see DEPLOYMENT.md.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, any>;

interface DbHandle {
  db: Db;
  kind: "pglite" | "pg";
  close: () => Promise<void>;
}

const KEY = Symbol.for("finance-app.db");
type G = typeof globalThis & { [KEY]?: Promise<DbHandle> };
const g = globalThis as G;

export function migrationsFolder(): string {
  return path.join(process.cwd(), "drizzle");
}

async function createPglite(location: string | undefined): Promise<DbHandle> {
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const { migrate } = await import("drizzle-orm/pglite/migrator");
  let client: InstanceType<typeof PGlite>;
  if (!location || location === "memory") {
    client = new PGlite();
  } else {
    const dir = path.resolve(location);
    fs.mkdirSync(path.dirname(dir), { recursive: true });
    client = new PGlite(dir);
  }
  const db = drizzle(client) as unknown as Db;
  await migrate(db as never, { migrationsFolder: migrationsFolder() });
  return { db, kind: "pglite", close: async () => client.close() };
}

async function createPg(url: string): Promise<DbHandle> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  // `pg` (via pg-connection-string) parses sslmode/sslcert/sslkey/sslrootcert OUT OF THE URL ITSELF and that value
  // always wins over whatever `ssl` option we pass here (see ConnectionParameters: `parse(connectionString)` is
  // merged in AFTER our config). So for a Neon URL that already carries `?sslmode=require` (the normal case), this
  // `ssl` option is inert either way. It only matters as a fallback for a connection string that specifies NO
  // ssl-related param at all: without it, `pg` falls back to PGSSLMODE or finally `false` (plaintext) - and Neon
  // rejects plaintext connections outright, so leaving this out doesn't "fail open", but it does turn a
  // misconfigured DATABASE_URL into a confusing connection-refused error instead of a clear one. Force TLS
  // explicitly for that case so behaviour does not depend on an ambient PGSSLMODE nobody set on purpose.
  const hasExplicitSslParam = /[?&](sslmode|sslcert|sslkey|sslrootcert)=/i.test(url);
  const pool = new Pool({
    connectionString: url,
    // Small per-instance pool. IMPORTANT: on Vercel each serverless function instance gets its OWN process and
    // therefore its OWN pool, so the real fan-out against Postgres is (concurrent instances) x max, not just `max` -
    // this number does not bound total connections across a deployment by itself. Use Neon's POOLED connection
    // string (the "-pooler" host, PgBouncer-based) in production: that is what actually protects the database from
    // too many simultaneous connections under serverless fan-out; this `max` only bounds one instance's own reuse.
    // See DEPLOYMENT.md.
    max: 3,
    ...(hasExplicitSslParam ? {} : { ssl: true }),
  });
  const db = drizzle(pool) as unknown as Db;
  return { db, kind: "pg", close: async () => pool.end() };
}

async function create(): Promise<DbHandle> {
  const env = getEnv();
  const url = env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//i.test(url)) {
    log.info("db: using node-postgres");
    return createPg(url);
  }
  if (env.NODE_ENV === "production" && !url) {
    throw new Error("DATABASE_URL must be set to a Postgres connection string in production");
  }
  const loc = url?.startsWith("pglite:") ? url.slice("pglite:".length) : "./.data/pglite";
  return createPglite(loc);
}

export async function getDb(): Promise<Db> {
  if (!g[KEY]) g[KEY] = create();
  try {
    return (await g[KEY]!).db;
  } catch (e) {
    g[KEY] = undefined; // allow retry after a failed init
    throw e;
  }
}

export async function dbKind(): Promise<"pglite" | "pg"> {
  if (!g[KEY]) await getDb();
  return (await g[KEY]!).kind;
}

/** Tests: install an isolated in-memory database as the process-wide handle. */
export async function useTestDb(): Promise<Db> {
  if (g[KEY]) {
    try {
      await (await g[KEY]!).close();
    } catch {
      /* ignore */
    }
  }
  g[KEY] = createPglite("memory");
  return (await g[KEY]!).db;
}

export async function closeDb(): Promise<void> {
  if (g[KEY]) {
    try {
      await (await g[KEY]!).close();
    } finally {
      g[KEY] = undefined;
    }
  }
}

/** Run migrations against a Postgres (pg) database explicitly: `npm run db:migrate`. */
export async function migratePg(url: string): Promise<void> {
  const { Pool } = await import("pg");
  const { drizzle } = await import("drizzle-orm/node-postgres");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  const hasExplicitSslParam = /[?&](sslmode|sslcert|sslkey|sslrootcert)=/i.test(url);
  const pool = new Pool({ connectionString: url, max: 1, ...(hasExplicitSslParam ? {} : { ssl: true }) });
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
}
