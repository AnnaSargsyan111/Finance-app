import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { resetCache } from "./helpers/db";
import { fixture } from "./helpers/fetch-mock";
import { makeSummary, parseFeed, pickImage } from "@/market/news/rss";
import { getNews, setNewsFetchers } from "@/market/news/service";
import { findNewsItem, persistPool } from "@/market/news/store";
import type { FeedConfig } from "@/market/news/config";
import * as newsRoute from "@/app/api/market/news/route";
import * as detailRoute from "@/app/api/market/news/[id]/route";

/** Change Order 1 (17.2): card fields, GET /api/market/news/:id, 7-day persistence (AC-B12) on synthetic feeds. */
const NOW = new Date("2026-09-21T17:30:00Z");
const FILES: Record<string, string> = {
  yahoo: "yahoo", cnbc_top: "cnbc_top", cnbc_finance: "cnbc_finance", bloomberg_markets: "bloomberg_markets",
  guardian_business: "guardian_business", bbc_business: "bbc_business", nyt_business: "nyt_business",
  armenpress: "armenpress", newsam: "newsam", google_armenia: "googlenews_armenia", ft: "ft",
};
const fixtureFetch = async (f: FeedConfig) => fixture("rss", `${FILES[f.id]}.xml`);

let user: TestUser;
beforeAll(async () => {
  await useTestDb();
  user = await registerUser("newsid");
});
beforeEach(async () => {
  await resetCache();
  setNewsFetchers({ now: () => NOW, fetchFeed: fixtureFetch });
});
afterEach(() => setNewsFetchers(null));

const getDetail = (id: string, jar = user.jar) => call(detailRoute.GET, "GET", `/api/market/news/${id}`, { jar, params: { id } });

describe("summary + image extraction", () => {
  it("makeSummary: strips HTML, decodes entities, collapses whitespace, caps at 400 chars on a word boundary + ellipsis", () => {
    expect(makeSummary("<p>Rates &amp; <b>bonds</b>&nbsp;rise</p>\n\n  <a href='x'>more</a>")).toBe("Rates & bonds rise more");
    expect(makeSummary("")).toBeNull();
    const s = makeSummary("word ".repeat(200))!;
    expect(s.length).toBeLessThanOrEqual(401);
    expect(s.endsWith("…")).toBe(true);
    expect(s.slice(0, -1).endsWith("word")).toBe(true);
    expect(makeSummary("x".repeat(500))!.length).toBe(401);
  });

  it("pickImage: media:content / thumbnail / enclosure / <img>; HTTPS only, otherwise null", () => {
    expect(pickImage({ content: { "@_url": "https://a.example/x.jpg", "@_medium": "image" } }, "")).toBe("https://a.example/x.jpg");
    expect(pickImage({ thumbnail: { "@_url": "https://a.example/t.png" } }, "")).toBe("https://a.example/t.png");
    expect(pickImage({ enclosure: { "@_url": "https://a.example/e.webp", "@_type": "image/webp" } }, "")).toBe("https://a.example/e.webp");
    expect(pickImage({}, '<p><img src="https://a.example/i.jpg" alt=""></p>')).toBe("https://a.example/i.jpg");
    expect(pickImage({ content: { "@_url": "http://a.example/insecure.jpg", "@_medium": "image" } }, "")).toBeNull();
    expect(pickImage({ enclosure: { "@_url": "https://a.example/movie.mp4", "@_type": "video/mp4" } }, "")).toBeNull();
    expect(pickImage({}, "")).toBeNull();
  });

  it("synthetic feeds yield summaries and https images", () => {
    const yahoo = parseFeed(fixture("rss", "yahoo.xml"), "yahoo");
    expect(yahoo.filter((i) => i.imageUrl).length).toBeGreaterThan(10);
    expect(yahoo.every((i) => !i.imageUrl || i.imageUrl.startsWith("https://"))).toBe(true);
    expect(parseFeed(fixture("rss", "bloomberg_markets.xml"), "b").filter((i) => i.summary).length).toBeGreaterThan(5);
    expect(parseFeed(fixture("rss", "guardian_business.xml"), "g").find((i) => i.summary)!.summary).not.toMatch(/<|&lt;/);
    expect(parseFeed(fixture("rss", "armenpress.xml"), "a").filter((i) => i.imageUrl).length).toBeGreaterThan(10);
  });
});

describe("AC-B12 GET /api/market/news/:id", () => {
  it("returns the same item as the list for every listed id; last-7-day candidates persist across refreshes; unknown ids are 404", async () => {
    const list = await call(newsRoute.GET, "GET", "/api/market/news", { jar: user.jar });
    expect(list.status).toBe(200);
    const items = list.body.data.items as { id: string; url: string; category: string }[];
    expect(items).toHaveLength(6);
    for (const it of items) {
      const r = await getDetail(it.id);
      expect(r.status).toBe(200);
      expect(r.body.data).toEqual({ ...it, readFullUrl: it.url });
      expect(r.body.data.category).toBeTruthy();
    }
    // candidates that were NOT among the six are persisted too
    const db = await getDb();
    const rows = (await db.execute(sql`select id from market.news_item`)).rows as { id: string }[];
    expect(rows.length).toBeGreaterThan(50);
    const other = rows.find((r) => !items.some((i) => i.id === r.id))!;
    expect((await getDetail(other.id)).status).toBe(200);
    // a later refresh with different content keeps earlier ids resolvable
    await resetCache();
    setNewsFetchers({
      now: () => new Date(NOW.getTime() + 2 * 3_600_000),
      fetchFeed: async (f) => (f.id === "yahoo" ? "<rss version='2.0'><channel></channel></rss>" : fixtureFetch(f)),
    });
    await call(newsRoute.GET, "GET", "/api/market/news", { jar: user.jar });
    expect((await getDetail(items[0].id)).status).toBe(200);
    // unknown / malformed ids, anonymous callers
    expect((await getDetail("0123456789abcdef")).status).toBe(404);
    const bad = await getDetail("not-an-id");
    expect(bad.status).toBe(404);
    expect(bad.body.error.code).toBe("NOT_FOUND");
    expect((await call(detailRoute.GET, "GET", `/api/market/news/${items[0].id}`, { params: { id: items[0].id } })).status).toBe(401);
  });

  it("items older than 7 days expire (404) and are pruned at the next refresh", async () => {
    const list = await call(newsRoute.GET, "GET", "/api/market/news", { jar: user.jar });
    const id = list.body.data.items[0].id as string;
    setNewsFetchers({ now: () => new Date(NOW.getTime() + 8 * 24 * 3_600_000), fetchFeed: fixtureFetch });
    expect((await getDetail(id)).status).toBe(404);
    await resetCache();
    await call(newsRoute.GET, "GET", "/api/market/news", { jar: user.jar });
    const db = await getDb();
    const left = (await db.execute(sql`select count(*)::int as n from market.news_item where id = ${id}`)).rows[0] as { n: number };
    expect(left.n).toBe(0);
  });
});

describe("QA-002 regression: a re-selected id is fully refreshed on conflict, not just source/summary/image", () => {
  it("persistPool: a second upsert for the same id overwrites EVERY served field, including publishedAt and region (not just the ones that happened to change first)", async () => {
    const id = "a0a2002000000001"; // 16 hex chars, as required by findNewsItem's id format check
    const first = {
      id, title: "Synthetic Regression A", source: "Outlet A", url: "https://example.test/qa002/regression",
      publishedAt: "2026-09-21T10:00:00.000Z", region: "global" as const, topic: "macro", category: "Economy",
      summary: "first summary", imageUrl: "https://example.test/img/a.jpg", feedId: "yahoo",
    };
    await persistPool([first], new Date("2026-09-21T10:05:00Z"));
    expect(await findNewsItem(id, new Date("2026-09-21T10:06:00Z"))).toMatchObject({ publishedAt: first.publishedAt, region: "global", title: "Synthetic Regression A" });

    // a later refresh re-selects the SAME id (same URL -> same id) with a NEW publishedAt (the feed updated its
    // timestamp, or a different cluster member became the representative) and different region/title/etc.
    const second = { ...first, title: "Synthetic Regression B", publishedAt: "2026-09-21T14:30:00.000Z", region: "armenia" as const, topic: "armenia_economy", category: "Armenia", summary: "second summary", imageUrl: "https://example.test/img/b.jpg" };
    await persistPool([second], new Date("2026-09-21T14:35:00Z"));
    const after = await findNewsItem(id, new Date("2026-09-21T14:36:00Z"));
    expect(after).toMatchObject({
      id, title: "Synthetic Regression B", publishedAt: second.publishedAt, region: "armenia", topic: "armenia_economy",
      category: "Armenia", summary: "second summary", imageUrl: "https://example.test/img/b.jpg",
    });
    expect(after!.publishedAt).not.toBe(first.publishedAt); // the whole point of the regression: this must have moved
  });

  it("end to end: GET /api/market/news/:id tracks the CURRENT list publishedAt across refreshes, not the first-ever one", async () => {
    const url = "https://example.test/qa002/e2e-story";
    const feed = (pubDate: string) =>
      `<?xml version="1.0" encoding="UTF-8"?><rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel><title>t</title><link>https://example.test/</link><description>d</description><language>en-US</language><ttl>5</ttl>` +
      `<item><title>Synthetic Regression Story: central bank holds interest rate steady</title><link>${url}</link><pubDate>${pubDate}</pubDate>` +
      `<source url="https://example.test/outlets/reg">Regression Outlet</source><guid isPermaLink="false">qa002-e2e</guid></item></channel></rss>`;
    // every OTHER feed fails, so this single controlled item is the only candidate and is guaranteed to be selected
    const only = (pubDate: string) => async (f: FeedConfig) => {
      if (f.id !== "yahoo") throw new Error("disabled for this regression test");
      return feed(pubDate);
    };

    await resetCache();
    setNewsFetchers({ now: () => NOW, fetchFeed: only(new Date(NOW.getTime() - 1 * 3_600_000).toISOString()) });
    const list1 = await getNews();
    expect(list1.data.items).toHaveLength(1);
    const id = list1.data.items[0].id;
    const detail1 = await findNewsItem(id, NOW);
    expect(detail1!.publishedAt).toBe(list1.data.items[0].publishedAt);

    // a later refresh: the SAME url/id, but a NEW publishedAt (e.g. the feed edited its timestamp)
    const later = new Date(NOW.getTime() + 6 * 3_600_000);
    await resetCache();
    setNewsFetchers({ now: () => later, fetchFeed: only(new Date(later.getTime() - 1 * 3_600_000).toISOString()) });
    const list2 = await getNews();
    expect(list2.data.items).toHaveLength(1);
    expect(list2.data.items[0].id).toBe(id); // same story, same id
    expect(list2.data.items[0].publishedAt).not.toBe(list1.data.items[0].publishedAt); // the feed really did move

    const detail2 = await findNewsItem(id, later);
    // this is exactly QA-002: before the fix, detail2.publishedAt stayed equal to detail1's (the first-ever insert)
    expect(detail2!.publishedAt).toBe(list2.data.items[0].publishedAt);
    expect(detail2!.publishedAt).not.toBe(detail1!.publishedAt);
    // and every other list-card field the route serves matches too (id, title, source, url, region, topic, category, summary, imageUrl)
    expect({ id: detail2!.id, title: detail2!.title, source: detail2!.source, url: detail2!.url, region: detail2!.region, topic: detail2!.topic, category: detail2!.category, summary: detail2!.summary, imageUrl: detail2!.imageUrl }).toEqual({
      id: list2.data.items[0].id, title: list2.data.items[0].title, source: list2.data.items[0].source, url: list2.data.items[0].url,
      region: list2.data.items[0].region, topic: list2.data.items[0].topic, category: list2.data.items[0].category,
      summary: list2.data.items[0].summary, imageUrl: list2.data.items[0].imageUrl,
    });
  });
});
