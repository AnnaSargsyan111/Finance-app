import { describe, expect, it } from "vitest";
import { ART_H, ART_W, artKindFor, barColumns, chartSeries, circuit, coinStacks, globe, makeRng, mountains } from "@/ui/market/news-art";

describe("news artwork for articles without an image", () => {
  it("the category picks the motif; an unknown category falls back by region", () => {
    expect(artKindFor("Markets")).toBe("markets");
    expect(artKindFor("Economy")).toBe("economy");
    expect(artKindFor("Currencies & Commodities")).toBe("currency");
    expect(artKindFor("Technology")).toBe("tech");
    expect(artKindFor("Armenia")).toBe("armenia");
    expect(artKindFor("World")).toBe("world");
    expect(artKindFor("Something new", "armenia")).toBe("armenia");
    expect(artKindFor("Something new", "global")).toBe("markets");
  });

  it("is deterministic: the same article id always draws the same picture (server and browser agree)", () => {
    expect(chartSeries(makeRng("abc"))).toEqual(chartSeries(makeRng("abc")));
    expect(mountains(makeRng("abc"))).toEqual(mountains(makeRng("abc")));
    expect(globe(makeRng("abc"))).toEqual(globe(makeRng("abc")));
  });

  it("different articles get different pictures, including ids that differ by one character", () => {
    const lines = new Set(["a1", "a2", "a3", "a4", "a5", "a6"].map((id) => chartSeries(makeRng(id)).line));
    expect(lines.size).toBe(6);
    const heights = new Set(["id-1", "id-2", "id-3", "id-4"].map((id) => JSON.stringify(barColumns(makeRng(id)))));
    expect(heights.size).toBe(4);
  });

  it("the generator is spread out: not stuck near one end, even for similar seeds", () => {
    let low = 0;
    const n = 400;
    for (let i = 0; i < n; i++) if (makeRng(`article-${i}`)() < 0.5) low++;
    expect(low).toBeGreaterThan(n * 0.4);
    expect(low).toBeLessThan(n * 0.6);
  });

  it("everything stays inside the drawing area", () => {
    for (let i = 0; i < 60; i++) {
      const rng = () => makeRng(`seed-${i}`);
      const c = chartSeries(rng());
      for (const [x, y] of c.points) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(ART_W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(ART_H);
      }
      for (const b of barColumns(rng())) {
        expect(b.x).toBeGreaterThanOrEqual(0);
        expect(b.x + b.w).toBeLessThanOrEqual(ART_W);
        expect(b.y).toBeGreaterThan(0);
        expect(b.y + b.h).toBeLessThanOrEqual(ART_H);
      }
      for (const st of coinStacks(rng())) {
        expect(st.cx - st.rx).toBeGreaterThanOrEqual(0);
        expect(st.cx + st.rx).toBeLessThanOrEqual(ART_W);
        expect(st.count).toBeGreaterThanOrEqual(2);
      }
      for (const [x, y] of circuit(rng()).nodes) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(ART_W);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(ART_H);
      }
      const g = globe(rng());
      expect(g.cx - g.r).toBeGreaterThanOrEqual(0);
      expect(g.cx + g.r).toBeLessThanOrEqual(ART_W);
      for (const l of g.latitudes) expect(l.dx).toBeGreaterThan(0);
    }
  });

  it("the article page tells readers it is an illustration; the list cards do not", async () => {
    const fs = await import("node:fs");
    const detail = fs.readFileSync("src/ui/market/NewsDetailPage.tsx", "utf8");
    const list = fs.readFileSync("src/ui/market/NewsSection.tsx", "utf8");
    expect(detail).toMatch(/<NewsImage[^>]*labelArt/);
    expect(list).not.toMatch(/labelArt/);
  });
});
