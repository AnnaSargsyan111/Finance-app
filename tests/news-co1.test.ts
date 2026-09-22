import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getDb, useTestDb } from "@/lib/db";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { resetCache } from "./helpers/db";
import { fixture } from "./helpers/fetch-mock";
import { makeSummary, parseFeed, pickImage } from "@/market/news/rss";
import { setNewsFetchers } from "@/market/news/service";
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
