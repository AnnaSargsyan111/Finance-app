import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/** Accessibility guards for the mandated palette (#020203 #4F5753 #C0C2C3 #91F60D #2F587E). */
const UI = path.resolve(import.meta.dirname, "..", "..", "src", "ui");
const tokens = fs.readFileSync(path.join(UI, "styles", "tokens.css"), "utf8");

/** resolves `--x: #rrggbb` and one level of `--x: var(--y)` */
const hex = (name: string): string => {
  const m = new RegExp(`--${name}:\\s*([^;]+);`).exec(tokens);
  if (!m) throw new Error(`token --${name} not found`);
  const v = m[1].trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  const ref = /^var\(--([\w-]+)\)$/.exec(v);
  if (ref) return hex(ref[1]);
  throw new Error(`token --${name} is not a plain colour: ${v}`);
};
function lum(h: string) {
  const c = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
};

describe("contrast on the #020203 background", () => {
  const bg = "#020203";

  it("keeps the owner palette values", () => {
    expect(hex("c-bg").toLowerCase()).toBe("#020203");
    expect(hex("c-slate").toLowerCase()).toBe("#4f5753");
    expect(hex("c-silver").toLowerCase()).toBe("#c0c2c3");
    expect(hex("c-lime").toLowerCase()).toBe("#91f60d");
    expect(hex("c-blue").toLowerCase()).toBe("#2f587e");
  });

  it("text, muted text, accent and the negative colour reach 4.5:1 (also on card surfaces)", () => {
    for (const t of ["text", "text-2", "muted", "accent", "neg", "warn", "blue-text"]) {
      for (const surface of [bg, hex("surface"), hex("surface-2")]) {
        expect(ratio(hex(t), surface), `--${t} on ${surface}`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });

  it("documents that #4F5753 and #2F587E are too weak for small text", () => {
    expect(ratio("#4F5753", bg)).toBeLessThan(4.5);
    expect(ratio("#2F587E", bg)).toBeLessThan(4.5);
  });

  it("never uses #4F5753 / #2F587E as a text colour", () => {
    const bad: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.css$/.test(e.name)) {
          const src = fs.readFileSync(p, "utf8");
          // `color:` (not background-color / border-color / outline-color) referencing the weak tokens
          for (const m of src.matchAll(/(?<![\w-])color:\s*([^;]+);/g)) {
            if (/--c-slate|--c-blue\b|--border-strong|--blue\b|#4f5753|#2f587e/i.test(m[1])) {
              const before = src.slice(0, m.index);
              const selector = before.slice(before.lastIndexOf("}") + 1).trim().split("{")[0].trim();
              bad.push(`${e.name}: ${selector} { color: ${m[1]} }`);
            }
          }
        }
      }
    };
    walk(UI);
    // decorative, aria-hidden icons / ghost charts use the border colour as their currentColor (not text)
    const allowed = /\.(ghost|imgFallback|radioDot)\b/;
    expect(bad.filter((b) => !allowed.test(b))).toEqual([]);
  });
});

describe("motion", () => {
  it("global styles respect prefers-reduced-motion", () => {
    expect(fs.readFileSync(path.join(UI, "styles", "global.css"), "utf8")).toMatch(/prefers-reduced-motion:\s*reduce/);
  });
});
