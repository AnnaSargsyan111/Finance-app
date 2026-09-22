/**
 * Apply migrations.
 *  - DATABASE_URL=postgres(ql)://...  -> runs against that Postgres (Neon)
 *  - otherwise                        -> runs against the local PGlite database (also auto-applied on first use)
 * Usage: npm run db:migrate
 */
import { loadEnvFile } from "./load-env";
loadEnvFile();

async function main() {
  const url = process.env.DATABASE_URL;
  if (url && /^postgres(ql)?:\/\//i.test(url)) {
    const { migratePg } = await import("../src/lib/db");
    await migratePg(url);
    console.log("migrations applied to Postgres");
  } else {
    const { getDb, closeDb } = await import("../src/lib/db");
    await getDb(); // PGlite path runs migrations while opening
    await closeDb();
    console.log("migrations applied to local PGlite database");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
