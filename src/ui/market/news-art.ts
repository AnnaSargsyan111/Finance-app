/**
 * Artwork for news items that have no (working) image. Every drawing is built from the article's id and category: the topic picks
 * the motif (a chart for markets, coin stacks for currencies, mountains for Armenia ...) and the id varies the details, so two
 * articles in the same category look related but never identical. Nothing is fetched and nothing is random at render time, so the
 * server and the browser always draw the same picture. All the geometry is here as plain numbers and path strings; the component
 * (NewsArt.tsx) only paints them.
 */

export type ArtKind = "markets" | "economy" | "currency" | "tech" | "armenia" | "world";

/** drawing space (16:9, like the image box) */
export const ART_W = 320;
export const ART_H = 180;

export function artKindFor(category: string, region?: string): ArtKind {
  switch (category) {
    case "Markets":
      return "markets";
    case "Economy":
      return "economy";
    case "Currencies & Commodities":
      return "currency";
    case "Technology":
      return "tech";
    case "Armenia":
      return "armenia";
    case "World":
      return "world";
    default:
      return region === "armenia" ? "armenia" : "markets";
  }
}

export type Rng = () => number;

/** small deterministic generator (FNV-1a hash of the seed -> mulberry32): the same seed always gives the same numbers */
export function makeRng(seed: string): Rng {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // finalise the hash so that seeds differing in one character give unrelated sequences
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  let a = h >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 4; i++) next(); // the first outputs of a fresh generator are the most correlated
  return next;
}

const r1 = (n: number) => Math.round(n * 10) / 10;
const between = (rng: Rng, lo: number, hi: number) => lo + rng() * (hi - lo);
const pick = <T,>(rng: Rng, items: readonly T[]): T => items[Math.floor(rng() * items.length) % items.length];

/** soft light in one corner area, so each picture is lit from a slightly different place */
export function glowSpot(rng: Rng) {
  return { cx: r1(between(rng, 40, 280)), cy: r1(between(rng, 10, 70)), r: r1(between(rng, 150, 230)) };
}

/** a line chart: a random walk with a drift up or down, as a line path and a closed area path under it */
export function chartSeries(rng: Rng) {
  const n = 16;
  const drift = pick(rng, [-1, 1, 1]); // mostly rising, sometimes falling
  const raw: number[] = [];
  let v = 0;
  for (let i = 0; i < n; i++) {
    v += drift * between(rng, 0.1, 1.1) + between(rng, -1.1, 1.1);
    raw.push(v);
  }
  const lo = Math.min(...raw);
  const hi = Math.max(...raw);
  const span = hi - lo || 1;
  const points = raw.map((x, i): [number, number] => [r1(14 + (i * (ART_W - 28)) / (n - 1)), r1(138 - ((x - lo) / span) * 100)]);
  const line = points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
  const area = `${line} L${points[n - 1][0]} ${ART_H} L${points[0][0]} ${ART_H} Z`;
  return { points, line, area, last: points[n - 1] };
}

/** columns that grow with some noise; the last one is the highlighted one */
export function barColumns(rng: Rng) {
  const n = 9;
  const w = 22;
  const gap = 12;
  const x0 = (ART_W - (n * w + (n - 1) * gap)) / 2;
  const up = rng() > 0.25;
  return Array.from({ length: n }, (_, i) => {
    const t = up ? i / (n - 1) : 1 - i / (n - 1);
    const h = r1(Math.max(16, 26 + t * 78 + between(rng, -16, 16)));
    return { x: r1(x0 + i * (w + gap)), y: r1(150 - h), w, h, hot: i === n - 1 };
  });
}

/** stacks of coins (flat ellipses piled up), for currencies and commodities */
export function coinStacks(rng: Rng) {
  const xs = [58, 124, 196, 262].map((x) => r1(x + between(rng, -10, 10)));
  return xs.map((cx) => ({ cx, count: 2 + Math.floor(rng() * 6), rx: 25, ry: 8 }));
}
export const COIN_BASE_Y = 148;
export const COIN_STEP = 9;

/** a chip with traces running out of it, for technology */
export function circuit(rng: Rng) {
  const chip = { x: 118, y: 58, w: 84, h: 64 };
  const pins: { d: string }[] = [];
  const nodes: [number, number][] = [];
  // traces leave the chip left and right, bend once, and end in a node
  for (let i = 0; i < 4; i++) {
    const y = r1(chip.y + 10 + i * 15);
    for (const side of [-1, 1] as const) {
      const sx = side === -1 ? chip.x : chip.x + chip.w;
      const bendX = r1(sx + side * between(rng, 22, 60));
      const endY = r1(Math.min(170, Math.max(10, y + pick(rng, [-1, 1]) * between(rng, 14, 44))));
      const endX = r1(Math.max(8, Math.min(312, bendX + side * between(rng, 14, 50))));
      pins.push({ d: `M${sx} ${y} L${bendX} ${y} L${bendX} ${endY} L${endX} ${endY}` });
      nodes.push([endX, endY]);
    }
  }
  return { chip, pins, nodes };
}

/** layered mountain ridges with one tall and one smaller peak (like Ararat), for Armenia */
export function mountains(rng: Rng) {
  const bigX = r1(between(rng, 100, 140));
  const bigY = r1(between(rng, 38, 58));
  const smallX = r1(bigX + between(rng, 58, 84));
  const smallY = r1(between(rng, 78, 98));
  const front: [number, number][] = [
    [0, 150],
    [r1(bigX - 78), r1(between(rng, 112, 128))],
    [bigX, bigY],
    [r1(bigX + 26), r1(bigY + 36)],
    [smallX, smallY],
    [r1(smallX + 52), r1(between(rng, 120, 138))],
    [ART_W, r1(between(rng, 128, 146))],
  ];
  const back: [number, number][] = [
    [0, 130],
    [r1(between(rng, 50, 90)), r1(between(rng, 92, 112))],
    [r1(between(rng, 170, 210)), r1(between(rng, 100, 120))],
    [r1(between(rng, 250, 290)), r1(between(rng, 84, 104))],
    [ART_W, 118],
  ];
  const close = (pts: [number, number][]) => `M${pts.map(([x, y]) => `${x} ${y}`).join(" L")} L${ART_W} ${ART_H} L0 ${ART_H} Z`;
  return { front: close(front), back: close(back), sun: { cx: r1(between(rng, 220, 280)), cy: r1(between(rng, 36, 60)), r: r1(between(rng, 12, 18)) }, peak: [bigX, bigY] as [number, number] };
}

/** a globe with meridians, latitudes and linked points, for world news */
export function globe(rng: Rng) {
  const cx = r1(between(rng, 190, 230));
  const cy = 92;
  const r = 64;
  const points: [number, number][] = Array.from({ length: 6 }, () => {
    const a = rng() * Math.PI * 2;
    const d = Math.sqrt(rng()) * r * 0.86;
    return [r1(cx + Math.cos(a) * d), r1(cy + Math.sin(a) * d)];
  });
  const arcs = points.slice(1).map(([x, y], i) => {
    const [px, py] = points[i];
    return `M${px} ${py} Q${r1((px + x) / 2)} ${r1(Math.min(py, y) - 22)} ${x} ${y}`;
  });
  return { cx, cy, r, meridians: [0.3, 0.62, 0.9].map((k) => r1(r * k)), latitudes: [-0.55, -0.2, 0.2, 0.55].map((k) => ({ y: r1(cy + r * k), dx: r1(Math.sqrt(r * r - (r * k) ** 2)) })), points, arcs };
}
