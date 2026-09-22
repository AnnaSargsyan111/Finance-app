// Reads the Next dev-server log (the server prints reset emails there because no Resend key is configured).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const DEV_LOG = resolve(import.meta.dirname, "../../.next/dev/logs/next-development.log");
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function emailMessages(): string[] {
  try {
    const out: string[] = [];
    for (const l of readFileSync(DEV_LOG, "utf8").split("\n")) {
      if (!l.includes("DEV EMAIL")) continue;
      try {
        out.push(JSON.parse(l).message as string);
      } catch {
        /* skip */
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function resetTokens(email: string): string[] {
  const toks: string[] = [];
  for (const msg of emailMessages()) {
    if (!msg.includes(`To: ${email}\n`)) continue;
    const m = /token=([^\s&]+)/.exec(msg);
    if (m) toks.push(decodeURIComponent(m[1]));
  }
  return toks;
}

/** Wait until at least `count` reset emails exist for `email`, return the newest token. */
export async function waitResetToken(email: string, count = 1, waitMs = 20000): Promise<string | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < waitMs) {
    const t = resetTokens(email);
    if (t.length >= count) return t[t.length - 1];
    await sleep(400);
  }
  return null;
}

/** Raw text of all dev-log lines (for secret / PII leakage greps). */
export function devLogText(): string {
  try {
    return readFileSync(DEV_LOG, "utf8");
  } catch {
    return "";
  }
}
