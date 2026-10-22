/** Times every outbound call of one assistant question (no database file used): DATABASE_URL=pglite:memory npx tsx scripts/assistant-timing.ts */
import { loadEnvFile } from "./load-env";
loadEnvFile();

const calls: { what: string; ms: number; status: number }[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(typeof input === "string" || input instanceof URL ? input : input.url);
  const u = new URL(url);
  const t = Date.now();
  const res = await realFetch(input, init);
  calls.push({ what: `${u.host}${u.pathname.slice(0, 28)}`, ms: Date.now() - t, status: res.status });
  return res;
}) as typeof fetch;

async function main() {
  const { answerQuestion } = await import("../src/assistant/ask");
  const questions = process.argv.slice(2).length ? process.argv.slice(2) : ["How much of my deposit is guaranteed in Armenia?", "What is an ETF?", "Ի՞նչ է ինֆլյացիան"];
  for (const q of questions) {
    calls.length = 0;
    const t = Date.now();
    const a = await answerQuestion(q);
    console.log(`\n"${q}" -> ${Date.now() - t} ms  [${a.origin}/${a.status}]`);
    for (const c of calls) console.log(`   ${String(c.ms).padStart(6)} ms  ${c.status}  ${c.what}`);
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
