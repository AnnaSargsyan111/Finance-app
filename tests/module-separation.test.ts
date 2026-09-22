import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * AC-B9: automated module-separation check (handover 1.1).
 *   pf     : imports only lib/config/pf.               (no market, invest, auth)
 *   market : imports only lib/config/market.           (no pf, invest, auth)
 *   invest : imports lib/config/invest + "@/market/read" ONLY (read-only market interface); no pf, no auth, no db.
 *   lib/auth: must not import pf/market/invest.
 * Plus: no `pf.` SQL / pgSchema("pf") references outside pf, and `invest` contains no write statements.
 */
const SRC = path.resolve(import.meta.dirname, "..", "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mts)$/.test(e.name)) out.push(p);
  }
  return out;
}

const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");

function moduleOf(absPath: string): string {
  const rel = path.relative(SRC, absPath).replace(/\\/g, "/");
  return rel.split("/")[0];
}

function specifiers(code: string): string[] {
  const out: string[] = [];
  const re = /(?:from\s+|import\s*\(\s*|require\s*\(\s*|import\s+)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(m[1]);
  return out;
}

/** returns "@/module/rest" style for internal imports, or null for external packages */
function resolveInternal(file: string, spec: string): string | null {
  if (spec.startsWith("@/")) return spec;
  if (spec.startsWith(".")) {
    const abs = path.resolve(path.dirname(file), spec);
    const rel = path.relative(SRC, abs).replace(/\\/g, "/");
    if (rel.startsWith("..")) return null;
    return `@/${rel}`;
  }
  return null;
}

const files = walk(SRC);
const FORBIDDEN: Record<string, string[]> = {
  pf: ["market", "invest", "auth", "app"],
  market: ["pf", "invest", "auth", "app"],
  invest: ["pf", "auth", "app"],
  lib: ["pf", "market", "invest", "app"],
  auth: ["pf", "market", "invest", "app"],
  config: ["pf", "market", "invest", "auth", "app", "lib"],
};

describe("module separation (AC-B9)", () => {
  it("scans a meaningful number of source files", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("no forbidden cross-module imports", () => {
    const violations: string[] = [];
    for (const f of files) {
      const mod = moduleOf(f);
      const forbidden = FORBIDDEN[mod];
      if (!forbidden) continue;
      for (const spec of specifiers(stripComments(fs.readFileSync(f, "utf8")))) {
        const internal = resolveInternal(f, spec);
        if (!internal) continue;
        const target = internal.slice(2).split("/")[0];
        if (forbidden.includes(target)) violations.push(`${path.relative(SRC, f)} -> ${spec}`);
        // invest may read market ONLY through the read-only interface
        if (mod === "invest" && target === "market" && !/^@\/market\/read(\.ts)?$/.test(internal)) {
          violations.push(`${path.relative(SRC, f)} -> ${spec} (invest may only import @/market/read)`);
        }
        // invest has no direct DB access
        // (Change Order 1: the history repository is the ONLY database access inside invest)
        if (mod === "invest" && /^@\/lib\/db$/.test(internal) && !path.relative(SRC, f).replace(/\\/g, "/").startsWith("invest/history/")) {
          violations.push(`${path.relative(SRC, f)} -> ${spec} (only invest/history may use the database)`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  it("invest/ and market/ never reference the pf schema in SQL or table definitions", () => {
    const bad: string[] = [];
    for (const f of files) {
      const mod = moduleOf(f);
      if (mod !== "invest" && mod !== "market") continue;
      const code = stripComments(fs.readFileSync(f, "utf8"));
      if (/\bpf\.[a-z_]+/i.test(code) || /pgSchema\(\s*["']pf["']\s*\)/.test(code) || /["']pf["']/.test(code)) bad.push(path.relative(SRC, f));
    }
    expect(bad).toEqual([]);
  });

  it("pf/ never references market/auth schemas or tables in SQL", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (moduleOf(f) !== "pf") continue;
      const code = stripComments(fs.readFileSync(f, "utf8"));
      if (/\b(market|auth|invest)\.[a-z_]+/i.test(code.replace(/@\/(market|auth|invest)\//g, "")) || /pgSchema\(\s*["'](market|auth)["']\s*\)/.test(code)) {
        bad.push(path.relative(SRC, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it("invest/ writes ONLY to invest.saved_recommendation, and only from invest/history/", () => {
    const bad: string[] = [];
    for (const f of files) {
      if (moduleOf(f) !== "invest") continue;
      const rel = path.relative(SRC, f).replace(/\\/g, "/");
      const code = stripComments(fs.readFileSync(f, "utf8"));
      if (rel.startsWith("invest/history/")) {
        for (const m of code.matchAll(/\b(?:db|tx)\s*\.(insert|update|delete)\s*\(\s*([A-Za-z_]+)/g)) if (m[2] !== "savedRecommendation") bad.push(`${rel}: writes to ${m[2]}`);
        if (/\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate|drop\s+table)\b/i.test(code)) bad.push(`${rel}: raw SQL write`);
        continue;
      }
      if (/\b(?:db|tx)\s*\.(insert|update|delete)\s*\(/.test(code) || /\b(insert\s+into|update\s+\w+\s+set|delete\s+from|truncate\s+table|drop\s+table)\b/i.test(code)) {
        bad.push(path.relative(SRC, f));
      }
    }
    expect(bad).toEqual([]);
  });

  it("the lint itself can detect a violation (self-check)", () => {
    const fake = "import { x } from '@/pf/transactions';\nconst q = sql`select * from pf.transaction`;";
    const specs = specifiers(stripComments(fake));
    expect(specs).toContain("@/pf/transactions");
    expect(/\bpf\.[a-z_]+/i.test(stripComments(fake))).toBe(true);
  });

  it("no provider key can reach client code: no NEXT_PUBLIC_ usage; client/UI files never read env or secret names", () => {
    const offenders: string[] = [];
    const SECRET_NAMES = /FINNHUB|TWELVE_DATA|RESEND|BETTER_AUTH_SECRET|CRON_SECRET|SEC_USER_AGENT|DATABASE_URL/;
    for (const f of files) {
      const code = fs.readFileSync(f, "utf8");
      const rel = path.relative(SRC, f).replace(/\\/g, "/");
      if (/NEXT_PUBLIC_/.test(code)) offenders.push(`${rel} uses NEXT_PUBLIC_*`);
      const clientSide = /^\s*["']use client["']/m.test(code) || rel.startsWith("ui/");
      if (clientSide && (/process\.env/.test(code) || SECRET_NAMES.test(code))) offenders.push(`${rel} (client code) touches env / secret names`);
    }
    expect(offenders).toEqual([]);
    const envExample = fs.readFileSync(path.resolve(SRC, "..", ".env.example"), "utf8");
    expect(envExample).not.toMatch(/NEXT_PUBLIC_/);
  });
});
