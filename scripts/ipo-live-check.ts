/** Prints what the IPO sources return right now (no database): npx tsx scripts/ipo-live-check.ts */
import { nasdaqIpo } from "../src/market/providers/nasdaq";
import { mergeIpos, dropOutdated } from "../src/market/ipo/service";
import { fetchIpoNews } from "../src/market/ipo/news";

async function main() {
  const months = ["2026-09", "2026-10", "2026-11", "2026-12", "2027-01"];
  const rows = (await Promise.all(months.map((m) => nasdaqIpo.month(m)))).flat();
  const items = dropOutdated(mergeIpos(rows), new Date().toISOString().slice(0, 10));
  const by = (s: string) => items.filter((i) => i.status === s);
  console.log("nasdaq rows:", rows.length, "merged:", items.length, Object.fromEntries(["expected", "filed", "priced", "withdrawn"].map((s) => [s, by(s).length])));
  for (const i of by("expected")) console.log(" expected", i.date, i.symbol, i.name, i.priceLow, i.priceHigh, i.exchange, i.shares, i.dealSizeUsd);
  for (const i of by("filed").slice(0, 4)) console.log(" filed  ", i.filedDate, i.symbol, i.name, i.dealSizeUsd);
  for (const i of by("priced").slice(0, 3)) console.log(" priced ", i.date, i.symbol, i.name, i.priceLow);
  const news = await fetchIpoNews();
  console.log("news:", news.length);
  for (const n of news.slice(0, 8)) console.log(" ", n.publishedAt.slice(0, 10), n.outlet, "|", n.title);
}
main().catch((e) => { console.error(e); process.exit(1); });
