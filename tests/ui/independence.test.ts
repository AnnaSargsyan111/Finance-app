import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Independence rule (spec section 12): nothing under src/ui/invest may import from or reference Personal Finance code or
 * state, and vice versa. Also guards: no browser storage in the investment flow, and no calls outside this app's API.
 */
const UI = path.resolve(import.meta.dirname, "..", "..", "src", "ui");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|css)$/.test(e.name)) out.push(p);
  }
  return out;
}
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/.*$/gm, "$1");
const specifiers = (code: string) => {
  const out: string[] = [];
  const re = /(?:from\s+|import\s*\(\s*|import\s+)["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code))) out.push(m[1]);
  return out;
};
/** which feature folder does an import resolve to ("pf" | "invest" | other)? */
function featureOf(file: string, spec: string): string | null {
  let abs: string;
  if (spec.startsWith("@/ui/")) abs = path.join(UI, spec.slice("@/ui/".length));
  else if (spec.startsWith(".")) abs = path.resolve(path.dirname(file), spec);
  else return null;
  const rel = path.relative(UI, abs).replace(/\\/g, "/");
  return rel.startsWith("..") ? null : rel.split("/")[0];
}

const all = walk(UI);
const code = (f: string) => stripComments(fs.readFileSync(f, "utf8"));
const rel = (f: string) => path.relative(UI, f).replace(/\\/g, "/");
const inFeature = (f: string, feature: string) => rel(f).startsWith(`${feature}/`);
const sources = all.filter((f) => /\.tsx?$/.test(f));

describe("feature independence", () => {
  it("finds the feature folders", () => {
    expect(sources.some((f) => inFeature(f, "invest"))).toBe(true);
    expect(sources.some((f) => inFeature(f, "pf"))).toBe(true);
  });

  for (const [a, b] of [
    ["invest", "pf"],
    ["pf", "invest"],
  ] as const) {
    it(`src/ui/${a}/** never imports from src/ui/${b}/**`, () => {
      const bad: string[] = [];
      for (const f of sources.filter((x) => inFeature(x, a))) {
        for (const spec of specifiers(code(f))) if (featureOf(f, spec) === b) bad.push(`${rel(f)} -> ${spec}`);
      }
      expect(bad).toEqual([]);
    });
  }

  it("neither feature reaches into the other's API or state", () => {
    const hits = (feature: string, needle: RegExp) => sources.filter((f) => inFeature(f, feature) && needle.test(code(f))).map(rel);
    expect(hits("invest", /api\/pf|listPeriods|getPeriod|putPeriod|deletePeriod/)).toEqual([]);
    expect(hits("pf", /api\/invest|getRecommendation|getComparison|addToHistory/)).toEqual([]);
  });

  it("the investment API module does not import anything Personal Finance", () => {
    const specs = specifiers(code(path.join(UI, "api", "invest.ts")));
    expect(specs.filter((s) => /(^|\/)pf(\/|$)/.test(s))).toEqual([]);
  });
});

describe("investment flow keeps no state outside memory", () => {
  it("does not use localStorage, sessionStorage, IndexedDB, cookies or the URL for inputs", () => {
    const hits = sources
      .filter((f) => inFeature(f, "invest") || rel(f) === "api/invest.ts")
      .filter((f) => /localStorage|sessionStorage|indexedDB|document\.cookie|useSearchParams|URLSearchParams|history\.(push|replace)State/.test(code(f)))
      .map(rel);
    expect(hits).toEqual([]);
  });
});

describe("own backend only, no keys in the browser", () => {
  it("only the API client calls fetch", () => {
    const callers = sources.filter((f) => /\bfetch\(/.test(code(f))).map(rel);
    expect(callers).toEqual(["api/client.ts"]);
  });

  it("the client refuses non-/api/ paths", () => {
    expect(code(path.join(UI, "api", "client.ts"))).toMatch(/startsWith\("\/api\/"\)/);
  });

  it("has no third-party endpoints, no NEXT_PUBLIC variables and no key material", () => {
    const offenders: string[] = [];
    for (const f of sources) {
      const c = code(f);
      if (/NEXT_PUBLIC_/.test(c)) offenders.push(`${rel(f)}: NEXT_PUBLIC`);
      if (/process\.env/.test(c)) offenders.push(`${rel(f)}: process.env`);
      if (/(api[_-]?key|apikey|secret|bearer)\s*[:=]/i.test(c)) offenders.push(`${rel(f)}: key-like assignment`);
      for (const m of c.matchAll(/["'`](https?:\/\/[^"'`\s]+)["'`]/g)) {
        if (!/w3\.org/.test(m[1])) offenders.push(`${rel(f)}: ${m[1]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
