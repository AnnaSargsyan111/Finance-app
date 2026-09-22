import { createHash } from "node:crypto";
import type { FeedConfig, NewsConfig } from "./config";
import type { RawItem } from "./rss";

/**
 * Deterministic news pipeline (handover 6.5): normalise -> filter -> dedupe -> score -> quota + diversity selection.
 * Everything here is PURE (no I/O, `now` is a parameter), so the same fixtures always give the same six items.
 */
export type Region = "global" | "armenia";

export interface NewsCandidate {
  id: string;
  title: string;
  /** display source (outlet) */
  source: string;
  feedId: string;
  feedName: string;
  url: string;
  publishedAt: string;
  region: Region;
  categories: string[];
  /** per-item outlet name when the feed provides one */
  outlet?: string;
  summary: string | null;
  imageUrl: string | null;
}

export interface NewsItemDto {
  id: string;
  title: string;
  source: string;
  url: string;
  publishedAt: string;
  region: Region;
  topic: string;
  /** display label mapped from the topic bucket: Markets / Economy / Currencies & Commodities / Technology / Armenia / World */
  category: string;
  summary: string | null;
  imageUrl: string | null;
}

export interface ScoreDebug {
  id: string;
  title: string;
  source: string;
  region: Region;
  topic: string;
  ageHours: number;
  recency: number;
  relevance: number;
  significance: number;
  sourceTrust: number;
  score: number;
  clusterSize: number;
}

export interface NewsSelection {
  items: NewsItemDto[];
  /** relaxation steps that had to be applied to reach the target (empty = strict rules were enough) */
  relaxed: string[];
  /** filled when fewer than the target could be selected */
  shortfall?: string;
  /** every candidate of the last 7 days with its topic/category - persisted to market.news_item */
  pool: (NewsItemDto & { feedId: string })[];
  counts: { candidates: number; afterFilter: number; afterDedupe: number; armeniaQualified: number; globalQualified: number };
  debug: ScoreDebug[];
}

/* ------------------------------------------------------------------ normalisation */

const TRACKING = /^(utm_[a-z]+|fbclid|gclid|dclid|msclkid|mc_[a-z]+|ocid|cmpid|taid|guccounter|guce_[a-z_]+|ref|ref_src|src|smid|sr_share|partner|mod|mbid|source|sourceid|campaign|cid|_ga|igshid|amp)$/i;

/** Canonical URL: lower-case host, no fragment, no tracking params, sorted params, no trailing slash. */
export function canonicalUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return raw.trim();
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  const keep: [string, string][] = [];
  for (const [k, v] of u.searchParams.entries()) if (!TRACKING.test(k)) keep.push([k, v]);
  keep.sort((a, b) => (a[0] === b[0] ? (a[1] < b[1] ? -1 : 1) : a[0] < b[0] ? -1 : 1));
  u.search = "";
  for (const [k, v] of keep) u.searchParams.append(k, v);
  if (u.pathname.length > 1) u.pathname = u.pathname.replace(/\/+$/, "");
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) u.port = "";
  return u.toString();
}

/** id = first 16 hex chars of sha256(canonical URL) (Change Order 1, 17.2) */
export const itemId = (url: string) => createHash("sha256").update(url).digest("hex").slice(0, 16);

const normText = (s: string) =>
  s
    .toLowerCase()
    .replace(/[‘’]/g, "'")
    .replace(/[^a-z0-9&$%'\- ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** crude suffix stripper so "economist"/"economy", "winner"/"winning" compare equal (English headlines only) */
export function stem(t: string): string {
  for (const suf of ["ings", "ing", "ers", "er", "ists", "ist", "ies", "ed", "es", "s", "y"]) {
    if (t.length > suf.length + 3 && t.endsWith(suf)) return t.slice(0, -suf.length);
  }
  return t;
}

export function titleTokens(title: string, stop: Set<string>, dedupe?: NewsConfig["dedupe"]): Set<string> {
  let t = title.toLowerCase().replace(/[‘’]/g, "'");
  if (dedupe) for (const [from, to] of Object.entries(dedupe.phrases)) t = t.split(from).join(` ${to} `);
  const toks = t
    .replace(/'/g, "")
    .split(/[^a-z0-9]+/)
    .filter((x) => x.length >= 2 && !stop.has(x))
    .map((x) => stem(dedupe?.synonyms[x] ?? x));
  return new Set(toks);
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Turn raw feed items into candidates; drops undated / excluded / non-finance-category items. */
export function normaliseFeedItems(items: RawItem[], feed: FeedConfig, cfg: NewsConfig): NewsCandidate[] {
  const excludeCats = new Set(cfg.exclude.categories.map((c) => c.toLowerCase()));
  const urlRes = cfg.exclude.urlPatterns.map((p) => new RegExp(p, "i"));
  const titleRes = cfg.exclude.titlePatterns.map((p) => new RegExp(p, "i"));
  const out: NewsCandidate[] = [];
  for (const it of items.slice(0, cfg.poolMaxItemsPerFeed)) {
    if (!it.publishedAt) continue;
    let title = it.title;
    if (feed.stripTitleSourceSuffix) {
      const suffix = it.outlet ? ` - ${it.outlet}` : null;
      if (suffix && title.endsWith(suffix)) title = title.slice(0, -suffix.length).trim();
      else title = title.replace(/\s+[-|–]\s+[^-|–]{2,40}$/, "").trim();
    }
    if (!title) continue;
    const cats = it.categories.map((c) => c.toLowerCase());
    const isEconomy = cats.includes("economy") || cats.includes("business") || cats.includes("finance");
    if (!isEconomy && cats.some((c) => excludeCats.has(c))) continue;
    const url = canonicalUrl(it.link);
    if (urlRes.some((r) => r.test(url))) continue;
    if (titleRes.some((r) => r.test(title))) continue;
    out.push({
      id: itemId(url),
      title,
      source: feed.useItemSource && it.outlet ? it.outlet : feed.name,
      feedId: feed.id,
      feedName: feed.name,
      url,
      publishedAt: it.publishedAt,
      region: feed.region,
      categories: it.categories,
      summary: it.summary,
      imageUrl: it.imageUrl,
      ...(it.outlet ? { outlet: it.outlet } : {}),
    });
  }
  return out;
}

/* ------------------------------------------------------------------ keyword matching */

const reCache = new WeakMap<object, Map<string, RegExp>>();
function kwRegex(cfg: NewsConfig, kw: string): RegExp {
  let m = reCache.get(cfg);
  if (!m) reCache.set(cfg, (m = new Map()));
  let re = m.get(kw);
  if (!re) {
    const stem = kw.endsWith("*");
    const base = kw.replace(/\*$/, "").trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    re = stem ? new RegExp(`(?<![a-z0-9])${base}[a-z]*`) : new RegExp(`(?<![a-z0-9])${base}(?:s|es)?(?![a-z0-9])`);
    m.set(kw, re);
  }
  return re;
}

function matchWeight(text: string, list: [string, number][], cfg: NewsConfig): number {
  let w = 0;
  for (const [kw, weight] of list) if (kwRegex(cfg, kw).test(text)) w += weight;
  return w;
}

type Bucket = "macro" | "equities" | "currencies_commodities" | "tech_ai";
const GENERAL: Bucket[] = ["macro", "equities", "currencies_commodities", "tech_ai"];

function hasAny(text: string, terms: string[], cfg: NewsConfig): boolean {
  return terms.some((t) => kwRegex(cfg, t).test(text));
}

/* ------------------------------------------------------------------ scoring */

interface Scored extends NewsCandidate {
  topic: string;
  ageHours: number;
  recency: number;
  relevance: number;
  significance: number;
  sourceTrust: number;
  score: number;
  clusterSize: number;
  qualifies: boolean;
}

const r4 = (n: number) => Math.round(n * 10000) / 10000;

function trustOf(c: NewsCandidate, cfg: NewsConfig): number {
  const t = cfg.sourceTrust;
  if (c.outlet && t.outlets[c.outlet] !== undefined) return t.outlets[c.outlet];
  if (t.outlets[c.source] !== undefined) return t.outlets[c.source];
  return t.feeds[c.feedName] ?? t.default;
}

function scoreOne(c: NewsCandidate, clusterExtraSources: number, clusterSize: number, now: Date, cfg: NewsConfig): Scored {
  const feed = cfg.feeds.find((f) => f.id === c.feedId);
  const text = normText(c.title);
  const sat = cfg.relevanceSaturation;
  const ageHours = Math.max(0, (now.getTime() - Date.parse(c.publishedAt)) / 3_600_000);
  const scale = c.region === "armenia" ? cfg.recencyScaleHours.armenia : cfg.recencyScaleHours.global;
  const recency = Math.exp(-ageHours / scale);

  let relevance: number;
  let topic: string;
  let qualifies = true;
  const cats = c.categories.map((x) => x.toLowerCase());

  if (c.region === "armenia") {
    const kw = matchWeight(text, cfg.topics.keywords.armenia_economy, cfg);
    const isEconomy = cats.includes("economy");
    relevance = Math.min(1, kw / sat + (isEconomy ? cfg.armenia.economyCategoryRelevance : 0));
    if (feed?.requireCategory && !feed.requireCategory.some((rc) => cats.includes(rc.toLowerCase()))) {
      qualifies = feed.keywordRescue ? kw / sat >= cfg.armenia.minRelevance : false;
    }
    if (feed?.requireEntity && !hasAny(text, cfg.armeniaEntityTerms, cfg)) qualifies = false;
    if (relevance < cfg.armenia.minRelevance) qualifies = false;
    // topic: strongest general bucket when there is clear evidence, otherwise the Armenia bucket
    let best: { b: Bucket; w: number } | null = null;
    for (const b of GENERAL) {
      const w = matchWeight(text, cfg.topics.keywords[b], cfg);
      if (w >= 1 && (!best || w > best.w)) best = { b, w };
    }
    topic = best ? best.b : "armenia_economy";
  } else {
    let total = 0;
    let best: { b: Bucket; w: number } | null = null;
    for (const b of GENERAL) {
      const w = matchWeight(text, cfg.topics.keywords[b], cfg);
      total += w;
      if (w > 0 && (!best || w > best.w)) best = { b, w };
    }
    if (hasAny(text, cfg.trackedEntities, cfg)) total += 0.5;
    relevance = Math.min(1, total / sat);
    topic = best ? best.b : "global_other";
  }

  const impact = hasAny(text, cfg.topics.highImpact, cfg);
  const sc = cfg.significance;
  const significance = Math.min(1, sc.perExtraSource * Math.min(clusterExtraSources, sc.maxExtraSources) + (impact ? sc.highImpactBonus : 0));
  const sourceTrust = trustOf(c, cfg);
  const w = cfg.scoreWeights;
  const score = w.recency * recency + w.relevance * relevance + w.significance * significance + w.sourceTrust * sourceTrust;
  return {
    ...c,
    topic,
    ageHours: r4(ageHours),
    recency: r4(recency),
    relevance: r4(relevance),
    significance: r4(significance),
    sourceTrust,
    score: r4(score),
    clusterSize,
    qualifies,
  };
}

function toDto(s: { id: string; title: string; source: string; url: string; publishedAt: string; region: Region; topic: string; summary: string | null; imageUrl: string | null }, cfg: NewsConfig): NewsItemDto {
  return {
    id: s.id,
    title: s.title,
    source: s.source,
    url: s.url,
    publishedAt: s.publishedAt,
    region: s.region,
    topic: s.topic,
    category: cfg.topics.categoryLabels[s.topic] ?? "World",
    summary: s.summary,
    imageUrl: s.imageUrl,
  };
}

/* ------------------------------------------------------------------ dedupe */

interface Cluster {
  members: NewsCandidate[];
}

/** cluster by equal canonical URL or title-token Jaccard >= threshold; representative = highest trust, then newest, then id */
function dedupe(cands: NewsCandidate[], cfg: NewsConfig): { rep: NewsCandidate; extraSources: number; size: number }[] {
  const stop = new Set(cfg.stopwords);
  const toks = cands.map((c) => titleTokens(c.title, stop, cfg.dedupe));
  const parent = cands.map((_, i) => i);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  const union = (a: number, b: number) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const byUrl = new Map<string, number>();
  for (let i = 0; i < cands.length; i++) {
    const seen = byUrl.get(cands[i].url);
    if (seen !== undefined) union(seen, i);
    else byUrl.set(cands[i].url, i);
  }
  for (let i = 0; i < cands.length; i++) {
    if (toks[i].size < cfg.dedupe.minTokens) continue;
    for (let j = i + 1; j < cands.length; j++) {
      if (toks[j].size < cfg.dedupe.minTokens) continue;
      if (jaccard(toks[i], toks[j]) >= cfg.dedupe.jaccard) union(i, j);
    }
  }
  const clusters = new Map<number, Cluster>();
  cands.forEach((c, i) => {
    const r = find(i);
    (clusters.get(r) ?? clusters.set(r, { members: [] }).get(r)!).members.push(c);
  });
  const out: { rep: NewsCandidate; extraSources: number; size: number }[] = [];
  for (const cl of clusters.values()) {
    const sorted = [...cl.members].sort((a, b) => {
      const ta = trustOf(a, cfg);
      const tb = trustOf(b, cfg);
      if (ta !== tb) return tb - ta;
      if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1;
      return a.id < b.id ? -1 : 1;
    });
    const sources = new Set(cl.members.map((m) => m.outlet ?? m.source));
    out.push({ rep: sorted[0], extraSources: Math.max(0, sources.size - 1), size: cl.members.length });
  }
  return out;
}

/* ------------------------------------------------------------------ selection */

const cmp = (a: Scored, b: Scored) =>
  b.score !== a.score ? b.score - a.score : a.publishedAt !== b.publishedAt ? (a.publishedAt < b.publishedAt ? 1 : -1) : a.id < b.id ? -1 : 1;

interface Level {
  name: string | null;
  perTopic: number;
  perSource: number;
  globalWindowH: number;
  ignoreThirdMin: boolean;
}

function runLevel(scored: Scored[], lv: Level, cfg: NewsConfig): Scored[] {
  const armWindow = cfg.windowsHours.armenia;
  const eligible = scored.filter(
    (s) => s.qualifies && (s.region === "armenia" ? s.ageHours <= armWindow : s.ageHours <= lv.globalWindowH),
  );
  const arm = eligible.filter((s) => s.region === "armenia").sort(cmp);
  const glob = eligible.filter((s) => s.region === "global").sort(cmp);
  const chosen: Scored[] = [];
  const topicCount = new Map<string, number>();
  const sourceCount = new Map<string, number>();
  let armCount = 0;
  const canAdd = (s: Scored) =>
    (topicCount.get(s.topic) ?? 0) < lv.perTopic && (sourceCount.get(s.source) ?? 0) < lv.perSource && !chosen.some((c) => c.id === s.id);
  const add = (s: Scored) => {
    chosen.push(s);
    topicCount.set(s.topic, (topicCount.get(s.topic) ?? 0) + 1);
    sourceCount.set(s.source, (sourceCount.get(s.source) ?? 0) + 1);
    if (s.region === "armenia") armCount++;
  };
  // 1) Armenia target quota (soft: only as many as qualify)
  for (const s of arm) if (armCount < cfg.armenia.target && canAdd(s)) add(s);
  // 2) a third Armenia item only when it is strong enough (or when relaxing)
  for (const s of arm) {
    if (armCount >= cfg.armenia.max) break;
    if (armCount >= cfg.armenia.target && (lv.ignoreThirdMin || s.score >= cfg.armenia.thirdMinScore) && canAdd(s) && chosen.length < cfg.targetCount) {
      add(s);
    }
  }
  // 3) fill with global stories by score under the diversity caps
  for (const s of glob) if (chosen.length < cfg.targetCount && canAdd(s)) add(s);
  // 4) still short while relaxing: allow further Armenia items up to the max
  if (chosen.length < cfg.targetCount && lv.ignoreThirdMin) {
    for (const s of arm) if (chosen.length < cfg.targetCount && armCount < cfg.armenia.max && canAdd(s)) add(s);
  }
  return chosen;
}

/** The whole pipeline. `candidates` may contain any age; windows are applied here. */
export function selectNews(candidates: NewsCandidate[], now: Date, cfg: NewsConfig): NewsSelection {
  const maxWindow = Math.max(cfg.windowsHours.armenia, cfg.windowsHours.relaxedGlobal, cfg.windowsHours.global);
  const recent = candidates.filter((c) => {
    const age = (now.getTime() - Date.parse(c.publishedAt)) / 3_600_000;
    return age <= maxWindow && age >= -1; // ignore items dated more than an hour in the future (clock skew / bad feeds)
  });
  const clusters = dedupe(recent, cfg);
  const scored = clusters.map((c) => scoreOne(c.rep, c.extraSources, c.size, now, cfg));

  const g = cfg.diversity;
  const levels: Level[] = [
    { name: null, perTopic: g.perTopic, perSource: g.perSource, globalWindowH: cfg.windowsHours.global, ignoreThirdMin: false },
    { name: "topicCap", perTopic: g.perTopic + 1, perSource: g.perSource, globalWindowH: cfg.windowsHours.global, ignoreThirdMin: true },
    { name: "sourceCap", perTopic: g.perTopic + 1, perSource: g.perSource + 1, globalWindowH: cfg.windowsHours.global, ignoreThirdMin: true },
    { name: "window", perTopic: g.perTopic + 1, perSource: g.perSource + 1, globalWindowH: cfg.windowsHours.relaxedGlobal, ignoreThirdMin: true },
    { name: "caps", perTopic: 99, perSource: 99, globalWindowH: cfg.windowsHours.relaxedGlobal, ignoreThirdMin: true },
  ];
  let best: Scored[] = [];
  const relaxed: string[] = [];
  let bestRelaxed: string[] = [];
  for (const lv of levels) {
    if (lv.name) relaxed.push(lv.name);
    const chosen = runLevel(scored, lv, cfg);
    if (chosen.length > best.length) {
      best = chosen;
      bestRelaxed = [...relaxed];
    }
    if (chosen.length >= cfg.targetCount) break;
  }
  const items: NewsItemDto[] = [...best]
    .sort((a, b) => (a.publishedAt !== b.publishedAt ? (a.publishedAt < b.publishedAt ? 1 : -1) : a.id < b.id ? -1 : 1))
    .map((s) => toDto(s, cfg));

  const debug = [...scored].sort(cmp).slice(0, 60).map((s) => ({
    id: s.id, title: s.title, source: s.source, region: s.region, topic: s.topic, ageHours: s.ageHours, recency: s.recency,
    relevance: s.relevance, significance: s.significance, sourceTrust: s.sourceTrust, score: s.score, clusterSize: s.clusterSize,
  }));
  const weekMs = 7 * 24 * 3_600_000;
  const pool = candidates
    .filter((c) => now.getTime() - Date.parse(c.publishedAt) <= weekMs && Date.parse(c.publishedAt) - now.getTime() <= 3_600_000)
    .map((c) => ({ ...toDto({ ...c, topic: scoreOne(c, 0, 1, now, cfg).topic }, cfg), feedId: c.feedId }));
  return {
    items,
    pool,
    relaxed: bestRelaxed,
    ...(items.length < cfg.targetCount
      ? { shortfall: `Only ${items.length} of ${cfg.targetCount} qualifying stories were available within the freshness windows.` }
      : {}),
    counts: {
      candidates: candidates.length,
      afterFilter: recent.length,
      afterDedupe: scored.length,
      armeniaQualified: scored.filter((s) => s.region === "armenia" && s.qualifies).length,
      globalQualified: scored.filter((s) => s.region === "global").length,
    },
    debug,
  };
}
