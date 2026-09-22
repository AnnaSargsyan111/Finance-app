# Test fixtures

Nothing in this folder is real third-party news or Yahoo market data. Do not add recorded copies of publisher feeds or of
Yahoo responses (the repository is public).

## Synthetic (invented) data
| Path | What it is |
|---|---|
| `rss/*.xml` (11 feeds) | **Invented** RSS feeds: headlines like `Synthetic Headline 007: ...`, invented descriptions, invented outlets, URLs on `https://example.test/...`, images on `https://example.test/img/...`. Each file starts with `<!-- SYNTHETIC TEST DATA - invented text, not real news -->`. They mimic the *structure* the parsers and tests rely on: pubDate formats (RFC 822 with GMT / +0400, ISO Z), CDATA and escaped-HTML descriptions with entities, `media:content` / `media:thumbnail` / `enclosure` / `<img>` image patterns (including insecure `http://` images that must be dropped), `<source>` outlets, Armenpress-style `<categories>`, NYT-style `<link>` + `<atom:link>`, cross-feed near-duplicate stories (some sharing one canonical URL with different `utm_*` params), stale items outside the 48 h / 72 h windows, opinion / sport / sponsored / live-blog items that must be filtered, and Armenia-relevant items (dram, central bank of Armenia, GDP, budget, tax ...). |
| `providers/yahoo_chart_{NVDA,AAPL,GOOGL,MSFT,AMZN}_1mo.json` | **Invented** prices (21 trading days ending 2026-09-21) in the shape of a Yahoo `v8/chart` response, with a top-level `"_synthetic": true` key (the parser ignores it). Company names are `Synthetic <TICKER> Corp`. |
| `providers/yahoo_chart_invalid.json` | A hand-written minimal "symbol not found" error body (contains no market data). |
| `providers/finnhub/*`, `providers/twelvedata/*` | Synthetic vendor-shaped fixtures with obviously fake round numbers; each carries a `_fixture`/`_note` marker. Used by `KEYED_PROVIDER_MODE=fixture`. |
| `generate-synthetic.mjs` | The generator for the RSS feeds and the Yahoo-shaped charts. Deterministic: `node tests/fixtures/generate-synthetic.mjs` rewrites the same files. The test clock is fixed at `2026-09-21T17:30:00Z`, feed timestamps are offsets from it. |

Ticker symbols such as NVDA/AAPL are only labels for the five display companies; the numbers behind them are invented.

## Official / open data (kept)
| Path | Source | Licence / terms |
|---|---|---|
| `cba/*.xml` | Central Bank of Armenia public SOAP API (official reference exchange rates) | official public data; terms of use not located |
| `frankfurter/*.json` | Frankfurter API (`providers=CBA`, the same CBA rates re-served) | open source service |
| `fawazahmed0/*.json` | fawazahmed0 currency-api (values trimmed to the AMD rate) | CC0 |

These are exchange-rate numbers only; they contain no news text and no company market data.
