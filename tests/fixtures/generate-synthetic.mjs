// Deterministic generator for the SYNTHETIC test fixtures (tests/fixtures/rss/*.xml and providers/yahoo_chart_*_1mo.json).
// Everything is invented: headlines, descriptions, outlets, URLs (https://example.test/...), prices. Nothing is copied from real
// news feeds or from Yahoo. Run:  node tests/fixtures/generate-synthetic.mjs   (output is stable; the files are committed).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NOW = Date.parse("2026-09-21T17:30:00Z"); // the fixed test clock (tests/news*.test.ts)
const COMMENT = "<!-- SYNTHETIC TEST DATA - invented text, not real news -->";
const XML = '<?xml version="1.0" encoding="UTF-8"?>';

/* ---------- invented vocabulary ---------- */
const S1 = ["ka", "vel", "tor", "mi", "sa", "dun", "ro", "lin", "fa", "gor"];
const S2 = ["mar", "qin", "vex", "lo", "tan", "bri", "zu", "pel", "nor", "ky"];
const S3 = ["ta", "dor", "wen", "sil", "ax", "mu", "ren", "jo", "pa", "ul"];
let wc = 0;
const cap = (s) => s[0].toUpperCase() + s.slice(1);
const pw = () => {
  const k = wc++;
  return cap(S1[k % 10] + S2[Math.floor(k / 10) % 10] + S3[Math.floor(k / 100) % 10]);
};
const pad = (n) => String(n).padStart(3, "0");

const PHRASES = {
  macro: ["central bank holds interest rate steady as inflation cools", "GDP growth estimate revised up on strong services", "jobs report shows unemployment edging lower", "treasury yield curve steepens after auction", "tariff talks resume between two trading blocs", "recession fears ease as factory orders rebound", "IMF trims world growth outlook for next year", "budget deficit narrows on higher tax receipts"],
  equities: ["earnings beat lifts retailer shares", "nasdaq closes at record on broad rally", "IPO priced above range in a busy week", "dividend increase announced by utility", "buyback plan unveiled by insurer", "stocks slip as investors await guidance", "analyst upgrades regional bank stock", "wall street opens lower after profit warning"],
  currency: ["oil prices slide on supply outlook", "gold climbs as the dollar softens", "copper demand outlook improves", "natural gas storage build exceeds forecast", "euro and pound edge up versus the dollar", "crude inventories fall more than expected", "bitcoin steadies after a volatile session", "OPEC output plan keeps traders cautious"],
  tech: ["chipmaker unveils new AI accelerator for data centers", "cloud revenue growth beats estimates", "software startup raises funding for AI tools", "semiconductor exports rise on data center demand", "AI partner expands compute capacity", "cloud provider signs multi-year chip supply deal", "startup demos low-power AI processor", "chip supplier reports record orders"],
  world: ["regional ferry service resumes after storm", "museum announces extended weekend hours", "city council approves new cycling lanes", "airport reports smooth holiday travel", "heatwave prompts water saving advice", "university opens new research campus"],
  amEcon: ["dram holds steady against the dollar in Yerevan trading", "central bank of Armenia keeps refinancing rate unchanged", "Armenia GDP growth accelerates in the first half", "state budget revenue exceeds plan on higher tax collection", "Armenian exports to neighbouring markets rise", "IT sector salaries outpace inflation in Armenia", "mining output rises as copper prices firm in Armenia", "fuel prices edge up at Yerevan stations", "banks in Armenia report higher mortgage lending", "energy tariff review planned in Armenia next quarter", "Armenia investment forum attracts new pledges", "pension fund assets grow in Armenia"],
  amOther: ["ministers attend national holiday reception in Yerevan", "folk festival opens in Gyumri", "delegation discusses regional cooperation in Armenia", "sports team returns to Yerevan after a friendly match"],
};
const GLOBAL_TOPICS = ["equities", "tech", "macro", "currency", "world"];
const OUTLETS = ["Example Wire", "Sample Markets Desk", "Test Ledger", "Placeholder Post", "Mock Business Daily", "Invented Financial Review"];
const AM_OUTLETS = ["Synthetic Gazette", "Fictional Caucasus Times", "Sample Economy Weekly", "Test Business Bulletin"];

/** a story = number + topic + phrase + 3 unique invented words (keeps titles from clustering by accident) */
function story(n, topic, phraseIdx) {
  const list = PHRASES[topic];
  return { n, topic, phrase: list[phraseIdx % list.length], w: [pw(), pw(), pw()] };
}
const title = (s, variant = "") => `Synthetic Headline ${pad(s.n)}: ${cap(s.phrase)} at ${s.w.join(" ")}${variant}`;
const desc = (s) => `Synthetic summary ${pad(s.n)}: invented text about ${s.phrase}. It mixes &amp; entities, an apostrophe (&#39;) and &quot;quotes&quot; only to exercise the parser. Fictional detail for ${s.w[0]} ${s.w[1]}.`;

/* ---------- date formatting ---------- */
const D = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const M = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const p2 = (n) => String(n).padStart(2, "0");
function rfc822(ageH, offsetH = 0) {
  const t = new Date(NOW - ageH * 3_600_000 + offsetH * 3_600_000);
  const sign = offsetH >= 0 ? "+" : "-";
  const tz = offsetH === 0 ? "GMT" : `${sign}${p2(Math.abs(offsetH))}00`;
  return `${D[t.getUTCDay()]}, ${p2(t.getUTCDate())} ${M[t.getUTCMonth()]} ${t.getUTCFullYear()} ${p2(t.getUTCHours())}:${p2(t.getUTCMinutes())}:${p2(t.getUTCSeconds())} ${tz}`;
}
const iso = (ageH) => new Date(NOW - ageH * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
const esc = (s) => s.replace(/&(?!(amp|#39|quot|nbsp);)/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** age of the i-th item: a steady walk back in time, every `staleEvery`-th item pushed outside the freshness windows */
const ageOf = (i, start, step, staleEvery = 0) => +(start + i * step + (staleEvery && i % staleEvery === staleEvery - 1 ? 62 : 0)).toFixed(2);

/** the same story appears in several feeds (near-duplicates for the dedupe step); one link carries utm_* tracking params */
const DUPS = [901, 902, 903, 904, 905].map((n, k) => story(n, GLOBAL_TOPICS[k % 4], k));
const AM_DUPS = [951, 952, 953].map((n, k) => story(n, "amEcon", k * 3));

function globalStories(startN, count, topicShift) {
  return Array.from({ length: count }, (_, i) => story(startN + i, GLOBAL_TOPICS[(i + topicShift) % 5], Math.floor(i / 5)));
}

function img(feed, n, k) {
  return k % 7 === 6 ? `http://example.test/img/${feed}/${pad(n)}.jpg` : `https://example.test/img/${feed}/${pad(n)}.jpg`; // every 7th image is insecure (must be dropped)
}

/** stories 901/902 share ONE URL across feeds (differing only in utm_* params) so canonical-URL dedupe is exercised; 903+ differ per feed (title-similarity dedupe) */
const shared = (n, utm) => (n === 901 || n === 902 ? `https://example.test/shared/${pad(n)}?${utm}` : null);

/* ---------- feed builders ---------- */
const files = {};

function yahoo() {
  const items = [];
  const st = globalStories(1, 46, 0);
  for (const [k, d] of DUPS.entries()) st.splice(2 + k * 6, 0, d); // dups near the top
  st.forEach((s, i) => {
    const age = ageOf(i, 0.2, 0.85, 11);
    const link = shared(s.n, "utm_source=yahoo&utm_medium=rss") ?? `https://example.test/yahoo/${pad(s.n)}.html${s.n >= 901 ? "?utm_source=yahoo&utm_medium=rss" : ""}`;
    items.push(`<item><title>${esc(title(s))}</title><link>${esc(link)}</link><pubDate>${iso(age)}</pubDate><source url="https://example.test/outlets/${i % 6}">${OUTLETS[i % 6]}</source><guid isPermaLink="false">yahoo-${pad(s.n)}</guid>${i % 9 === 8 ? "" : `<media:content height="86" url="${img("yahoo", s.n, i)}" width="130"/><media:credit role="publishing company"/>`}</item>`);
  });
  return `${XML}\n${COMMENT}\n<rss xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel><title>Synthetic Markets Feed A</title><link>https://example.test/</link><description>Invented feed used for tests</description><language>en-US</language><ttl>5</ttl>${items.join("")}</channel></rss>\n`;
}

function cnbc(id, startN, count, shift) {
  const st = globalStories(startN, count, shift);
  if (id === "top") DUPS.slice(0, 3).forEach((d, k) => st.splice(3 + k * 5, 0, d));
  const items = st.map((s, i) => {
    const link = shared(s.n, "utm_source=cnbc&utm_campaign=x") ?? `https://example.test/cnbc/${id}/${pad(s.n)}.html${s.n >= 901 ? "?utm_source=cnbc&utm_campaign=x" : ""}`;
    return `<item><link>${esc(link)}</link><guid isPermaLink="false">cnbc-${pad(s.n)}</guid><metadata:type>storyitem</metadata:type><metadata:id>${s.n}</metadata:id><metadata:sponsored>${i === 13 ? "true" : "false"}</metadata:sponsored><title>${esc(title(s))}</title><description><![CDATA[${desc(s).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')}]]></description><pubDate>${rfc822(ageOf(i, id === "top" ? 0.5 : 1.1, id === "top" ? 1.4 : 1.3, 10))}</pubDate></item>`;
  });
  return `${XML}\n${COMMENT}\n<rss xmlns:metadata="https://example.test/ns/metadata" version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><atom:link rel="self" type="application/rss+xml" href="https://example.test/cnbc/${id}.rss"/><language>en-us</language><ttl>60</ttl><title>Synthetic Desk ${id}</title>${items.join("")}</channel></rss>\n`;
}

function bloomberg() {
  const st = globalStories(300, 20, 2);
  DUPS.slice(0, 2).forEach((d, k) => st.splice(1 + k * 4, 0, d));
  const items = st.map((s, i) => `<item><title><![CDATA[${title(s)}]]></title><description><![CDATA[${desc(s).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')}]]></description><link>${esc(shared(s.n, "utm_source=bb") ?? `https://example.test/bloomberg/${pad(s.n)}${s.n >= 901 ? "?utm_source=bb" : ""}`)}</link><guid isPermaLink="false">bb-${pad(s.n)}</guid><dc:creator><![CDATA[Invented Author ${i}]]></dc:creator><pubDate>${rfc822(ageOf(i, 0.8, 2.2, 7))}</pubDate>${i % 5 === 0 ? `<media:thumbnail url="${img("bloomberg", s.n, i)}"/>` : ""}</item>`);
  return `${XML}\n${COMMENT}\n<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title><![CDATA[Synthetic Markets Feed B]]></title><description><![CDATA[Invented feed]]></description><link>https://example.test/bloomberg/</link><generator>synthetic</generator><lastBuildDate>${rfc822(0.1)}</lastBuildDate>${items.join("")}</channel></rss>\n`;
}

function guardian() {
  const st = globalStories(400, 34, 1);
  DUPS.slice(1, 4).forEach((d, k) => st.splice(2 + k * 5, 0, d));
  const items = st.map((s, i) => {
    const path = s.n % 8 === 0 ? "business/live" : "business";
    const cats = ["Business", "Economics", "World news", "Markets"].slice(0, 2 + (i % 3)).map((c) => `<category domain="https://example.test/guardian/${c.toLowerCase().replace(/ /g, "-")}">${c}</category>`).join("");
    const html = `<p>${desc(s)}</p><p><a href="https://example.test/guardian/live/${pad(s.n)}">Synthetic live blog - latest updates</a></p>`;
    return `<item><title>${esc(title(s))}</title><link>${esc(shared(s.n, "utm_source=gu&utm_medium=feed") ?? `https://example.test/${path}/2026/sep/21/${pad(s.n)}${s.n >= 901 ? "?utm_source=gu&utm_medium=feed" : ""}`)}</link><description>${esc(html)}</description>${cats}<pubDate>${rfc822(ageOf(i, 0.6, 1.15, 9))}</pubDate><dc:date>${iso(ageOf(i, 0.6, 1.15, 9))}</dc:date><dc:creator>Invented Reporter ${i % 5}</dc:creator><media:content width="140" url="${img("guardian", s.n, i)}"><media:credit scheme="urn:ebu">Invented Photographer</media:credit></media:content><media:content width="460" url="${img("guardian", s.n + 1000, i)}"/></item>`;
  });
  // items that must be filtered: opinion, sport, sponsored
  const extra = [
    `<item><title>Synthetic Opinion 001: why invented columnists love rate cuts</title><link>https://example.test/commentisfree/2026/sep/21/opinion-001</link><description>${esc("<p>Invented opinion text.</p>")}</description><category domain="https://example.test/guardian/opinion">Opinion</category><pubDate>${rfc822(1.5)}</pubDate><dc:date>${iso(1.5)}</dc:date></item>`,
    `<item><title>Synthetic Sport 002: invented cup final preview</title><link>https://example.test/sport/2026/sep/21/sport-002</link><description>${esc("<p>Invented sport text.</p>")}</description><category domain="https://example.test/guardian/sport">Sport</category><pubDate>${rfc822(2.5)}</pubDate><dc:date>${iso(2.5)}</dc:date></item>`,
    `<item><title>Synthetic Sponsored 003: invented paid content about savings</title><link>https://example.test/business/2026/sep/21/sponsored-003</link><description>${esc("<p>Invented paid text.</p>")}</description><category domain="https://example.test/guardian/sponsored">Sponsored</category><pubDate>${rfc822(3.5)}</pubDate><dc:date>${iso(3.5)}</dc:date></item>`,
  ];
  return `${XML}\n${COMMENT}\n<rss xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/" version="2.0"><channel><title>Synthetic Business Feed C</title><link>https://example.test/business</link><description>Invented feed used for tests</description><language>en-gb</language><pubDate>${rfc822(0.1)}</pubDate><dc:date>${iso(0.1)}</dc:date>${[...items, ...extra].join("")}</channel></rss>\n`;
}

function bbc() {
  const st = globalStories(500, 50, 3);
  DUPS.slice(2).forEach((d, k) => st.splice(1 + k * 6, 0, d));
  const items = st.map((s, i) => `<item><title><![CDATA[${title(s)}]]></title><description><![CDATA[${desc(s).replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&quot;/g, '"')}]]></description><link>${esc(shared(s.n, "utm_source=bbc") ?? `https://example.test/bbc/articles/${pad(s.n)}?at_campaign=rss&at_medium=RSS${s.n >= 901 ? "&utm_source=bbc" : ""}`)}</link><guid isPermaLink="false">https://example.test/bbc/articles/${pad(s.n)}#0</guid><pubDate>${rfc822(ageOf(i, 0.4, 0.9, 8))}</pubDate><media:thumbnail width="240" height="135" url="${img("bbc", s.n, i)}"/></item>`);
  return `${XML}\n${COMMENT}\n<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title><![CDATA[Synthetic Business Feed D]]></title><description><![CDATA[Invented feed]]></description><link>https://example.test/bbc</link>${items.join("")}</channel></rss>\n`;
}

function nyt() {
  const st = globalStories(600, 46, 4);
  DUPS.slice(0, 3).forEach((d, k) => st.splice(4 + k * 7, 0, d));
  const items = st.map((s, i) => {
    const url = `https://example.test/nyt/2026/09/21/business/${pad(s.n)}.html`;
    const linkText = shared(s.n, "utm_source=nyt&utm_medium=rss") ?? `${url}${s.n >= 901 ? "?utm_source=nyt&utm_medium=rss" : ""}`;
    // <link> plus <atom:link> inside every item: the two collapse to one key once namespace prefixes are removed
    return `<item><title>${esc(title(s))}</title><link>${esc(linkText)}</link><guid isPermaLink="true">${url}</guid><atom:link href="${url}" rel="standout"></atom:link><description>${esc(desc(s))}</description><dc:creator>Invented Writer ${i % 4}</dc:creator><pubDate>${rfc822(ageOf(i, 0.7, 0.95, 12))}</pubDate><category domain="https://example.test/nyt/des">Business</category><category domain="https://example.test/nyt/des">Invented Topic ${i % 5}</category><media:content height="151" medium="image" url="${img("nyt", s.n, i)}" width="151"/></item>`;
  });
  return `${XML}\n${COMMENT}\n<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:atom="http://www.w3.org/2005/Atom" version="2.0"><channel><title>Synthetic Business Feed E</title><link>https://example.test/nyt/business</link><atom:link href="https://example.test/nyt/business.rss" rel="self" type="application/rss+xml"></atom:link><description></description><language>en-us</language>${items.join("")}</channel></rss>\n`;
}

function ft() {
  const st = globalStories(700, 12, 0);
  const items = st.map((s, i) => `<item><title><![CDATA[${title(s)}]]></title><description><![CDATA[Invented summary ${pad(s.n)}.]]></description><link>https://example.test/ft/content/${pad(s.n)}</link><guid isPermaLink="false">ft-${pad(s.n)}</guid><pubDate>${rfc822(ageOf(i, 1, 2))}</pubDate><media:thumbnail url="https://example.test/img/ft/${pad(s.n)}.jpg"></media:thumbnail></item>`);
  return `${XML}\n${COMMENT}\n<rss xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:media="http://search.yahoo.com/mrss/" version="2.0"><channel><title><![CDATA[Synthetic Homepage Feed F]]></title><link>https://example.test/ft</link>${items.join("")}</channel></rss>\n`;
}

function armenpress() {
  const items = [];
  const econ = Array.from({ length: 12 }, (_, i) => story(1000 + i, "amEcon", i));
  const other = Array.from({ length: 40 }, (_, i) => story(1100 + i, "amOther", i));
  const econAges = [3, 9, 20, 30, 44, 60, 75, 95, 5, 15, 26, 50];
  const mk = (s, age, cats, i, econ) => `<item><title>\n   <![CDATA[${title(s)}]]>\n  </title><link>https://example.test/armenpress/article/${s.n}${s.n >= 951 ? "?utm_source=ap" : ""}</link><pubDate>${rfc822(age, 4)}</pubDate><guid isPermaLink="true">https://example.test/armenpress/article/${s.n}</guid>${i % 6 === 5 ? "" : `<enclosure url="https://example.test/img/armenpress/${s.n}.webp" length="${100000 + s.n}" type="image/webp"/>`}<categories>${cats.map((c) => `<category>${c}</category>`).join("")}</categories></item>`;
  AM_DUPS.forEach((d, k) => items.push(mk(d, 4 + k * 7, ["Economy", "Armenia"], k, true)));
  econ.forEach((s, i) => items.push(mk(s, econAges[i], i % 3 === 0 ? ["Economy", "Financial Markets"] : ["Economy", "Armenia"], i + 1, true)));
  other.forEach((s, i) => {
    const cats = i % 10 === 3 ? ["Culture", "Armenia"] : i % 4 === 0 ? ["World"] : ["Politics", "Armenia"];
    items.push(mk(s, 1.5 + i * 1.7, cats, i, false));
  });
  return `${XML}\n${COMMENT}\n<rss xmlns:atom="https://www.w3.org/2005/Atom" version="2.0"><channel><atom:link href="https://example.test/armenpress/rss" rel="self" type="application/rss+xml" /><title>Synthetic Agency Feed G</title><link>https://example.test/armenpress</link><description>Invented feed</description><language>en</language>${items.join("\n")}</channel></rss>\n`;
}

function newsam() {
  const items = [];
  let n = 1200;
  const push = (s, age, extraImg) => items.push(`<item><title>${esc(title(s))}</title><link>https://example.test/newsam/news/${s.n}</link><pubDate>${rfc822(age, 4)}</pubDate>${extraImg ? `<media:content url="https://example.test/img/newsam/${s.n}.webp" medium="image" />` : ""}</item>`);
  AM_DUPS.forEach((d, k) => push(d, 6 + k * 5, true));
  for (let i = 0; i < 97; i++) {
    const age = 0.7 + i * 0.9;
    const kind = i % 4;
    if (kind === 0) push(story(n++, "amEcon", i), age, true); // relevant: Armenia entity + economic keywords
    else if (kind === 1) push(story(n++, "amOther", i), age, true); // entity but no economic content -> below relevance
    else if (kind === 2) push(story(n++, "world", i), age, false); // no Armenia entity at all
    else push(story(n++, "macro", i), age, false); // economic words but no Armenia entity -> filtered out
  }
  return `${XML}\n${COMMENT}\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><title>Synthetic Agency Feed H</title><link>https://example.test/newsam</link><description>Invented feed</description>${items.join("")}</channel></rss>\n`;
}

function google() {
  const items = [];
  let n = 1500;
  const push = (s, age, outlet) => {
    const url = `https://example.test/gn/articles/${s.n}?oc=5`;
    const t = `${title(s)} - ${outlet}`;
    items.push(`<item><title>${esc(t)}</title><link>${esc(url)}</link><guid isPermaLink="false">gn-${s.n}</guid><pubDate>${rfc822(age)}</pubDate><description>${esc(`<a href="${url}" target="_blank">${esc(t)}</a>&nbsp;&nbsp;<font color="#6f6f6f">${outlet}</font>`)}</description><source url="https://example.test/outlets/${outlet.replace(/ /g, "-")}">${outlet}</source></item>`);
  };
  AM_DUPS.forEach((d, k) => push(d, 5 + k * 6, AM_OUTLETS[k % 4]));
  for (let i = 0; i < 97; i++) push(story(n++, i % 5 === 4 ? "amOther" : "amEcon", i + 3), 1 + i * 1.05, AM_OUTLETS[i % 4]);
  return `${XML}\n${COMMENT}\n<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/"><channel><generator>synthetic</generator><title>"Synthetic query" - Synthetic Aggregator</title><link>https://example.test/gn/search</link><language>en-US</language><lastBuildDate>${rfc822(0.1)}</lastBuildDate>${items.join("")}</channel></rss>\n`;
}

files["yahoo.xml"] = yahoo();
files["cnbc_top.xml"] = cnbc("top", 100, 27, 0);
files["cnbc_finance.xml"] = cnbc("finance", 200, 30, 2);
files["bloomberg_markets.xml"] = bloomberg();
files["guardian_business.xml"] = guardian();
files["bbc_business.xml"] = bbc();
files["nyt_business.xml"] = nyt();
files["ft.xml"] = ft();
files["armenpress.xml"] = armenpress();
files["newsam.xml"] = newsam();
files["googlenews_armenia.xml"] = google();

fs.mkdirSync(path.join(HERE, "rss"), { recursive: true });
for (const [name, xml] of Object.entries(files)) fs.writeFileSync(path.join(HERE, "rss", name), xml);

/* ---------- synthetic Yahoo-shaped charts (invented prices) ---------- */
const CHARTS = { NVDA: [137.42, 0.3], AAPL: [181.05, 1.1], GOOGL: [152.3, 2.0], MSFT: [402.75, 0.7], AMZN: [168.9, 1.6] };
const dates = [];
for (let d = Date.parse("2026-08-21T00:00:00Z"); d <= Date.parse("2026-09-21T00:00:00Z"); d += 86_400_000) {
  const dt = new Date(d);
  const iso10 = dt.toISOString().slice(0, 10);
  if (dt.getUTCDay() !== 0 && dt.getUTCDay() !== 6 && iso10 !== "2026-09-07") dates.push(iso10); // 21 trading days
}
for (const [sym, [base, phase]] of Object.entries(CHARTS)) {
  const close = dates.map((_, i) => Math.round(base * (1 + 0.012 * Math.sin(i * 0.7 + phase) + 0.0025 * i) * 1e4) / 1e4);
  const ts = dates.map((d) => Date.parse(`${d}T13:30:00Z`) / 1000);
  const last = close[close.length - 1];
  const json = {
    _synthetic: true,
    _note: "SYNTHETIC TEST DATA - invented prices in the shape of a Yahoo v8/chart response; not market data",
    chart: {
      result: [
        {
          meta: {
            currency: "USD", symbol: sym, exchangeName: "SYN", instrumentType: "EQUITY", regularMarketTime: ts[ts.length - 1] + 23_400, gmtoffset: -14400, timezone: "EDT",
            exchangeTimezoneName: "America/New_York", regularMarketPrice: last, fiftyTwoWeekHigh: Math.round(Math.max(...close) * 1.15 * 100) / 100, fiftyTwoWeekLow: Math.round(Math.min(...close) * 0.6 * 100) / 100,
            longName: `Synthetic ${sym} Corp`, shortName: `Synthetic ${sym}`, chartPreviousClose: close[0], dataGranularity: "1d", range: "1mo",
          },
          timestamp: ts,
          indicators: {
            quote: [{ open: close.map((c) => Math.round(c * 0.998 * 1e4) / 1e4), high: close.map((c) => Math.round(c * 1.006 * 1e4) / 1e4), low: close.map((c) => Math.round(c * 0.99 * 1e4) / 1e4), close, volume: close.map((_, i) => 1_000_000 + i * 10_000) }],
            adjclose: [{ adjclose: close }],
          },
        },
      ],
      error: null,
    },
  };
  fs.writeFileSync(path.join(HERE, "providers", `yahoo_chart_${sym}_1mo.json`), JSON.stringify(json));
}
console.log("synthetic fixtures written:", Object.keys(files).length, "feeds,", Object.keys(CHARTS).length, "charts,", dates.length, "bars each");
