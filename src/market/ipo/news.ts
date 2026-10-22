import fs from "node:fs";
import path from "node:path";
import { isFixtureMode } from "@/lib/env";
import { politeFetch } from "../http";
import { parseFeed } from "../news/rss";
import type { IpoNewsItem } from "./types";

/**
 * Recent headlines about companies' IPO plans (the big names that have no calendar date yet: draft filings, "plans to go public",
 * "sets terms"). Google News search over the last 14 days. Only the headline, outlet, time and link are kept; the articles belong to
 * their publishers (same rule as the News tab).
 */
const QUERY = 'IPO ("plans to go public" OR "files for IPO" OR "IPO filing" OR "expected to price" OR "sets terms" OR "draft IPO")';
const FEED_URL = `https://news.google.com/rss/search?q=${encodeURIComponent(`${QUERY} when:14d`)}&hl=en-US&gl=US&ceid=US:en`;
const MAX_ITEMS = 12;
const ABOUT_IPO = /\bIPO\b|go(?:es|ing)? public|\bS-1\b|public listing|stock market debut/i;

/** "Title - Outlet" -> "Title" (Google News appends the outlet) */
export function stripOutlet(title: string, outlet: string | null): string {
  if (outlet && title.endsWith(` - ${outlet}`)) return title.slice(0, -(outlet.length + 3)).trim();
  const i = title.lastIndexOf(" - ");
  return i > 20 ? title.slice(0, i).trim() : title.trim();
}

/** Google News sometimes gives a web address instead of an outlet name: show its host ("example.com") */
const outletName = (o: string | null): string | null => {
  if (!o) return null;
  if (!/^https?:\/\//i.test(o)) return o;
  try {
    return new URL(o).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
};

/** the same story from several outlets counts once: keyed by the first words of the headline */
const storyKey = (title: string) => title.toLowerCase().replace(/[^a-z0-9 ]+/g, "").split(/\s+/).slice(0, 7).join(" ");

export function pickIpoNews(xml: string, now: Date, maxAgeDays = 14): IpoNewsItem[] {
  const items = parseFeed(xml, "google_ipo_news");
  const oldest = now.getTime() - maxAgeDays * 86_400_000;
  const seen = new Set<string>();
  const out: IpoNewsItem[] = [];
  const sorted = items
    .filter((i) => i.publishedAt && Date.parse(i.publishedAt) >= oldest && Date.parse(i.publishedAt) <= now.getTime() + 3_600_000)
    .sort((a, b) => Date.parse(b.publishedAt!) - Date.parse(a.publishedAt!));
  for (const i of sorted) {
    const title = stripOutlet(i.title, i.outlet ?? null);
    if (!ABOUT_IPO.test(title) || !/^https?:\/\//i.test(i.link)) continue;
    const key = storyKey(title);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, url: i.link, outlet: outletName(i.outlet ?? null), publishedAt: i.publishedAt! });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

export async function fetchIpoNews(now: Date = new Date()): Promise<IpoNewsItem[]> {
  if (isFixtureMode()) {
    const xml = fs.readFileSync(path.join(process.cwd(), "tests", "fixtures", "providers", "ipo", "news.xml"), "utf8");
    // the fixture's dates are fixed, so its headlines are not aged out
    return pickIpoNews(xml, new Date("2026-10-23T00:00:00Z"));
  }
  const res = await politeFetch(FEED_URL, { provider: "google-news", timeoutMs: 10_000, retries: 0 });
  return pickIpoNews(await res.text(), now);
}
