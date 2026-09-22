/**
 * Run a job from a shell / CI: npm run job:universe | job:fx | job:news | job:stocks
 * Uses the SAME database as the app (DATABASE_URL). With the local PGlite file database only ONE process may open it,
 * so stop `npm run dev` first - or call the running server instead:
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/jobs/universe
 */
import { loadEnvFile } from "./load-env";
loadEnvFile();

async function main() {
  const name = process.argv[2];
  const { JOB_NAMES, runJob } = await import("../src/market/jobs");
  if (!name || !(JOB_NAMES as readonly string[]).includes(name)) {
    console.error(`usage: tsx scripts/job.ts <${JOB_NAMES.join("|")}>`);
    process.exit(2);
  }
  const { closeDb } = await import("../src/lib/db");
  try {
    const result = await runJob(name as (typeof JOB_NAMES)[number], { onProgress: (m) => console.log(`[${name}] ${m}`) });
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await closeDb();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
