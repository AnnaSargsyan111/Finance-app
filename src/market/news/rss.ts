import { XMLParser } from "fast-xml-parser";
import { UpstreamError } from "@/lib/errors";

/**
 * Minimal RSS 2.0 / Atom reader. Only headline metadata is kept (title, link, date, categories, outlet):
 * article bodies/descriptions/images are NOT stored or exposed (handover 6.4).
 */
export interface RawItem {
  title: string;
  link: string;
  /** ISO-8601 UTC or null when the feed gave no parseable date */
  publishedAt: string | null;
  categories: string[];
  /** underlying outlet when the feed provides it (<source> element: Yahoo, Google News) */
  outlet?: string;
  /** feed description as plain text (HTML stripped, entities decoded, whitespace collapsed, <= 400 chars) or null */
  summary: string | null;
  /** https image URL from media:content / media:thumbnail / enclosure / first <img> in the description, else null */
  imageUrl: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  processEntities: true,
  htmlEntities: true,
  isArray: (name) => name === "item" || name === "entry" || name === "category",
});

const ENTITY: Record<string, string> = { "&nbsp;": " ", "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&rsquo;": "’", "&lsquo;": "‘", "&ndash;": "–", "&mdash;": "—", "&hellip;": "…" };

/** text of a node that may be a string or {"#text", "@_attr"} */
function txt(v: unknown): string {
  if (v == null) return "";
  // e.g. <link> plus <atom:link/> collapse to the same key once namespace prefixes are removed: take the first text node
  if (Array.isArray(v)) return v.map((x) => txt(x)).find((x) => x) ?? "";
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  if (typeof v === "object" && "#text" in (v as Record<string, unknown>)) return txt((v as Record<string, unknown>)["#text"]);
  return "";
}

export function cleanText(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|apos|rsquo|lsquo|ndash|mdash|hellip|#39);/g, (m) => ENTITY[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, " ")
    .trim();
}

/** plain-text summary capped at 400 chars on a word boundary, with an ellipsis */
export function makeSummary(html: string, max = 400): string | null {
  const t = cleanText(html);
  if (!t) return null;
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > max * 0.5 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}

function attrUrls(node: unknown): { url: string; type?: string; medium?: string }[] {
  const list = Array.isArray(node) ? node : node ? [node] : [];
  const out: { url: string; type?: string; medium?: string }[] = [];
  for (const n of list) {
    if (n && typeof n === "object") {
      const o = n as Record<string, unknown>;
      if (typeof o["@_url"] === "string") out.push({ url: o["@_url"], type: o["@_type"] as string | undefined, medium: o["@_medium"] as string | undefined });
    }
  }
  return out;
}

const IMG_EXT = /\.(jpe?g|png|webp|gif|avif)(\?|$)/i;

/** first usable image: media:content / media:thumbnail / enclosure / first <img> in the description. HTTPS only. */
export function pickImage(it: Record<string, unknown>, descriptionHtml: string): string | null {
  const cands: string[] = [];
  for (const m of attrUrls(it.content)) if (m.medium === "image" || (m.type ?? "").startsWith("image/") || (!m.medium && !m.type) || IMG_EXT.test(m.url)) cands.push(m.url);
  for (const m of attrUrls(it.thumbnail)) cands.push(m.url);
  for (const m of attrUrls(it.enclosure)) if ((m.type ?? "").startsWith("image/") || IMG_EXT.test(m.url)) cands.push(m.url);
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(descriptionHtml);
  if (img) cands.push(img[1]);
  for (const c of cands) {
    try {
      const u = new URL(c.trim().replace(/&amp;/g, "&"));
      if (u.protocol === "https:") return u.toString();
    } catch {
      /* ignore malformed */
    }
  }
  return null;
}

function toIso(s: string): string | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

function atomLink(l: unknown): string {
  const links = Array.isArray(l) ? l : l ? [l] : [];
  for (const x of links) {
    if (typeof x === "string") return x;
    const o = x as Record<string, unknown>;
    const rel = o["@_rel"];
    if ((!rel || rel === "alternate") && o["@_href"]) return String(o["@_href"]);
  }
  return "";
}

export function parseFeed(xml: string, provider = "rss"): RawItem[] {
  let doc: Record<string, unknown>;
  try {
    doc = parser.parse(xml);
  } catch {
    throw new UpstreamError(provider, `${provider}: malformed XML`);
  }
  const rss = doc.rss as { channel?: { item?: Record<string, unknown>[] } } | undefined;
  const atom = doc.feed as { entry?: Record<string, unknown>[] } | undefined;
  if (!rss?.channel && !atom) throw new UpstreamError(provider, `${provider}: not an RSS/Atom feed`);
  const out: RawItem[] = [];
  if (rss?.channel) {
    for (const it of rss.channel.item ?? []) {
      const title = cleanText(txt(it.title));
      const link = txt(it.link).trim();
      if (!title || !link) continue;
      const cats: string[] = [];
      const catsNode = (it.categories as { category?: unknown[] } | undefined)?.category ?? (it.category as unknown[] | undefined) ?? [];
      for (const c of Array.isArray(catsNode) ? catsNode : [catsNode]) {
        const t = cleanText(txt(c));
        if (t) cats.push(t);
      }
      const outlet = cleanText(txt(it.source));
      const descHtml = txt(it.description);
      out.push({
        title,
        link,
        summary: makeSummary(descHtml),
        imageUrl: pickImage(it, descHtml),
        publishedAt: toIso(txt(it.pubDate) || txt(it.date) || txt(it.published)),
        categories: cats,
        ...(outlet ? { outlet } : {}),
      });
    }
  } else if (atom) {
    for (const it of atom.entry ?? []) {
      const title = cleanText(txt(it.title));
      const link = atomLink(it.link);
      if (!title || !link) continue;
      const cats = ((it.category as unknown[]) ?? []).map((c) => String((c as Record<string, unknown>)["@_term"] ?? txt(c))).filter(Boolean);
      out.push({ title, link, publishedAt: toIso(txt(it.published) || txt(it.updated)), categories: cats, summary: makeSummary(txt(it.summary)), imageUrl: pickImage(it, txt(it.content) + txt(it.summary)) });
    }
  }
  return out;
}
