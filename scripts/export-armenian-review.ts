/**
 * Writes the review sheet of the Armenian interface texts: research/armenian-review/ui-texts.csv
 * (columns: Area, Key, English, Armenian, Your correction). Open it in Excel or Google Sheets (UTF-8).
 * Run: npx tsx scripts/export-armenian-review.ts
 */
import fs from "node:fs";
import path from "node:path";
import { EN } from "../src/ui/i18n/dict/en";
import { HY } from "../src/ui/i18n/dict/hy";
import { allKeys } from "../src/ui/i18n/translate";

const probe = new Proxy({}, { get: (_t, k) => `{${String(k)}}` }) as Record<string, string>;
const get = (root: unknown, key: string) => key.split(".").reduce<unknown>((n, p) => (n as Record<string, unknown>)?.[p], root);
const show = (v: unknown): string => (typeof v === "function" ? (v as (p: Record<string, string>) => string)(probe) : String(v ?? ""));
const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;

const rows = [["Area", "Key", "English", "Armenian", "Your correction"].map(cell).join(",")];
for (const key of allKeys()) {
  const [area, ...rest] = key.split(".");
  rows.push([area, rest.join("."), show(get(EN, key)), show(get(HY, key)), ""].map(cell).join(","));
}

const out = path.resolve(import.meta.dirname, "..", "research", "armenian-review", "ui-texts.csv");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, "﻿" + rows.join("\r\n") + "\r\n", "utf8");
console.log(`${rows.length - 1} texts written to ${out}`);
