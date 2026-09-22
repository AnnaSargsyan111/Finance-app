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
  const pool = new Pool({ connectionString: url, max: 5, ssl: url.includes("sslmode=") ? undefined : undefined });
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
  const pool = new Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: migrationsFolder() });
  } finally {
    await pool.end();
  }
}
