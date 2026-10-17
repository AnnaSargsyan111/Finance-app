/**
 * Runs the assistant question set (research/assistant-eval/questions.json) through one AI provider with the draft rules
 * (research/assistant-eval/system-prompt.md) and writes a report to research/assistant-eval/results/.
 *
 *   node scripts/assistant-eval.mjs mock                 # no network, checks that this script works
 *   node scripts/assistant-eval.mjs groq --list          # list the model names your key can use
 *   node scripts/assistant-eval.mjs groq                 # run every question
 *   node scripts/assistant-eval.mjs gemini --only G1,P1  # run some questions
 *   node scripts/assistant-eval.mjs openrouter --model <name> --delay 4000
 *
 * Keys are read from .env.local (git-ignored) or the environment: GROQ_API_KEY, GEMINI_API_KEY, OPENROUTER_API_KEY.
 * Only the invented test questions are sent. Keys are never printed or written to the report.
 * The automatic checks are a first filter; a person must read every answer (the report has a column for it).
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const DIR = path.join(ROOT, "research", "assistant-eval");

export const PROVIDERS = {
  groq: { base: "https://api.groq.com/openai/v1", keyVar: "GROQ_API_KEY", model: "llama-3.3-70b-versatile" },
  gemini: { base: "https://generativelanguage.googleapis.com/v1beta/openai", keyVar: "GEMINI_API_KEY", model: "gemini-3.8-flash" },
  openrouter: { base: "https://openrouter.ai/api/v1", keyVar: "OPENROUTER_API_KEY", model: "meta-llama/llama-3.3-70b-instruct:free" },
  mock: { base: "", keyVar: "", model: "mock" },
};

/** "(?i)abc" means a case-insensitive "abc" (JavaScript has no inline flag). */
export function toRegex(pattern) {
  return pattern.startsWith("(?i)") ? new RegExp(pattern.slice(4), "iu") : new RegExp(pattern, "u");
}

const letters = (s) => [...s].filter((c) => /\p{L}/u.test(c));
export function armenianShare(text) {
  const l = letters(text);
  return l.length === 0 ? 0 : l.filter((c) => /[԰-֏]/u.test(c)).length / l.length;
}

/** the automatic checks for one answer: returns a list of failed checks (empty = passed) */
export function check(q, rawAnswer) {
  const fails = [];
  const answer = rawAnswer ? rawAnswer.replace(/[‘’]/g, "'") : rawAnswer; // curly apostrophes: can’t = can't
  if (!answer || !answer.trim()) return ["empty answer"];
  for (const p of q.must ?? []) if (!toRegex(p).test(answer)) fails.push(`missing: ${p}`);
  for (const p of q.mustNot ?? []) if (toRegex(p).test(answer)) fails.push(`must not contain: ${p}`);
  if (q.lang === "hy" && armenianShare(answer) < 0.4) fails.push("answer is not mostly Armenian");
  if (q.lang !== "hy" && armenianShare(answer) > 0.3) fails.push("answered in Armenian to an English question");
  const words = answer.trim().split(/\s+/).length;
  if (words > 260) fails.push(`too long (${words} words)`);
  return fails;
}

function loadEnv() {
  const env = { ...process.env };
  const file = path.join(ROOT, ".env.local");
  if (fs.existsSync(file)) {
    for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (m && env[m[1]] === undefined) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ask(provider, key, model, system, question, maxTokens) {
  if (provider === "mock") return "I'm not sure about that; please check the official source. For savings plans, divide the goal by the months: 3,000,000 / 24 = 125,000 AMD.";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(`${PROVIDERS[provider].base}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model, temperature: 0.2, max_tokens: Number(maxTokens), messages: [{ role: "system", content: system }, { role: "user", content: question }] }),
    });
    if (res.status === 429 && attempt < 4) {
      const wait = Math.min(60, Number(res.headers.get("retry-after")) || 10 * attempt);
      console.log(`  rate limit, waiting ${wait}s`);
      await sleep(wait * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}: ${(await res.text()).slice(0, 300).replace(key, "***")}`);
    const data = await res.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
  throw new Error("still rate limited after 4 tries");
}

async function main() {
  const args = process.argv.slice(2);
  const provider = args[0];
  if (!provider || !PROVIDERS[provider]) {
    console.log(`Usage: node scripts/assistant-eval.mjs <${Object.keys(PROVIDERS).join("|")}> [--list] [--only G1,P1] [--model name] [--delay ms]`);
    process.exit(1);
  }
  const flag = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
  const env = loadEnv();
  const cfg = PROVIDERS[provider];
  const key = cfg.keyVar ? env[cfg.keyVar] : "";
  if (provider !== "mock" && !key) {
    console.log(`No ${cfg.keyVar} found. Create a free key, then add a line  ${cfg.keyVar}=...  to .env.local (that file is git-ignored). Do not paste the key anywhere else.`);
    process.exit(1);
  }
  if (args.includes("--list")) {
    const res = await fetch(`${cfg.base}/models`, { headers: { authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    const data = await res.json();
    for (const m of data.data ?? data.models ?? []) console.log(m.id ?? m.name);
    return;
  }

  const model = flag("model") ?? cfg.model;
  const delay = Number(flag("delay") ?? (provider === "mock" ? 0 : 2500));
  const only = flag("only")?.split(",");
  const system = fs.readFileSync(path.join(DIR, "system-prompt.md"), "utf8");
  const all = JSON.parse(fs.readFileSync(path.join(DIR, "questions.json"), "utf8")).questions;
  const questions = only ? all.filter((q) => only.includes(q.id)) : all;

  const rows = [];
  for (const q of questions) {
    process.stdout.write(`${q.id} `);
    let answer = "";
    let error = "";
    try {
      answer = await ask(provider, key, model, system, q.q, flag("max-tokens") ?? 1800);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    const fails = error ? [`error: ${error}`] : check(q, answer);
    rows.push({ q, answer, fails });
    console.log(fails.length ? "FAIL" : "ok");
    if (delay) await sleep(delay);
  }

  const passed = rows.filter((r) => r.fails.length === 0).length;
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(DIR, "results", `${provider}-${model.replace(/[^a-z0-9.-]+/gi, "_")}-${stamp}${only ? "-partial" : ""}.md`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const md = [
    `# Assistant test: ${provider} / ${model}, ${stamp}`,
    "",
    `Automatic checks passed: **${passed} of ${rows.length}**. Automatic checks are only a first filter; read every answer.`,
    "",
    "| ID | Group | Expected | Auto | Human (ok / bad / note) |",
    "|---|---|---|---|---|",
    ...rows.map((r) => `| ${r.q.id} | ${r.q.group} | ${r.q.expect} | ${r.fails.length ? "FAIL" : "ok"} | |`),
    "",
    ...rows.flatMap((r) => [`## ${r.q.id} (${r.q.expect})`, "", `**Question:** ${r.q.q}`, "", ...(r.fails.length ? [`**Automatic check failed:** ${r.fails.join("; ")}`, ""] : []), "**Answer:**", "", r.answer.trim() ? r.answer.trim().replace(/^/gm, "> ") : "> (no answer)", ""]),
  ].join("\n");
  fs.writeFileSync(out, md);
  console.log(`\n${passed}/${rows.length} passed the automatic checks. Report: ${path.relative(ROOT, out)}`);
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("assistant-eval.mjs")) await main();
