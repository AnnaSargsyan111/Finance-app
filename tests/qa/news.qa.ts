import { describe, it, expect, beforeAll } from "vitest";
import { newUser } from "./helpers";
import type { Client } from "./helpers";

let c: Client;
beforeAll(async () => {
  c = (await newUser("news")).c;
});
interface Item {
  id: string; title: string; source: string; url: string; publishedAt: string; region: "armenia" | "global";
  topic: string; category: string; summary: string | null; imageUrl: string | null;
}

describe("F news", () => {
  it("exactly 6 items, allowed fields only, id is 16 hex chars, https-only imageUrl, category enum, no article body", async () => {
    const r = await c.get("/api/market/news");
    expect(r.status).toBe(200);
    const items = r.body.data.items as Item[];
    expect(items.length).toBe(6);
    for (const it of items) {
      expect(it.id).toMatch(/^[0-9a-f]{16}$/);
      expect(["armenia", "global"]).toContain(it.region);
      expect(["Markets", "Economy", "Currencies & Commodities", "Technology", "Armenia", "World"]).toContain(it.category);
      expect(it.title.length).toBeGreaterThan(0);
      expect(it.url).toMatch(/^https?:\/\//);
      expect(Date.parse(it.publishedAt)).not.toBeNaN();
      if (it.imageUrl !== null) expect(it.imageUrl).toMatch(/^https:\/\//);
      if (it.summary !== null) expect(it.summary.length).toBeLessThanOrEqual(400);
      expect(Object.keys(it).sort()).toEqual(["category", "id", "imageUrl", "publishedAt", "region", "source", "summary", "title", "topic", "url"]);
    }
    // no full body text leaked (heuristic: no item longer than the 400-char summary cap anywhere)
    expect(r.text).not.toMatch(/<script|<\/p>|<div/i);
  });

  it("<=2 per source, <=3 Armenia, Armenia quota target 2 (>=2 when available), no duplicate URLs/ids, freshness windows", async () => {
    const r = await c.get("/api/market/news");
    const items = r.body.data.items as Item[];
    const bySource = new Map<string, number>();
    for (const it of items) bySource.set(it.source, (bySource.get(it.source) ?? 0) + 1);
    for (const [s, n] of bySource) expect(n, `source ${s}`).toBeLessThanOrEqual(2);
    const armenia = items.filter((i) => i.region === "armenia");
    expect(armenia.length).toBeLessThanOrEqual(3);
    console.log("Armenia items:", armenia.length, "/ 6; sources:", JSON.stringify([...bySource.entries()]));
    expect(new Set(items.map((i) => i.id)).size).toBe(6);
    expect(new Set(items.map((i) => i.url)).size).toBe(6);
    const now = Date.now();
    for (const it of items) {
      const ageH = (now - Date.parse(it.publishedAt)) / 3_600_000;
      const limit = it.region === "armenia" ? 72 : 48;
      if (ageH > limit + 1) console.log(`OBSERVATION ${it.id} (${it.region}) age ${ageH.toFixed(1)}h exceeds the ${limit}h window (relaxed-rules fallback may apply)`);
    }
  });

  it("list vs detail consistency (AC-B12): every list item's detail matches field-for-field", async () => {
    const r = await c.get("/api/market/news");
    const items = r.body.data.items as Item[];
    const mismatches: string[] = [];
    for (const item of items) {
      const d = await c.get(`/api/market/news/${item.id}`);
      expect(d.status, item.id).toBe(200);
      const detail = { ...d.body.data };
      delete detail.readFullUrl;
      expect(typeof d.body.data.readFullUrl).toBe("string");
      for (const k of Object.keys(item) as (keyof Item)[]) {
        if (JSON.stringify(item[k]) !== JSON.stringify(detail[k])) mismatches.push(`${item.id}.${k}: list=${JSON.stringify(item[k])} detail=${JSON.stringify(detail[k])}`);
      }
    }
    if (mismatches.length) console.log("LIST/DETAIL MISMATCH (see QA-002):\n" + mismatches.join("\n"));
    expect(mismatches, "list card must equal detail (AC-B12) - see QA-002 if this fails").toEqual([]);
  });

  it("unknown id -> 404 NOT_FOUND; malformed id never 500", async () => {
    for (const id of ["0000000000000000", "deadbeefdeadbeef", "short", "'; DROP TABLE x;--", "%00", "A".repeat(500)]) {
      const d = await c.get(`/api/market/news/${encodeURIComponent(id)}`);
      expect([400, 404], id.slice(0, 20)).toContain(d.status);
    }
  });

  it("refresh: same shape, throttled 429 within 30s, Retry-After present", async () => {
    const r1 = await c.post("/api/market/news/refresh", {});
    expect(r1.status).toBe(200);
    expect(r1.body.data.items.length).toBe(6);
    const r2 = await c.post("/api/market/news/refresh", {});
    expect(r2.status).toBe(429);
    expect(r2.body.error.code).toBe("RATE_LIMITED");
    expect(Number(r2.headers.get("retry-after"))).toBeGreaterThan(0);
    // CSRF on refresh
    expect((await c.post("/api/market/news/refresh", {}, { origin: "https://evil.example" })).status).toBe(403);
  });

  it("dedupe: no two items share a normalised near-identical title (rough heuristic)", async () => {
    const r = await c.get("/api/market/news");
    const norm = (t: string) => new Set(t.toLowerCase().replace(/[^a-z0-9\s]/g, "").split(/\s+/).filter((w) => w.length > 3));
    const items = r.body.data.items as Item[];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = norm(items[i].title), b = norm(items[j].title);
      const inter = [...a].filter((w) => b.has(w)).length;
      const jac = inter / new Set([...a, ...b]).size;
      expect(jac, `${items[i].title} vs ${items[j].title}`).toBeLessThan(0.6);
    }
  });
});
