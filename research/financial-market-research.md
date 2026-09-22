# Financial Market Research & Agent Handover

**Project:** Personal finance + market information + investment recommendation web app (Armenia)
**Phase:** Researcher only · **Author:** Researcher agent · **Date:** 2026-09-21
**Status:** **APPROVED by the product owner (2026-09-21).** Backend is activated first; Frontend and QA remain inactive until the owner says otherwise. The Researcher phase itself built no application code, API integration, authentication or database.

> **READ §17 (Change Order 1 — Finova frontend spec, 2026-09-21) FIRST. It supersedes conflicting text in §1–§16** (Personal Finance becomes period-based, news gets summary/image/detail page, recommendation history is added, FX gets a longer period selector, recommendations get a score). Frontend spec: `research/finova-frontend-spec.md`.

**Owner rulings at approval (override anything below that says otherwise)**
1. **Framework: Next.js on Vercel.** No existing finance-app project exists in `komp/` (other projects there are unrelated), so this is a **new** project — scaffold it in `komp/finance-app/`. Do **not** migrate, rewrite or touch any existing project (including React/Vite ones) just to change frameworks.
2. **Emergency-money checkbox is KEPT as a required, additional input** with the exact label **"This money isn't needed for emergencies."** It sits alongside amount, risk tolerance and horizon. API field: `notNeededForEmergencies: true` (must be `true` or the request is rejected).
3. **Sign-up consent is SKIPPED.** Educational project: no consent checkbox/notice and no legal/data-protection requirements at this stage. (Production note remains in §9.)
**Supersedes:** the earlier draft `finance-app-research/RESEARCH_HANDOVER.md` (removed).

**Confidence tags**

| Tag | Meaning |
|---|---|
| **[V]** | Verified — I called the endpoint / opened the page during this phase (evidence log §15) |
| **[D]** | Documented — vendor or reputable third-party documentation, not tested by me |
| **[U]** | Unverified — plausible, must be checked before relying on it (spike, §13) |
| **[R]** | Researcher recommendation / design decision (a judgement, not a fact) |

---

## 0. Executive summary

### 0.1 Final product decisions (from the product owner, 2026-09-21)

| # | Decision |
|---|---|
| 1 | **Accounts required.** Registration (first name, last name, email, password) + login + forgot-password. Personal-finance data is persisted server-side per user, never browser-only. |
| 2 | Balance uses a **chosen date range**, default = **current month**. |
| 3 | **English only** for v1. |
| 4 | **Whole app behind login** (Personal Finance, Market Information, Investment). |
| 5 | News: ~**6 items, 2–3 may be Armenia-specific**, rest global markets; refreshable. |
| 6 | Recommendation universe: **S&P 500 stocks** (NVDA/AAPL/GOOGL/MSFT/AMZN are only the *display* list, not a recommendation list). |
| 7 | Investment inputs: **AMD amount, risk (Low/Medium/High), horizon (Short <2 y / Medium 2–5 y / Long >5 y)**; amount shown in AMD and USD. **Whole shares only.** |
| 8 | Personal Finance and Investment are **completely independent**. Recommendations are **not saved** to accounts. |
| 9 | Benchmark comparison **included** for the portfolio recommendation. |
| 10 | **No ML.** Deterministic, transparent scoring only. **No trade execution, no broker integration.** |
| 11 | Prototype now, **may become a real product** → every major decision below lists *Prototype* vs *Production*. |
| 12 | Deployed on **Vercel**. Visual/UI requirements will be supplied separately. |

### 0.2 Recommendations at a glance

| Area | Prototype recommendation | Main production change |
|---|---|---|
| **Auth** | **Better Auth** (library, users in *our* DB) — email+password, cookie sessions, forgot-password via **Resend** | Password policy per NIST 800-63B, MFA option, verified email, audit log, legal review |
| **Database** | **Neon Postgres** (Vercel Marketplace) + Drizzle ORM; separate schemas `auth`, `pf`, `market` | Paid plan, backups/PITR, DB roles per module, region/residency decision |
| **FX** | **CBA API** (official, verified) → Frankfurter-CBA → fawazahmed0 fallback; persist daily rates in DB | Keep CBA as reference; add SLA-backed vendor fallback |
| **Stocks (display)** | Finnhub + Twelve Data free keys | Paid, licensed market data |
| **Stocks (universe)** | S&P 500 constituents CSV + **SEC EDGAR "frames"** for fundamentals (verified) + batch price history | Licensed constituents + price data |
| **News** | RSS: global (Yahoo, CNBC, Bloomberg, Guardian, BBC, NYT) + Armenia (Armenpress *Economy*, News.am, Google-News query) → title/source/time/link only | Licensed news API / syndication agreements |
| **Recommendation** | Factor scoring (Quality, Value, Growth, Momentum, Low-Risk, Income) × risk/horizon weights → single stock or 3–12-holding portfolio | Backtested calibration, legal sign-off, licensed data |
| **Benchmark** | **VOO** (S&P 500 ETF, adjusted close = total return) vs recommended portfolio; 1-Y default window | Licensed index total-return series |

### 0.3 Findings that shaped the plan
1. **CBA handles weekends/holidays itself**, but its date-range call omits non-working days → backend still forward-fills the chart. Verified on a real holiday (Mon 2026-09-21, Independence Day) **[V]**.
2. **SEC EDGAR "frames" make a 500-stock fundamentals refresh cheap**: ~12 calls, 0.3–0.9 MB each, <1 s each **[V]** — small enough for one serverless run. But coverage is **~93 % for revenue and only ~37 % for Gross Profit** across S&P 500 → factor design must use fallbacks (§5.4).
3. **Vercel Hobby cron = once per day** **[D]** → FX/news refresh must be **on-demand with stale-while-revalidate**, not polled.
4. The reference sign-up screen (Aira, eye-color-detection.vercel.app) uses composition rules (8+, upper, lower, number, symbol) **[V]**, which NIST 800-63B (rev. 4) now advises against **[D]** → mirror it in the prototype, change for production (§2.4).
5. **Armenia-specific finance news is thin** in free English feeds; only Armenpress exposes a usable `Economy` category **[V]**. Plan for a *soft* quota (target 2, up to 3, never forced) (§6).
6. **Benchmark honesty:** any "portfolio vs S&P 500" chart built from *today's* selection is a hindsight back-test and must be labelled so (§8.4).

---

## 1. Product separation & architecture

### 1.1 Three product areas + one platform layer (never mixed)

```
                     ┌───────────────────────── Platform: Auth & Session ─────────────────────────┐
                     │  sign-up · login · logout · forgot-password · route guard (session only)   │
                     └───────────────┬───────────────────────┬───────────────────────┬────────────┘
                                     │                       │                       │
                     ┌───────────────▼──────┐   ┌────────────▼───────────┐   ┌───────▼────────────────────┐
                     │ 1. PERSONAL FINANCE  │   │ 2. MARKET INFORMATION  │   │ 3. INVESTMENT RECOMMENDATION│
                     │ income/expenses/     │   │ FX rates · 5 stocks ·  │   │ amount+risk+horizon →       │
                     │ balance/charts       │   │ news                   │──▶│ single stock | portfolio    │
                     │ schema: pf.*         │   │ schema: market.*       │   │ + allocation + benchmark    │
                     │ user-owned data      │   │ shared public data     │   │ stateless, saves nothing    │
                     └──────────────────────┘   └────────────────────────┘   └─────────────────────────────┘
                              ✖ no arrow between pf and the other two, in either direction
```

**Dependency rules (enforced by tests and, in production, by DB roles)**

| From ↓ / To → | `pf` (Personal Finance) | `market` (Market Info) | `invest` (Investment) | `auth` |
|---|---|---|---|---|
| **pf** | own | ✖ | ✖ | session only |
| **market** | ✖ | own | ✖ | session only |
| **invest** | ✖ **never** | **read-only** (FX latest, universe snapshot, price history) | own | session only |

*Why `invest → market` is allowed:* requirement #8 says recommendations use "market data, stock/company data and other external financial data". Investment **consumes market data services**; it is not part of the Market Information UI and it never touches user finance data.

**Implementation guarantees [R]**
- **Prototype:** separate Postgres schemas + separate code folders; an automated import-lint/test fails the build if `invest/` or `market/` imports from `pf/` (or vice-versa) and if any SQL in `invest/` references `pf.`.
- **Production:** separate DB roles: `app_pf` (only `pf`,`auth`), `app_market` (only `market`), `app_invest` (`SELECT` on `market` only). A bug can then no longer leak finance data into recommendations.

### 1.2 Stack **[R]** — Next.js/Vercel **confirmed by the owner**; remaining choices are the Researcher's recommendation (deviate only with a written reason in `README-backend`)

| Layer | Prototype | Production change |
|---|---|---|
| Framework / hosting | **Next.js (App Router, TypeScript) on Vercel**; Route Handlers as the API | Same; add WAF/rate-limit tier, observability |
| Auth | **Better Auth** | + MFA, breach-password check, audit log |
| DB | **Neon Postgres** via Vercel Marketplace + **Drizzle ORM** | Paid plan, PITR backups, per-module roles |
| Validation | Zod schemas on every route | same |
| Email | **Resend** (forgot-password) | Own domain, SPF/DKIM/DMARC, bounce handling |
| Cache / locks | Postgres tables (`market.cache_entry`, advisory lock); optional Upstash Redis for rate limiting | Redis/Upstash for rate limits and locks |
| Scheduled work | Vercel Cron (1×/day) + **GitHub Actions** scheduled workflow for heavy batches | Dedicated worker/queue |
| Secrets | Vercel environment variables, server-only | Secret manager, rotation |

Existing projects in this workspace use React/Vite; Next.js is proposed because auth cookies, API routes and cron all live in one Vercel-native repo. A Vite SPA + separate API is possible but adds a second deployable.

### 1.3 Vercel constraints **[D]** (details to verify in the spike)
- Serverless = **stateless**: no reliable in-memory cache or local files across invocations → cache in DB.
- **Hobby cron: at most once per day**, fires anywhere within the scheduled hour; up to 100 cron jobs per project (since Jan 2026).
- **Function max duration [U]** on Hobby — a 500-symbol price pull at 8 req/min (~63 min) cannot run inside one invocation → run heavy batches in **GitHub Actions** (free) writing to the DB.
- Vercel KV/Postgres were retired (Dec 2024) → use Marketplace partners (Neon, Upstash).
- **Hobby plan is for non-commercial personal use** **[D]** — consistent with "personal prototype", *not* with a commercial product (production change: Pro plan).
- Public URL ⇒ every API route can be hit by strangers → **no user request may trigger unbounded upstream calls**; whole app is behind login (decision #4), which also protects free data quotas.

### 1.4 Caching & refresh policy (shared)

| Data | TTL | Refresh trigger | Notes |
|---|---|---|---|
| FX latest | 30–60 min | on demand when stale (lock-guarded) | CBA publishes once per working day |
| FX history (30 d) | 6 h | on demand | also persisted daily to `market.fx_rate` |
| Stock quotes (5) | 60 s | on demand | budget: Finnhub 60/min |
| Stock fundamentals (5) | 24 h | on demand | |
| News (6 selected) | 15 min | on demand + manual refresh (throttled 1/30 s/user) | never calls upstream per user request |
| Universe snapshot | daily | nightly batch (GitHub Actions / cron) | Investment reads only this |
| Price history (universe + benchmark) | daily incremental | nightly batch | |

**Stale-while-revalidate rule:** always return the last good value with `stale:true` + `asOf` if upstream fails; use a lock so concurrent users cause at most one upstream refresh.

### 1.5 Standard API conventions
- All routes under `/api/...`, JSON, UTF-8; auth by session cookie; every route returns `401` if no session.
- Success envelope for market/invest data: `{ data, meta: { asOf, source, stale, isDelayed? } }`.
- Error envelope: `{ error: { code, message, fields?: { fieldName: message } } }`; codes are stable strings (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `RATE_LIMITED`, `UPSTREAM_UNAVAILABLE`, `NO_ELIGIBLE_STOCK`, …).
- Money: decimal **strings** in JSON (never floats). Dates: ISO `YYYY-MM-DD` (calendar dates) or ISO-8601 UTC timestamps. Display timezone `Asia/Yerevan` (UTC+4, no DST — CBA timestamps carry `+04:00` **[V]**).

---

## 2. Research: Authentication & persistent database

### 2.1 Requirement
Registration (First name, Last name, Email, Password), login, then access personal data; simplicity similar to the reference. Data persistent and tied to the account.

### 2.2 Reference flow (functional only) **[V]** — https://eye-color-detection.vercel.app (branded *Aira*)
- **Create Account:** First Name, Last Name, Email, Password (show/hide toggle), **live rule checklist** (8+ characters, Uppercase, Lowercase, Number, Symbol), button *Create account*, link *Already have an account? Log in*. No confirm-password field, no social login, no terms checkbox visible.
- **Log in:** *Email address*, *Password* (show/hide), *Forgot password?* link, *Log in* button, link *Don't have an account yet? Sign up*.
- Sign-up and login are two states of one page (link toggles between them). I did **not** submit anything or create an account.

### 2.3 Option comparison

| | **Better Auth** ★ | Supabase Auth (+DB) | Clerk | Auth.js (NextAuth v5) | Roll-your-own |
|---|---|---|---|---|---|
| Email+password, sessions | yes **[D]** | yes **[D]** | yes (hosted UI) **[D]** | yes, credentials flow is awkward **[D]** | you build/maintain |
| Where user data lives | **our DB** | Supabase DB | Clerk's cloud | our DB | our DB |
| Cost | free (OSS) | free tier | free to 50k MAU then $0.02/MAU **[D]** | free | free |
| Maintenance status | actively developed; Auth.js team joined it (Sep 2025) **[D]** | active | active | **security-patch maintenance only** since Sep 2025 **[D]** | — |
| Extra fields (firstName/lastName) | configurable additional fields **[U]** | user metadata | metadata | custom | trivial |
| Fit for financial data | good (data ownership) | good (RLS gives row-level authz) | data-ownership concern for regulated data **[D]** | ok | risky (crypto mistakes) |
| Verdict | **Prototype recommendation** | Strong alternative if you prefer one vendor for DB+auth | Fastest UI, less control | Avoid for new projects | Avoid (do not hand-roll password crypto/session logic) |

Lucia was deprecated in Mar 2025 **[D]** → do not use.

### 2.4 Security requirements (both prototype and production)

| Topic | Prototype | Production change |
|---|---|---|
| Password hashing | **Argon2id** (≥19 MiB, 2 iterations, p=1) or **scrypt** (N=2^17,r=8,p=1) per OWASP **[D]**; whichever the library uses must meet this — verify in spike | same; tune cost to hardware |
| Password rules | **Mirror the reference**: ≥8 chars + upper + lower + number + symbol, live checklist | **NIST 800-63B rev.4:** ≥15 chars for single-factor (≥8 only with MFA), **no composition rules**, screen against breached-password list, allow paste/password managers **[D]** |
| Sessions | server-side sessions in DB, cookie `HttpOnly; Secure; SameSite=Lax`, 7-day sliding expiry, revocable, rotate on login | + device list, "log out everywhere", idle timeout |
| Login abuse | rate limit 5 failures / 15 min per (email, IP); generic error ("Email or password is incorrect") — no user enumeration; same for forgot-password ("If an account exists, we sent an email") | + CAPTCHA/step-up on repeated failure, alerting |
| Forgot password | single-use token, ≤60 min, stored **hashed**, sent via Resend | + verified email at sign-up (owner chose *forgot-password only* for v1) |
| Authorization | every query filters `user_id = session.userId` (server-side, never trusting client ids) | + Postgres RLS / separate DB role |
| CSRF | SameSite cookies + origin check on state-changing routes | + CSRF tokens for cross-site embeds |
| Transport | HTTPS only (Vercel default) | HSTS |
| Account lifecycle | delete-account (hard delete of `pf` data) + export as CSV/JSON | retention policy, audit trail |
| Logging | never log passwords/tokens/financial amounts | central log redaction |

**Personal-data law:** Armenia's Law on Protection of Personal Data (2015, amended) requires a lawful basis (usually consent) and gives data-subject rights; oversight by the Personal Data Protection Agency under the Ministry of Justice **[D]**. → **Owner decision: consent notice/checkbox SKIPPED for the educational prototype** — sign-up stays exactly as the reference flow (no extra field). *Production item:* add consent/notice, privacy policy, export/delete tooling, and get a legal view on cross-border storage (Neon region outside Armenia) **[U]**.

### 2.5 Database options

| | **Neon Postgres** ★ | Supabase Postgres | Vercel Blob / KV |
|---|---|---|---|
| Free tier | 0.5 GB, 100 CU-hours/month, scale-to-zero after 5 min idle **[D]** | 500 MB, project pauses after inactivity **[U]** | Blob 1 GB (files only) **[D]**; KV = Upstash Redis |
| Fit | relational, transactional, Drizzle/Prisma, Marketplace-integrated | same + built-in auth/RLS | not suitable for transactions/reports |
| Cold start | first query after idle is slower **[D]** | — | — |

**Estimated size [R]:** transactions ≈ 200 B/row → 100k rows ≈ 20 MB; universe price history 500 symbols × ~780 daily bars ≈ 390k rows ≈ 30–40 MB. Comfortably inside 0.5 GB for a prototype.

### 2.6 Data model (design, not implemented)

```
auth.user        id, email (unique, lower-cased), first_name, last_name, password_hash*, created_at   (*managed by auth library)
auth.session     id, user_id, expires_at, ip, user_agent          (library-managed)
auth.reset_token id, user_id, token_hash, expires_at, used_at     (library-managed)

pf.category      id uuid, user_id, name, kind ('income'|'expense'), is_default bool, created_at   UNIQUE(user_id, kind, lower(name))
pf.transaction   id uuid, user_id, category_id → pf.category, kind, amount numeric(14,2) CHECK(amount>0),
                 occurred_on date, note text NULL, created_at, updated_at        INDEX(user_id, occurred_on)

market.fx_rate         iso, rate_date date, rate numeric(12,4), amount int, source, fetched_at     PK(iso, rate_date)
market.cache_entry     key, value jsonb, fetched_at, expires_at
market.universe        symbol, cik, name, sector, industry, in_index bool, updated_at
market.fundamentals    symbol, fiscal_year, revenue, net_income, eps_diluted, gross_profit, operating_income,
                       equity, assets, op_cash_flow, capex, dividends_per_share, shares_out, source_period_end
market.price_daily     symbol, date, close, adj_close, volume                      PK(symbol, date)
market.snapshot        as_of date, payload jsonb (factor inputs & scores per symbol), methodology_version
```
`pf` has **no foreign keys** to `market`; `invest` has **no tables** (stateless by decision #8).

**Seed categories per new user:** Income — Salary, Freelance, Other income. Expense — Utilities, Mortgage, Internet, Food, Transport, Health, Other expenses. Users may add custom categories (unique per user+kind).

### 2.7 Prototype vs production summary (auth/DB)
- **Prototype:** Better Auth + Neon free + Resend free + reference-style password rules, generic errors, rate limiting, per-user authorization in code.
- **Production:** NIST-aligned passwords + breach check + MFA option, email verification, paid Neon with PITR backups, DB roles per module, audit log, legal review of consent/data residency, Vercel Pro.

---

## 3. Research: Personal Finance Dashboard (independent module)

**Purpose:** record income and expenses; compute **Total Balance = Total Income − Total Expenses** over a chosen date range (default: current calendar month, `Asia/Yerevan`); supply data for charts.

**Rules**
- Currency: **AMD only** in v1; amounts `numeric(14,2)` server-side, decimal strings in API; sums computed in the database or with a decimal library (never JS floats).
- Range is inclusive of both dates; `from ≤ to`; max span 5 years; default `from = first day of current month`, `to = last day of current month` (so future-dated entries this month count).
- Utilities, Mortgage, Internet, etc. are **expense categories**, not separate entities.
- Empty range ⇒ zeros and `isEmpty: true` (Frontend shows empty/skeleton state).
- Negative balance is valid.
- **Nothing here is exposed to Investment** (§1.1).

**Chart data the API must provide (visual design comes later)**
1. Expenses by category (total, share %).
2. Income vs expenses per month within the range.
3. Balance over time (cumulative, per day or per week depending on range).
4. KPI tiles: total income, total expenses, balance, savings rate (`balance / income`, null when income = 0).

**Prototype vs production:** prototype — single-user CRUD with pagination; production — recurring entries, CSV import/export, backup/export, per-user data-deletion workflow, audit trail.

---

## 4. Research: Exchange rates (Market Information)

### 4.1 Requirement
USD/AMD, EUR/AMD, GBP/AMD, RUB/AMD · current rate · ~1 month history · Sat/Sun and public holidays use the latest working-day rate.

### 4.2 Candidate comparison

| Criterion | **CBA `api.cba.am`** ★ | **Frankfurter v2** | **fawazahmed0 currency-api** | **open.er-api.com** |
|---|---|---|---|---|
| Protocol / format | **SOAP/XML** (ASMX); range returns ADO.NET DiffGram **[V]** | REST JSON **[V]** | static JSON on jsDelivr CDN **[V]** | REST JSON **[V]** |
| Auth | none **[V]** | none **[D]** | none **[D]** | none **[D]** |
| AMD / RUB / EUR / GBP | yes, 30 currencies **[V]** | yes (166 ccy; also a `CBA` provider, 31 ccy from 2000) **[V]** | yes **[V]** | yes **[V]** |
| Current | `ExchangeRatesLatest` **[V]** | yes **[V]** | `@latest` **[V]** | yes **[V]** |
| History | by date **and date-range for ISO list** **[V]** | by date/range, `providers=CBA` **[V]** | per date `@YYYY-MM-DD` **[V]** (30 calls for 30 days) | **not on free endpoint** **[D]** |
| 1-month history in one call | **yes** (22 rows × 4 ccy) **[V]** | **yes** **[V]** | no | no |
| Weekend/holiday | by-date returns previous working day **[V]**; range omits non-working days **[V]** | CBA provider: working days only **[V]** (default *blended* endpoint returns weekend dates but is **not** CBA data) | calendar-daily, market-derived | calendar-daily |
| Rate limits | none published **[U]** | "no quotas", abuse limit **[D]** | "no rate limits" **[D]** | 429 + 20 min cooldown **[D]** |
| Licence | official public data; **terms not located [U]** | open source **[D]** | CC0 **[D]** | attribution required **[D]** |
| Reliability | government service, legacy ASMX **[U]** | community-run **[D]** | CDN; docs advise fallback host **[D]** | commercial free tier |
| Integration effort | medium (SOAP + DiffGram) | **easy** | easy but N calls | easy (current only) |
| Authority for an Armenian user | **official CBA reference rate** | CBA data re-served | market aggregate | market aggregate |

*Considered, not tested* (Open Exchange Rates, Twelve Data forex, Alpha Vantage FX, exchangerate.host): key-based, quota-limited; none beats an official source that already meets every requirement.

### 4.3 Live findings **[V]** (2026-09-21)
- Operations: `ExchangeRatesLatest` (documented as "recommended for website integration"), `…LatestByISO`, `…ByDate`, `…ByDateByISO`, **`…ByDateRangeByISO`**, `ISOCodes`, `ISOCodesDetailed`.
- Latest (dated **2026-09-18**): **USD 363.44 · EUR 417.05 · GBP 485.52 · RUB 4.3123** AMD per `Amount=1`, each with `Difference` vs the previous day.
- **Saturday 09-12 and Sunday 09-13** by-date queries → `CurrentDate = 2026-09-11` (Fri), `NextAvailableDate = 2026-09-14`.
- **Holiday Mon 09-21** (Independence Day) → `CurrentDate = 2026-09-18`. "Latest available" ≠ "calendar today".
- **Range 2026-08-20 → 09-20:** 22 rows per currency, working days only.
- Cross-check same day: fawazahmed0 363.44, Frankfurter blended 363.29, open.er-api 364.47 → all within ~0.3 % of CBA.
- Publication time of the daily rate could not be determined **[U]**.

### 4.4 Recommendation & algorithm

**Primary:** CBA. **Fallback chain:** Frankfurter (`providers=CBA`) → fawazahmed0 → last stored value (`stale:true`). Every value carries `source` and `sourceDate`.

**Forward-fill algorithm (holiday-proof because it is data-driven, not a holiday calendar)**
1. Call `ExchangeRatesByDateRangeByISO(from = today−35d, to = today, "USD,EUR,GBP,RUB")`.
2. `ratePerUnit = rate / amount` (always divide by `Amount`).
3. For each of the last 30 calendar days `d` and each currency: `value(d)` = row with greatest `date ≤ d`; store `isCarriedForward = (row.date ≠ d)` and `sourceDate = row.date`. The 35-day pad guarantees a value for a leading non-working day.
4. "Current" = `ExchangeRatesLatest`; its `CurrentDate` is the source date.
5. Persist each working-day row into `market.fx_rate` (upsert) so history survives provider outages and grows over time.

**AMD → USD conversion (Investment page):** `usd = amountAmd / usdAmdRate`. Example: 500,000 / 363.44 = **1,375.74 → "$1,376"** (the brief's "$1,300" is an illustration). Label *"≈ at CBA official rate, 18 Sep 2026"*; bank counters use buy/sell spreads and differ.

### 4.5 Prototype vs production
- **Prototype:** on-demand refresh + daily cron insert into `market.fx_rate`; free fallbacks.
- **Production:** keep CBA as the reference rate (free, official); add an SLA-backed secondary vendor **[U]**; monitor freshness (alert if `sourceDate` older than 4 days); confirm CBA terms of use.

---

## 5. Research: Stock market data (Market Information display + Investment universe)

### 5.1 Two distinct data problems

| Problem | Volume | Freshness | Pattern |
|---|---|---|---|
| **A. Display** the 5 companies (NVDA, AAPL, GOOGL, MSFT, AMZN) | 5 symbols | near-real-time price | on demand, cached |
| **B. Recommendation universe** (S&P 500, fundamentals + ≥3 y prices) | ~500 symbols | daily | **nightly batch → snapshot** |

### 5.2 Provider comparison

| Provider | Free tier | Price/quote | Historical | Fundamentals | Terms / production | Verdict |
|---|---|---|---|---|---|---|
| **Finnhub** | **60 calls/min**, key **[D]** | US quote (real-time claimed) **[D]** | `/stock/candle` — reports conflict on whether free **[U]** | `/stock/metric?metric=all` (P/E, EPS, beta, 52w, margins, growth) **[D]**; "Financials as reported" not free **[D]** | free = **personal, non-commercial** **[D]** | **A: primary** (verify candle gate) |
| **Twelve Data** | **8/min, 800/day** **[V pricing page]** | quote **[D]** | `time_series` daily **[D]** | pricing page lists fundamentals on Basic, support docs gate some on Grow/Pro **[U — conflicting]** | commercial use needs paid **[U]** | **A: history; B: prices** (~500 credits/day) |
| **Alpha Vantage** | **25 requests/day** **[V]** | yes | yes | yes | premium from $49.99/mo **[V]** | ❌ too small |
| **Financial Modeling Prep** | 250 calls/day, 500 MB/30 d, 5 y EOD, 5 quarters **[D]** | EOD | yes | ratios/metrics **[D]** | pricing page blocked (403) **[U]** | secondary |
| **Polygon.io → Massive** | 5 calls/min, EOD/15-min delayed, 2 y **[D]** | delayed | yes | reference data **[U]** | dev sandbox **[D]** | B: `grouped daily` = whole market per call **[U]** |
| **Tiingo** | 50 req/h, 1,000/day **[D]** | EOD | yes | limited/add-on **[D]** | — | secondary |
| **SEC EDGAR** | free, no key, descriptive `User-Agent` **[V]**; ~10 req/s fair use **[D]** | ❌ | ❌ | ✅ see §5.4 | US gov public data | **B: fundamentals ★** |
| **Yahoo (unofficial)** | keyless `v8/chart`: NVDA 1 mo = 21 pts, SPY/VOO/IVV/^GSPC 1 y = 251 pts **with adjusted close and dividends** **[V]**; `quoteSummary` → 401 (needs crumb) **[V]** | ~delayed **[U]** | ✅ | ❌ | **ToS §2.4 forbids automated access & substitute services** **[V]** | **prototype-only fallback** |
| **Stooq CSV** | serves a JS bot-check **[V]** | — | — | — | — | ❌ |
| IEX Cloud | reported shut down Aug 2024 **[U]** | — | — | — | — | ❌ |

### 5.3 Display card (5 companies) — data fields
`symbol, name, price, previousClose, change, changePct, currency, marketCap, peTtm, epsTtm, dividendYield, dividendPerShare, revenueTtm, netIncomeTtm, profitMargin, revenueGrowthYoy, beta, high52w, low52w, history1m[{date, close}], asOf, source, isDelayed`.
**Prototype:** Finnhub (quote, profile, metrics) + Twelve Data (1-month closes); Yahoo chart fallback labelled. **Production:** licensed real-time or delayed feed; exchange redistribution terms apply regardless of vendor marketing → always label "delayed/indicative" unless licensed real-time.

### 5.4 Practical S&P 500 universe & fundamentals (verified)

**Constituents:** `github.com/datasets/s-and-p-500-companies` `constituents.csv` — **503 rows, 496 with CIK**, columns `Symbol, Security, GICS Sector, GICS Sub-Industry, Headquarters, Date added, CIK, Founded`; repo updated 2026-09-21 **[V]**. No licence file declared **[V]**; data derive from a public list **[U]** → *prototype OK; production must license index membership (S&P Dow Jones Indices / a data vendor) or use an ETF-holdings file under its terms* **[U]**.

**Fundamentals via SEC XBRL "frames"** (`data.sec.gov/api/xbrl/frames/{taxonomy}/{concept}/{unit}/{period}.json` returns one value per company in one call): each call 0.3–0.9 MB, <1 s **[V]**.

| Concept (period) | S&P 500 CIKs covered (of 496) |
|---|---:|
| Revenue: `Revenues` ∪ `RevenueFromContractWithCustomerExcludingAssessedTax` (CY2025) | **460** (Revenues alone 231; contract-revenue alone 305) |
| `NetIncomeLoss` | 460 |
| `EarningsPerShareDiluted` | 473 |
| `OperatingIncomeLoss` | 376 |
| `GrossProfit` | **184** |
| `StockholdersEquity` (CY2025Q4I) | 467 |
| `Assets` (CY2025Q4I) | 495 |
| `NetCashProvidedByUsedInOperatingActivities` | 480 |
| `CommonStockDividendsPerShareDeclared` | 278 |
| Shares: `dei:EntityCommonStockSharesOutstanding` (CY2026Q2I: 4,413 companies; e.g. NVDA absent because its period differs) / fallback `WeightedAverageNumberOfDilutedSharesOutstanding` (CY2025) | partial → **fallback chain required** |

**Consequences (design constraints)**
1. **Concept fallback chains are mandatory** (e.g. Apple reports contract revenue, not `Revenues`). Maintain a config map `metric → [concept1, concept2, …]`.
2. **Gross Profit cannot be a core input** (37 % coverage) → use operating margin / net margin / FCF margin as primary profitability inputs; gross profitability optional.
3. **Financials (banks/insurers) and Real Estate** use different tags → for those sectors skip revenue-based metrics and use ROE, net margin, P/B (price/equity) and dividend yield; require data-completeness ≥ 80 % *within the metrics applicable to the sector*.
4. Frames use calendar-aligned periods (fiscal years ending in other months are matched by nearest calendar year) **[D]** → store `source_period_end` per value and show it.
5. Dividend coverage is low via `…DeclaredPerShare`; add fallback `CommonStockDividendsPerShareCashPaid` **[U]** and price-history dividend events (Yahoo/Twelve Data) as cross-check.
6. **Fundamentals basis in v1 = latest fiscal year (annual)**; TTM/quarterly refinement is a production enhancement (needs 10-Q period arithmetic).
7. Refresh cadence: weekly (or after earnings season); the whole refresh is ~12–15 frame calls → feasible even in one serverless run **[V sizes]**.

**Price history for the universe:** need ≥ 3 y of daily adjusted closes for ~500 symbols + benchmark (~390k rows).
| Route | Prototype? | Notes |
|---|---|---|
| Twelve Data `time_series` (batch, 1 credit/symbol) | ✅ | ~500 credits/day; 8/min ⇒ ~63 min → run in **GitHub Actions**; initial backfill once, then `outputsize=5` incremental **[D]** |
| Polygon `grouped daily` | maybe | 1 call = all US tickers for one date; 5/min ⇒ backfill 3 y ≈ 750 calls ≈ 2.5 h once **[U]** |
| Yahoo `v8/chart` | fallback | unofficial, ToS-restricted **[V]** |
**Production:** paid licensed EOD feed.

### 5.5 Prototype vs production (stocks)
- **Prototype:** free keys, nightly batch, labelled delayed data, Yahoo fallback.
- **Production:** licensed market/fundamentals data (real-time display needs exchange agreements), licensed index constituents, monitoring of data completeness, vendor SLA. All free tiers here are personal/non-commercial.

---

## 6. Research: Financial news (global + Armenia)

### 6.1 Requirement
~6 items, **2–3 Armenia-specific allowed**, others global markets; reliable, current, refreshable; attribution; licensing-aware.

### 6.2 Global sources **[V live 2026-09-21]**

| Source | Access | Live | Terms picture | Use |
|---|---|---|---|---|
| Yahoo Finance | RSS | 47 items, fresh | §2.15 permits displaying feed content **unmodified with attribution + link, no ads**; §2.4 forbids automated collection/competing services **[V]** → ambiguous | ✅ prototype; ask permission for production |
| CNBC Finance / Top News | RSS | 30 + 30 | terms page blocked (403) **[U]** | ✅ prototype |
| Bloomberg Markets | RSS | 20 | terms not checked **[U]** | ✅ headline+link only |
| Financial Times | RSS | 11 | paywalled; terms unchecked **[U]** | optional |
| Guardian Business | RSS / Open Platform (free dev key) | 40 | non-commercial free key; commercial needs licence; attribution **[D]** | ✅ |
| BBC Business | RSS | 54 | typically personal/non-commercial **[U]** | ✅ prototype |
| NYT Business | RSS | 49 | typically personal/non-commercial **[U]** | ✅ prototype |
| WSJ / MarketWatch | RSS | live (marketpulse stale since Jul 2025) | **no commercial use; no display in another app/site without licence** **[D]** | ❌ |
| Reuters | — | legacy RSS unreachable **[V]**; no free official API | paid licensing only **[D]** | ❌ |
| Finnhub general news / Marketaux | REST + key | — | free = non-commercial; Marketaux ~100 req/day, 3 articles/request **[D]** | ➕ supplement |
| NewsAPI.org | REST | — | Developer plan dev-only, 24 h delay; paid from $449/mo **[D]** | ❌ |

### 6.3 Armenia-specific sources **[V live 2026-09-21]**

| Source | Access | Finding | Use |
|---|---|---|---|
| **Armenpress (EN)** | `armenpress.am/en/rss/articles` RSS | 50 items, timestamps to the hour; each has a **`category`** (in latest 50: Politics 16, **Economy 8**, Culture 4, …). Economy items include e.g. daily *Oil / Precious metals / US stocks / European stocks* bulletins | ✅ **primary Armenia source**, filter `category = Economy` (+ keyword-boost) |
| **News.am (ENG)** | `news.am/eng/rss/` RSS | 100 items, fresh, **no categories**, mixed general/world news | ✅ keyword-filtered (dram, CBA, bank, GDP, inflation, budget, tax, export, investment, IT sector, gold, mining, fuel prices …) |
| **Google News RSS** (query "Armenia economy OR dram OR Central Bank of Armenia") | RSS aggregator | 100 items, multiple outlets (Caspian Post, JAMnews, IndexBox, …) with source names; links go via Google | ➕ supplement/fallback; terms for reuse **[U]** |
| ARKA (business-focused agency) | RSS | **HTTP 403 to scripts** **[V]** | ❌ unless permission/feed key obtained |
| PanArmenian | RSS | 10 items, mostly politics | ✗ low finance value |
| Armenian Weekly | RSS | diaspora/culture | ✗ |
| Hetq (EN) | RSS | 50 items, investigative | ✗ (not finance) |
| Azatutyun | RSS | feed is **Armenian-language** | ✗ (English-only v1) |
| Mediamax EN | RSS | 0 items | ✗ |
| GDELT DOC API | REST | **1 request per 5 s**; only 1 article for query `sourcecountry:AM` last 3 days **[V]** | ✗ too sparse/limited |

Volume is small: expect roughly **1–4 genuinely finance-relevant Armenian items per 72 h** → the Armenia quota must be a **soft target**.

### 6.4 What may be displayed
**Title + source name + published time + link (new tab, `rel="noopener noreferrer"`) + region tag (Armenia/Global).** No article body storage or rendering; no AI-rewritten headlines; no hotlinked images; no ads adjacent to Yahoo items. Feed `description` only if shown unmodified — default: omit.

### 6.5 Article selection algorithm (deterministic; produces exactly 6)

**Pools:** `global` (Yahoo, CNBC, Bloomberg, Guardian, BBC, NYT [+FT optional]) and `armenia` (Armenpress Economy, News.am filtered, Google-News query).

1. **Ingest & normalise** → `{id, title, source, url(canonical, no utm_*), publishedAt, region, category?}`.
2. **Filter:** age ≤ **48 h** (global) / ≤ **72 h** (Armenia); drop opinion/lifestyle/sponsored/sports/culture by category & URL patterns; drop empty titles.
3. **Dedupe:** canonical URL equal, or normalised-title token Jaccard ≥ 0.6 (or SimHash ≤ 3) → cluster; keep the highest-trust source; cluster size feeds significance.
4. **Score (0–1):** `0.35·recency + 0.30·relevance + 0.20·significance + 0.15·sourceTrust`
   - `recency = exp(−ageHours/12)` (half-life ≈ 8 h; for Armenia pool use /24)
   - `relevance` = weighted keyword/entity match — global: central banks & rates, inflation, GDP/jobs, earnings, oil/gold/commodities, currencies (USD/EUR/GBP/RUB/AMD), the 5 tracked companies, AI/semiconductors, indices; Armenia: dram, CBA, banks, budget/tax, GDP, inflation, exports, IT sector, mining, energy prices
   - `significance` = multi-source coverage (capped) + high-impact terms
   - `sourceTrust` = fixed table (Bloomberg/FT/Guardian/BBC 1.0, CNBC/NYT 0.9, Armenpress 0.8, Yahoo 0.8, News.am 0.7, Google-News items 0.6)
5. **Quota selection:** target **Armenia = 2**, allow **3** only if the 3rd scores ≥ 0.5; require Armenia items to have `relevance ≥ 0.3`. If fewer than 2 qualify, fill with global (never fabricate/relax below 0.3).
6. **Diversity constraints (greedy, highest score first):** ≤ 2 items per topic bucket (Macro/central banks · Equities/earnings · Currencies/commodities · Tech/AI · Armenia economy · Global other) and ≤ 2 per source; if <6 remain, relax bucket cap, then source cap, then window (72 h global).
7. **Order:** by `publishedAt` desc (or score — UI decision).
8. **Failure handling:** skip a timing-out feed; if all fail serve last good six with `stale:true`; log per-item score components for reproducibility.
9. **Refresh:** cache TTL 15 min; manual *Refresh* returns fresh cache (triggers a lock-guarded upstream refresh only if older than 5 min); throttle 1 per 30 s per user.

### 6.6 Prototype vs production (news)
- **Prototype:** RSS aggregation as above, legal risk accepted for personal use, headline+link only.
- **Production:** replace with a licensed news API/agreements (e.g. paid Finnhub/Marketaux tier or publisher licences; approach Armenpress/ARKA/News.am for syndication) and keep the same `NewsProvider` interface; legal review of each publisher's terms.

---

## 7. Research: Investment recommendation methodology (deterministic, no ML)

> **Scope:** transparent scoring. **No ML/prediction models. No trade execution, no broker integration.** Output is informational.

### 7.1 Inputs & output contract
**Inputs (only these):** `amountAmd`, `risk ∈ {low, medium, high}`, `horizon ∈ {short, medium, long}` (short < 2 y, medium 2–5 y, long > 5 y), `mode ∈ {single, portfolio}` (+ `notNeededForEmergencies: true` — required checkbox, see §7.9).
**Data used:** market data (FX, prices), company fundamentals (SEC), universe snapshot — nothing from Personal Finance.
**Guards:** `amountAmd` integer 1,000 – 1,000,000,000; must afford ≥ 1 share of ≥ 1 eligible stock; < ≈ $300 shows a "too small to diversify" note.

### 7.2 Universe & eligibility
- **Universe:** S&P 500 constituents (§5.4). The five display companies get **no special treatment**.
- **Hard eligibility (all risk levels):** common stock; ≥ 3 y price history; latest-year revenue > 0 (financials: net income); data-completeness ≥ 80 % of applicable metrics — **else excluded, never silently imputed**.
- **Per-risk caps (illustrative starting values; require backtest/calibration [R])**

| | Low | Medium | High |
|---|---|---|---|
| Market cap | ≥ $50 B | ≥ $10 B | ≥ $2 B |
| 1-y annualised volatility | ≤ 28 % | ≤ 45 % | ≤ 75 % |
| Beta (3 y vs benchmark) | ≤ 1.0 | ≤ 1.4 | — |
| Profitability | net income > 0 last FY | net income > 0 last FY | revenue growth YoY > 0 |
| Max drawdown (1 y) | ≥ −25 % | ≥ −40 % | — |
| Short-horizon modifier | vol cap ×0.8 | ×0.8 | ×0.8 |

*(All S&P 500 members exceed ≈ $8 B market cap, so the High-risk $2 B floor only matters if the universe is extended.)*

### 7.3 Metric definitions
- `vol1y` = stdev(daily simple returns, last 252 trading days) × √252 · `maxDD1y` from adjusted close · `beta3y` = cov(r, r_bench)/var(r_bench), daily, 3 y.
- `mom12_1` = P(t−21d)/P(t−252d) − 1 · `mom6` = P(t)/P(t−126d) − 1 · `above200dma` = P(t) / SMA200 − 1.
- `ROE` = net income / ending equity · `opMargin` = operating income / revenue · `netMargin` · `fcfMargin` = (operating cash flow − capex) / revenue · `debtToEquity` from Liabilities/Equity (proxy) · earnings stability = share of last 3 years with positive net income (v1).
- `PE` = price / diluted EPS (annual; ≤ 0 ⇒ not meaningful) · `PS` = market cap / revenue · `PB` = market cap / equity · `fcfYield` = FCF / market cap · `divYield` = dividends per share / price · payout = DPS / EPS.
- `revGrowth` = Rev(FY)/Rev(FY−1) − 1 · `rev3yCAGR` from CY2022 frame · `epsGrowth` similarly.
- Market cap = latest price × shares outstanding (fallback chain, §5.4).

### 7.4 Factor scores & composite
Each factor = average of the **percentile ranks (0–100)** of its inputs within the *eligible set*; Value is ranked **within sector**; inputs winsorised at 1st/99th percentile; a factor with no valid input is dropped and weights renormalised (stock flagged).

| Factor | Inputs |
|---|---|
| Quality | ROE, opMargin, fcfMargin, low debt/equity, earnings stability |
| Value | low PE, low PS, fcfYield (financials: low PB) |
| Growth | revGrowth, rev3yCAGR, epsGrowth |
| Momentum | mom12_1, mom6, above200dma |
| Low-Risk | low vol1y, low beta3y, small |maxDD1y| |
| Income | divYield, payout ≤ 70 %, dividend paid |

**Weights (risk × horizon), config-driven starting values [R]**

| Factor | Low | Medium | High |
|---|---:|---:|---:|
| Quality | 30 | 25 | 20 |
| Low-Risk | 25 | 15 | 5 |
| Income | 15 | 10 | 0 |
| Value | 20 | 15 | 10 |
| Growth | 5 | 20 | 30 |
| Momentum | 5 | 15 | 35 |

Horizon adjustment (points, then clamp ≥ 0 and renormalise to 100): **Short:** Low-Risk +10, Momentum +5, Growth −10, Value −5 · **Medium:** none · **Long:** Quality +5, Growth +5, Low-Risk −5, Momentum −5.
`composite = Σ weight_f × factorScore_f` (0–100).

**Conflicts:** *Low risk + Short horizon* → still output but show a suitability note (equities may be unsuitable under 2 years; deposits/bonds exist). *High risk + Short* → allowed with a volatility warning.

### 7.5 Option 1 — Single stock
1. Eligibility → **affordability filter** (`price ≤ budgetUSD`, whole shares) → highest composite.
2. **Stability rule:** if the previous day's pick is still eligible and within 2 points of today's leader, keep it (avoid flip-flopping) — requires storing yesterday's *snapshot pick* (in `market.snapshot`, not per user).
3. Return pick + **2 runner-ups** + factor breakdown + shares = `floor(budgetUSD / price)` + leftover cash.
4. **Mandatory concentration disclosure**: single stock = undiversified; show the stock's 1-y max drawdown and volatility.
5. **Explanation (deterministic template, real numbers)**: top 3–5 contributing inputs with value and percentile, e.g. *"Operating margin 32 % (top 8 % of eligible stocks) · 1-y volatility 24 % (within the Low-risk cap of 28 %) · dividend yield 1.4 %, payout 22 %"*, plus the inputs that set the weights. Any optional text polish must not alter numbers.

### 7.6 Option 2 — Portfolio
**Holdings count `N` by budget (USD equivalent):** < $300 → 1–3 · $300–$1,000 → 3 · $1,000–$3,000 → 5 · $3,000–$10,000 → 8 · > $10,000 → 10–12 (cap 15); minimum ≈ $100 per position (`N ≤ floor(B/100)`). Literature suggests ~20–30 stocks capture most diversification **[D]**; small budgets force a smaller, **explicitly disclosed** compromise.

**Construction**
1. Rank eligible stocks by composite.
2. Greedy selection with constraints: **≤ 2 holdings per GICS sector** (or ≤ 35 % weight), **correlation filter** (skip a candidate whose average 1-y daily-return correlation with already-selected holdings > 0.75), price feasibility (a candidate whose single share exceeds its target allocation is skipped).
3. **Weights:** `raw_i = composite_i / vol1y_i` → normalise; iteratively cap position weight (**Low 20 % · Medium 25 % · High 30 %**) with minimum 8 %, redistributing excess. *Rationale:* score-tilted inverse volatility is robust; mean-variance optimisation is fragile with noisy estimates and tiny budgets **[D]**.
4. **Portfolio risk check:** estimated volatility `√(wᵀΣw)` (1-y covariance) must be ≤ band cap (Low 18 % · Medium 25 % · High 40 %; illustrative). If exceeded, replace the highest-volatility holding with the next candidate and repeat (max 5 iterations).
5. **Whole-share allocation** (decided):
```
B = budgetUSD;  target_i = w_i · B;  shares_i = floor(target_i / price_i)
cash = B − Σ shares_i·price_i
while exists i with price_i ≤ cash:      # spend leftover
    choose i with largest (w_i − actualWeight_i);  shares_i += 1;  cash −= price_i
actualWeight_i = shares_i·price_i / (B − cash)
require shares_i ≥ 1 for all i, else drop i, recompute (or take next-ranked feasible stock)
```
Report **target %** and **actual %** side by side, plus unallocated cash (< price of cheapest holding).
6. **Portfolio metrics:** weighted beta, estimated volatility, sector split, weighted dividend yield, effective number of holdings `1/Σw²`, top-holding weight.
7. **Explain each holding** (top factors) and the portfolio (why N, why caps).
8. Benchmark comparison: §8.

**Known limitation:** the whole-share constraint favours lower-priced shares on small budgets (e.g. at ≈ $1,300 with N=5, stocks priced above ≈ $260 are infeasible). Disclose it; the ranking is applied among affordable candidates.

### 7.7 Output fields
Single: `pick{symbol,name,sector,price,shares,cost,leftoverCash,composite,factorScores,drivers[{label,value,percentile}]}, runnersUp[2], warnings[], methodologyVersion, dataAsOf`.
Portfolio: `holdings[{symbol,name,sector,price,shares,cost,targetWeight,actualWeight,composite,drivers[]}], cash, metrics{...}, warnings[], methodologyVersion, dataAsOf, benchmark{...}`.

### 7.8 Prototype vs production
- **Prototype:** starting weights/caps as above, universe S&P 500, annual fundamentals, config file `methodology.v1.json`.
- **Production:** backtested & calibrated parameters (walk-forward, transaction-cost aware), TTM fundamentals, licensed data, sector-relative Quality, independent model validation, change log per methodology version, compliance sign-off (§9).

### 7.9 Emergency-money checkbox (DECIDED — kept)
A **required checkbox** with the exact label **"This money isn't needed for emergencies."** is an additional input alongside amount, risk and horizon (proxy for loss capacity under suitability practice **[D]**). API: `notNeededForEmergencies` must be boolean `true`, otherwise `400 VALIDATION_ERROR` with `fields.notNeededForEmergencies`. It is **not** used in scoring and is not stored.

---

## 8. Research: Portfolio benchmark comparison

### 8.1 Benchmark choice
**Primary: VOO** (Vanguard S&P 500 ETF): expense ratio 0.03 %, inception 2010-09-07 **[D]** → ≥ 15 y of history, tracks the S&P 500. Alternates: **IVV** (0.03 %, 2000), **SPY** (0.0945 %, 1993, highest liquidity) **[D]**. `^GSPC` (price index, no dividends) only as a sanity check. Benchmark symbol is config (`benchmark.symbol`). It is a **reference, not a recommendation or prediction** (label so).
*Why ETF adjusted close:* it embeds dividends (total-return proxy) so the comparison with dividend-paying holdings is like-for-like; minus a 0.03 % fee.

### 8.2 Data source
Adjusted daily closes for VOO/SPY/IVV/^GSPC are available keylessly from Yahoo `v8/chart` with `includeAdjustedClose` and dividend events — **1 y = 251 points each [V]** (prototype only, ToS). Legit alternatives: Twelve Data / Polygon EOD **[D]**. **Risk-free rate:** 13-week T-bill yield `^IRX` = 3.982 % on 2026-09-21 **[V via Yahoo]**; official US Treasury daily-yield XML responded HTTP 200 without a key **[V]** (parse spike needed); FRED requires a key **[D]**. Store benchmark and `^IRX` in `market.price_daily` with the universe.

### 8.3 Methodology
**Portfolio series (USD):** window start `T0`; `V_t = Σ shares_i · adjClose_i,t + cash` (buy-and-hold with the *actual* whole-share allocation; cash constant). **Benchmark series:** same initial capital `V_0` invested in VOO (fractional units allowed — it is a reference). Both **rebased to 100** (or shown in USD). Windows: **1M, 3M, 6M, 1Y (default), 3Y, 5Y** — limited by the youngest holding; the universe rule (≥ 3 y history) guarantees 1M–3Y; shorter-than-requested windows are disclosed.
Currency: USD (native). AMD-denominated view (apply CBA history) is optional phase 2; USD/AMD moved less than 1 % across the sampled month (365.26 on 08-20 → 363.44 on 09-18), so the effect is small over short windows **[V, from FX data]**.

**Metrics (all computed on daily simple returns over the chosen window)**

| Group | Metric | Formula |
|---|---|---|
| Return | Total return | `V_T/V_0 − 1` |
| | Annualised return (CAGR) | `(V_T/V_0)^(252/n) − 1` |
| Volatility | Annualised volatility | `stdev(r)·√252` |
| Risk | Max drawdown (+ peak/trough dates) | `min(V_t / max_{s≤t} V_s − 1)` |
| | Worst day / worst month | min of daily / monthly returns |
| Risk-adjusted | Sharpe | `(annReturn − rf) / annVol`, `rf` = mean `^IRX`/100 in window |
| | Sortino | downside deviation (target = rf) |
| Relative | Beta vs benchmark | `cov(r_p, r_b)/var(r_b)` |
| | Correlation | Pearson |
| | Tracking error | `stdev(r_p − r_b)·√252` |
| | Up/down capture | mean(r_p on b>0)/mean(r_b on b>0), likewise for b<0 |
| Diversification | Holdings count | N vs 500 |
| | Effective N | `1/Σw²` |
| | Top-1 / top-3 weight | — |
| | Sector count & max sector weight vs **benchmark sector weights** | portfolio sector `Σw` vs S&P 500 sector weights |
| | Average pairwise correlation | over holdings |
| | Diversification ratio | `Σ w_iσ_i / σ_p` |

Benchmark sector weights: **prototype** = computed from the universe (price × shares, cap-weighted; approximates float-adjusted index weights); **production** = official index/ETF holdings weights **[U]**.
Single-stock mode: benchmark comparison optional (same engine, N = 1); required for portfolio mode.

### 8.4 Honesty rules (must be shown with the chart) **[R]**
1. **Hindsight/selection bias:** today's holdings were selected with today's data (e.g. momentum, quality); back-testing them yields flattering history *by construction*. Label: *"Hypothetical back-test of today's selection using historical prices. Not a forecast; past performance does not guarantee future results."*
2. **Survivorship bias:** universe = *current* S&P 500 members only.
3. Costs, taxes, FX spreads and dividends withholding are **not** modelled.
4. Lead with **risk metrics** (volatility, drawdown) as much as return.
5. The benchmark is context, **not** an additional recommendation.

### 8.5 Prototype vs production
- **Prototype:** compute on request from `market.price_daily`; VOO via Yahoo/Twelve Data.
- **Production:** licensed total-return index series, official sector weights, cached comparison results per snapshot, walk-forward (out-of-sample) evaluation to complement the in-sample chart.

---

## 9. Compliance & legal (needs a human lawyer)

- **Investment advice:** the CBA regulates the securities market; investment services are licensed activities under the Law "On Securities Market"; banks and licensed investment firms may provide them **[D]**. A tool that outputs *specific stocks for specific user inputs* may be treated as **personalised investment advice** in many jurisdictions (ESMA treats personal recommendations as advice) **[D]**. → Legal opinion before any public/commercial launch; until then position as an educational/informational prototype.
- **Always show:** informational-only disclaimer, data timestamp + sources, methodology version, "no trades are executed by this app".
- **Suitability standards** (ESMA MiFID II: knowledge & experience, financial situation incl. loss tolerance, objectives) **[D]** — v1 covers objectives/horizon/risk only; the emergency-money checkbox (§7.9) partially proxies loss capacity.
- **Personal data (production item — deferred by owner for the educational prototype):** Armenian Law on Protection of Personal Data (§2.4); financial data is sensitive in practice; consent notice; export/delete; region decision for the DB.
- **Data licences:** free-tier terms (Finnhub, RSS publishers, Guardian, Vercel Hobby) are personal/non-commercial → any commercialisation triggers licence work (§5, §6).
- **Kill switch:** ability to disable the Investment module by config.

---

## 10. HANDOVER — BACKEND

### 10.1 Mission
Build the API, data ingestion, caching, auth/persistence and the deterministic recommendation + benchmark engine. **You may not** start until the product owner approves this document. Run the spike (§13) first.

### 10.2 Required inputs (before you start)
- This document; owner-created free accounts/keys (user action): Finnhub, Twelve Data, Resend (+ sending domain), Neon (via Vercel Marketplace), GitHub repo for Actions.
- Confirmed stack (§1.2). Universe CSV and concept-fallback map (§5.4).

### 10.3 Deliverables (outputs)
1. Auth module with sign-up/login/logout/forgot-password/reset, session guard.
2. `pf` module: categories & transactions CRUD + summary.
3. `market` module: FX service, stock display service, news service, nightly universe/price batch.
4. `invest` module: convert, recommendation (single/portfolio), comparison.
5. DB migrations for the schemas in §2.6; seed script for default categories (run on sign-up).
6. Methodology config `methodology.v1.json` (weights, caps, thresholds, source-trust table, keyword lists).
7. Recorded provider fixtures for QA; OpenAPI (or Zod-derived) contract.
8. `README-backend` with env vars, jobs, runbook, known limitations.

### 10.4 API contracts

**Auth** (library-provided endpoints, mapped):
| Route | Body | Success | Errors |
|---|---|---|---|
| `POST /api/auth/sign-up` | `{firstName, lastName, email, password}` | 201 + session cookie, user `{id, firstName, lastName, email}` | `VALIDATION_ERROR` (fields), `EMAIL_TAKEN` (generic wording — see below) |
| `POST /api/auth/sign-in` | `{email, password}` | 200 + cookie | `INVALID_CREDENTIALS` (generic), `RATE_LIMITED` |
| `POST /api/auth/sign-out` | — | 204 | — |
| `POST /api/auth/forgot-password` | `{email}` | **always** 202 (no enumeration) | `RATE_LIMITED` |
| `POST /api/auth/reset-password` | `{token, newPassword}` | 200 | `TOKEN_INVALID_OR_EXPIRED`, `VALIDATION_ERROR` |
| `GET /api/auth/session` | — | `{user}` or 401 | — |
Validation: names 1–60 chars trimmed; email RFC-valid, lower-cased, ≤ 254; password ≥ 8 with upper, lower, number, symbol (prototype) — rules table in one shared module so Frontend can mirror it. Sign-up with an existing email: return the same generic error class the library recommends; prefer a neutral message to limit enumeration **[R]**.

**Personal Finance** (all require session; all filter by `userId`)
| Route | Request | Response |
|---|---|---|
| `GET /api/pf/categories` | — | `[{id,name,kind,isDefault}]` |
| `POST /api/pf/categories` | `{name,kind}` | 201 category; 409 duplicate |
| `GET /api/pf/transactions` | `from,to,kind?,categoryId?,page=1,pageSize=50(max 200)` | `{items:[{id,kind,categoryId,categoryName,amount,occurredOn,note}], page, pageSize, total}` |
| `POST /api/pf/transactions` | `{kind,categoryId,amount:"12500.00",occurredOn:"2026-09-03",note?}` | 201 item |
| `PATCH /api/pf/transactions/:id` | partial | 200 item; 404 if not owner's |
| `DELETE /api/pf/transactions/:id` | — | 204; 404 if not owner's |
| `GET /api/pf/summary` | `from,to` (default current month) | see below |

```json
{ "range": {"from":"2026-09-01","to":"2026-09-30"},
  "totals": {"income":"900000.00","expenses":"640000.00","balance":"260000.00","savingsRate":0.2889},
  "byCategory": [{"categoryId":"…","name":"Mortgage","kind":"expense","total":"250000.00","share":0.3906}],
  "byMonth": [{"month":"2026-09","income":"900000.00","expenses":"640000.00","balance":"260000.00"}],
  "balanceSeries": [{"date":"2026-09-03","cumulativeBalance":"-12500.00"}],
  "isEmpty": false }
```
Rules: `amount > 0`, ≤ 2 decimals, ≤ 1e12; `occurredOn` valid date within 1990-01-01…2100-12-31; category must belong to the same user and match `kind`; `from ≤ to`, span ≤ 5 y (`VALIDATION_ERROR`); `savingsRate = null` when income = 0.

**Market**
| Route | Response `data` |
|---|---|
| `GET /api/market/fx/latest` | `{rates:[{pair:"USD/AMD",rate:"363.44",diff:"-0.06",sourceDate:"2026-09-18"}, …4 pairs]}` + `meta{asOf,source:"CBA",stale}` |
| `GET /api/market/fx/history?pair=USD/AMD&days=30` | `{pair, series:[{date:"2026-09-12",rate:"363.28",isCarriedForward:true,sourceDate:"2026-09-11"}, …30]}` (`days` 7–90, default 30) |
| `GET /api/market/stocks` | `{items:[{symbol,name,price,previousClose,change,changePct,marketCap,peTtm,epsTtm,dividendYield,…}]}` (fields §5.3), `meta.isDelayed` |
| `GET /api/market/stocks/:symbol/history?range=1m` | `{symbol, series:[{date,close}]}`; symbol must be in the display list (`NVDA,AAPL,GOOGL,MSFT,AMZN`) |
| `GET /api/market/news` | `{items:[6 × {id,title,source,url,publishedAt,region:"armenia"\|"global",topic}]}` + `meta{asOf,stale}` |
| `POST /api/market/news/refresh` | same as GET; `429 RATE_LIMITED` if < 30 s since last user refresh |

**Investment** (stateless; session required only for access control)
| Route | Request | Response |
|---|---|---|
| `GET /api/invest/convert?amountAmd=500000` | — | `{amountAmd:"500000",usd:"1375.74",rate:"363.44",rateDate:"2026-09-18",source:"CBA"}` |
| `POST /api/invest/recommendation` | `{amountAmd, risk, horizon, mode, notNeededForEmergencies}` | single or portfolio result (§7.7) |
| `POST /api/invest/comparison` | `{holdings:[{symbol,shares}], window:"1Y"}` | `{window,start,end,series:[{date,portfolio,benchmark}],metrics:{portfolio:{…},benchmark:{…}},diversification:{…},disclaimers:[…]}` — recomputed from stored prices; **no persistence** |
The recommendation response for `mode=portfolio` includes a default 1Y `benchmark` block; `comparison` serves other windows. **Reject** any unknown request field (strict schema) — this also blocks accidental Personal Finance data.

### 10.5 Data-field notes
Snapshot record per symbol: `symbol,cik,name,sector,price,priceAsOf,marketCap,fiscalYearEnd,revenue,revenuePrev,revenue3yAgo,netIncome,eps,equity,assets,opCashFlow,capex,dps,vol1y,beta3y,maxDD1y,mom12_1,mom6,above200dma,factorScores{…},eligibleByRisk{low,medium,high},dataCompleteness,flags[]`. `methodologyVersion` and `snapshotDate` stored with every snapshot.

### 10.6 Business logic checklist
FX forward-fill (§4.4) · balance maths (§3) · news pipeline (§6.5) · eligibility/scoring/portfolio construction/whole-share allocation (§7) · benchmark math (§8.3) · stale-while-revalidate with locks (§1.4) · nightly batch: refresh constituents → EDGAR frames → price history → factor computation → snapshot write (atomic swap: write new snapshot then flip `latest`).

### 10.7 Edge cases (Backend must handle)
- CBA down / malformed XML / DiffGram schema drift → fallback chain → stale.
- Holiday/weekend, leading non-working day in window, currency missing on a date.
- Provider 429/403/timeouts; partial batch (some symbols fail) → snapshot marks symbols `incomplete` and excludes them; never block the whole snapshot.
- Stock split/dividend → adjusted close used; detect > ±40 % single-day jumps on *adjusted* series as data errors.
- Ticker changes/removals in constituents; duplicate share classes (GOOG/GOOGL) — **keep one line per issuer** to avoid double counting **[R]**.
- No eligible stock for (risk, horizon, budget) → `NO_ELIGIBLE_STOCK` with reason and suggestion.
- Amount smaller than cheapest eligible share; amount huge (cap by validation).
- Time zones: day boundaries in `Asia/Yerevan`; market dates are US Eastern trading dates.
- Concurrent requests during refresh (lock); cold DB start latency.
- Sign-up race on same email (unique index); password reset token reuse/expiry; session fixation.

### 10.8 Acceptance criteria
- **AC-B1** Sign-up/login/logout/forgot/reset work end-to-end; passwords stored only as strong hashes; generic errors; rate limit blocks the 6th failed login within 15 min.
- **AC-B2** A user can never read/modify another user's data (tested with two accounts on every `pf` route → 404/403).
- **AC-B3** `GET /api/pf/summary` for the fixture in §12.3 returns exact decimals; default range = current month in `Asia/Yerevan`.
- **AC-B4** FX history returns exactly `days` points with correct `isCarriedForward` for the fixtures (2026-09-12/13/21); RUB divided by `Amount`; fallback works when CBA is mocked as failing.
- **AC-B5** News endpoint returns exactly 6 items (unless < 6 sources available → `stale` flag / fewer with explanation), ≤ 2 per source and per topic bucket, ≤ 3 Armenia items, none older than window; reproducible from fixtures.
- **AC-B6** Recommendation is deterministic: same inputs + same snapshot ⇒ identical output; portfolio weights sum to 100 % ± 0.01; caps respected; every holding eligible for the chosen risk; average `vol1y` of picks non-decreasing Low → Medium → High on the fixture snapshot; output can (and in tests does) include a non-display company.
- **AC-B7** Whole-share allocation: `Σ cost ≤ budget`, leftover < cheapest holding price, actual vs target weights reported.
- **AC-B8** Benchmark metrics match hand-calculated results on the synthetic series in §12.4-H.
- **AC-B9** No import/SQL path from `invest/` or `market/` to `pf/` (automated check passes); `invest` writes no rows.
- **AC-B10** No provider key appears in client bundles or responses; all upstream calls are cached/locked (a load test of 100 concurrent users causes ≤ 1 upstream call per provider per TTL).

### 10.9 Dependencies
Owner-created keys/accounts (until they exist, run providers in **fixture/mock mode** and mark those endpoints `notConfigured`); verified provider gates (§13); UI copy from the UI spec for error strings (codes stay stable). No consent text needed (owner ruling).

### 10.10 Known limitations to document
Free-tier terms; annual (not TTM) fundamentals; possible ~7 % universe drop-out from tag gaps; free-tier delayed prices; single-vendor risk for constituents CSV; whole-share bias toward cheaper stocks; back-test bias (§8.4); cold-start latency; Vercel cron 1×/day.

---

## 11. HANDOVER — FRONTEND

### 11.1 Mission
Implement screens and client logic against the API contracts (§10.4). **Visual design will be supplied separately** — do not invent a design system; build functional, unstyled-to-minimal components whose structure/states are defined here, then apply the UI spec when provided. Never call third-party APIs; never embed keys.

### 11.2 Required inputs
This document; the API contracts; the pending UI/visual specification; shared password-rule module from Backend.

### 11.3 Routes / screens (functional)
| Route | Access | Content |
|---|---|---|
| `/` | public → redirect | logged out → `/auth`; logged in → `/dashboard` |
| `/auth` | public | single page with two states: **Create Account** ⇄ **Log in** (as reference §2.2), plus **Forgot password** and **Reset password** (token from email link) |
| `/dashboard` | login | Personal Finance Dashboard |
| `/market` | login | tabs: **Exchange Rates** · **Stocks** · **News** |
| `/invest` | login | Investment Recommendation |
Global: sign-out control, user's first name displayed.

### 11.4 Auth screens — fields & behaviour
- **Create Account:** First name, Last name, Email, Password (+ show/hide), live checklist (8+ characters · Uppercase · Lowercase · Number · Symbol) that turns each rule on as satisfied; submit disabled until valid; on success → `/dashboard`. Link "Already have an account? Log in".
- **Log in:** Email address, Password (+ show/hide), "Forgot password?", submit, link "Don't have an account yet? Sign up". Single generic error for wrong credentials.
- **Forgot password:** email field → always show "If an account exists, we've sent an email." **Reset:** new password (same rules) + submit.
- Field errors mapped from `error.fields`. Prevent double-submit; keep entered values on error except password. No consent checkbox/notice at sign-up (owner ruling).
- Session expiry (401 anywhere) → redirect to `/auth` and preserve target route.

### 11.5 Personal Finance Dashboard
- **Date range control:** default **current month** (first → last day, `Asia/Yerevan`); user can change `from`/`to`; validate `from ≤ to`; changing range refetches `summary`.
- **Add entry** form: kind (income/expense), category (filtered by kind, with "add category"), amount (AMD, > 0, ≤ 2 decimals), date, optional note. **Edit / delete** entries; list with pagination for the range.
- **Displays:** Total Income, Total Expenses, **Total Balance = Income − Expenses** (from `summary.totals`, do **not** recompute differently), savings rate ("—" when null), expense-by-category data, income-vs-expenses-by-month data, balance-over-time data.
- **States:** loading skeleton; **first-visit/empty** (`isEmpty:true` → charts render empty/skeleton with "add your first entry" guidance); error with retry; negative balance clearly indicated (not by colour alone).
- **Isolation:** this screen's state/storage is never read by `/invest`.

### 11.6 Market Information
**Exchange Rates tab:** four pairs (USD/AMD, EUR/AMD, GBP/AMD, RUB/AMD) with current rate, daily difference (sign + text), source-date ("CBA official rate, 18 Sep 2026"), a ~30-day series per pair (pair switcher or multiple charts — per UI spec). Points with `isCarriedForward:true` must be distinguishable and explained ("weekend/holiday — last working-day rate"). Formatting: RUB 4 decimals; others 2.
**Stocks tab:** five companies with fields §5.3 (price, prev close, change, %, market cap, P/E, EPS, dividend yield, 1-month history); show `asOf` and "delayed/indicative" when `meta.isDelayed`.
**News tab:** exactly the items returned (normally 6): title (link, new tab), source, relative + absolute time, region tag (Armenia/Global). **Refresh** button → `POST /news/refresh`; show "updated N min ago"; handle 429 (disable for the throttle period). Do not render any body text or images unless the UI spec says so and licensing allows.
All tabs: loading, error+retry, empty, stale ("updated N min ago").

### 11.7 Investment Recommendation page
- **Inputs:** Available investment amount (AMD, integer, thousands separators, 1,000–1,000,000,000), Risk (Low/Medium/High), Horizon (Short term / Medium term / Long term) with helper text (<2 y / 2–5 y / >5 y), required checkbox **"This money isn't needed for emergencies."** (§7.9), mode toggle **Single stock | Portfolio**.
- **Live conversion:** as the amount changes (debounce ~300 ms) call `GET /invest/convert` → show `500,000 AMD ≈ $1,376 USD` plus rate date/source. If conversion fails: show AMD only + "USD equivalent unavailable".
- **Submit** disabled until valid; call `POST /invest/recommendation`.
- **Single-stock result:** company name/ticker/sector, price, shares to buy for the budget, cost, leftover cash, the "why" (drivers with values and percentiles), 2 runner-ups, concentration warning, disclaimer, data timestamp, methodology version.
- **Portfolio result:** table of holdings (company, ticker, sector, **target %** and **actual %**, shares, cost in USD and AMD-equivalent, top reasons), unallocated cash, portfolio metrics (weighted beta, est. volatility, sector split, dividend yield, effective N), warnings.
- **Benchmark comparison (portfolio only):** **two lines — Recommended Portfolio vs Benchmark (S&P 500 ETF)** on a common rebased scale; window selector (1M/3M/6M/1Y/3Y/5Y, default 1Y → `POST /invest/comparison`); metrics table (§8.3) for both; diversification comparison (holdings count, effective N, sector exposure vs benchmark). **Must show** the honesty labels from §8.4 next to the chart and label the benchmark "reference only — not a recommendation".
- **States:** loading (computation may take seconds), `NO_ELIGIBLE_STOCK` explanation, validation errors, stale snapshot notice (`dataAsOf` older than 3 days), upstream unavailable.
- **Isolation:** the request contains only the allowed fields; the page never reads dashboard data.
- **Copy rules:** informational language only; never imperative ("buy now").

### 11.8 Formatting rules
AMD with thousands separators; USD `$1,376`; FX 2 decimals (RUB 4); percentages 1–2 decimals; dates like `18 Sep 2026`; times in `Asia/Yerevan`; negative numbers with a minus sign.

### 11.9 Edge cases
Very large/small amounts; pasting formatted numbers; leaving mid-flow (session expiry); slow API (skeletons > spinners); news with < 6 items; series shorter than requested window (show note); benchmark or portfolio series missing → hide chart, keep metrics; browser back/forward on auth screens; double-click submit.

### 11.10 Acceptance criteria
- **AC-F1** All auth screens implement fields, live password checklist and flows of §11.4; wrong login shows one generic message; no password is ever stored client-side.
- **AC-F2** Dashboard defaults to the current month; changing range updates all figures; balance displayed equals `totals.balance`; empty state on a new account.
- **AC-F3** Market tabs show every field listed, with loading/empty/error/stale states; carried-forward FX points are distinguishable.
- **AC-F4** News tab shows title, source, time, link only; Refresh respects throttling.
- **AC-F5** Investment page shows AMD and USD equivalent live (500,000 AMD → ≈ $1,376 when USD/AMD = 363.44); submit gating works; both result modes render all listed fields; benchmark chart has exactly two series with the disclaimers.
- **AC-F6** Network inspection shows the recommendation request contains only `amountAmd, risk, horizon, mode, notNeededForEmergencies`; no call to any non-own origin.
- **AC-F7** Keyboard operable forms; labels bound to inputs; error messages announced; up/down never conveyed by colour alone; layout works at phone width. *(Detailed visuals per UI spec.)*

### 11.11 Dependencies & limitations
Depends on Backend endpoints and the UI spec; chart library choice deferred to UI spec; English only; no offline mode; no saved recommendation history (by decision).

---

## 12. HANDOVER — QA

### 12.1 Mission
Design and run tests for functionality, security, independence and data correctness. Use **recorded fixtures**; never burn live provider quotas in CI. Do not fix app code — file defects (steps, expected, actual, severity).

### 12.2 Required inputs
This document; API contracts (§10.4); fixtures from Backend; staging URL; two test accounts.

### 12.3 Golden test data
- **Balance:** income {Salary 900,000.00}; expenses {Mortgage 250,000.00; Utilities 40,000.00; Internet 10,000.00; Food 200,000.00; Transport 60,000.00; Other 80,000.00} ⇒ total expenses 640,000.00; **balance 260,000.00**; savings rate 0.2889; largest category Mortgage 39.06 %.
- **FX (CBA, real):** Latest 2026-09-18 → USD 363.44 · EUR 417.05 · GBP 485.52 · RUB 4.3123. By-date Sat 2026-09-12 and Sun 2026-09-13 → 363.28 (from Fri 09-11). Mon 2026-09-21 (holiday) → 09-18. Range 2026-08-20…09-20 → **22** working-day rows per currency (dates: 08-20,21,24–28,31, 09-01–04,07–11,14–18).
- **Conversion:** 500,000 AMD at 363.44 = **1,375.74 USD** (display $1,376).
- **Weekend fill:** 30-day series has 30 points; 09-12 and 09-13 have `isCarriedForward=true`, `sourceDate=2026-09-11`.

### 12.4 Test areas & cases

**A. Authentication & accounts**
1. Sign-up happy path; required fields; name length; email format; duplicate email; each password rule individually failing; password not echoed/logged.
2. Login success/failure messages identical for unknown email vs wrong password; brute-force lockout at 5/15 min; session cookie flags (`HttpOnly`, `Secure`, `SameSite`); logout invalidates session server-side; expired session → 401 → redirect.
3. Forgot-password: same response for known/unknown email; token single-use, expires ≤ 60 min, second use rejected; old sessions policy documented.
4. **Authorization (IDOR):** user A cannot GET/PATCH/DELETE user B's transactions or categories by id; summary only reflects own data; direct API call without cookie → 401 on every route (`pf`, `market`, `invest`).
5. Security hygiene: SQL injection/XSS strings in note/names are stored inertly and escaped on render; CSRF attempt from another origin fails; response headers; no secrets in client bundle/logs.

**B. Personal Finance**
Balance maths (golden data, zero data, only income, only expenses, negative), decimal precision (no float drift: 0.10 + 0.20), default range = current month boundaries in `Asia/Yerevan` (test around midnight on the 1st), inclusive range edges, range validation (`from>to`, > 5 y), category/kind mismatch, pagination, edit/delete effects on summary, empty-state flag, large volume (10k rows) performance.

**C. Exchange rates**
Fixtures §12.3; fallback chain by mocking CBA failure/timeout/malformed XML; DiffGram parse robustness; `Amount ≠ 1`; missing currency on one date; stale flag & `asOf`; all four pairs present; freshness alert when source date is old.

**D. Stocks (display)**
Exactly the five display symbols; required fields non-null or explicitly `null` with reason; percent/change consistency (`change = price − previousClose`, `changePct = change/previousClose`); history has ~21 points for 1M; provider outage → stale; `isDelayed` set.

**E. News**
Exactly 6 (normal case); ≤ 2 per source/topic bucket; ≤ 3 Armenia, ≥ 2 Armenia when ≥ 2 qualifying exist; freshness windows; dedupe (same story from two sources → one item); URL canonicalisation; feed failure; all-feeds-down → stale; refresh throttle; no article body/images rendered; links open safely; only allowed fields in API.

**F. Investment — conversion & inputs**
Validation limits; USD equivalence; conversion failure fallback; amount formatting; acknowledgement gating; conflict combos (Low+Short note; High+Short warning).

**G. Investment — recommendation properties** (run on a fixed synthetic snapshot of ~60 stocks)
1. Determinism (same inputs → identical output).
2. Every pick passes eligibility for the chosen risk.
3. Portfolio: weights sum to 100 ± 0.01; `max weight ≤ cap`; sector cap; count `N` matches budget table; no duplicates; `Σcost ≤ budget`; leftover < min price; actual vs target reported.
4. Monotonic risk: mean `vol1y` of picks Low ≤ Medium ≤ High for the same horizon.
5. Horizon effect: Short weights raise Low-Risk factor share vs Long.
6. Non-limited universe: a fixture where the top scorer is *not* one of the five display companies is recommended; another fixture proves a display company can also win.
7. Missing-data stocks are excluded; incomplete factor → weights renormalised; flag present.
8. Explanation text numbers equal snapshot values (parse & compare).
9. `NO_ELIGIBLE_STOCK` when budget < cheapest eligible share.
10. Stability rule: pick unchanged if previous pick within 2 points and still eligible.
11. Wording: no imperative "buy/sell now"; disclaimer, `dataAsOf`, `methodologyVersion` present.
12. **Independence:** inject a user with rich finance data; recommendations for the same inputs are identical with or without that data; request/response payloads and storage contain no `pf` fields; a repo check fails if `invest/`/`market/` reference `pf`.

**H. Benchmark comparison**
- **Synthetic math check:** daily returns `[+10 %, −10 %, +10 %]` ⇒ cumulative `1.1×0.9×1.1 = 1.089` (**+8.9 %**); running values `100 → 110 → 99 → 108.9`; **max drawdown = −10 %** (110 → 99). Benchmark `[+1 %, +1 %, +1 %]` ⇒ +3.0301 %. Verify total return, drawdown, annualised vol (`stdev·√252`), beta/correlation/tracking error against an independent calculation (spreadsheet/Python).
- Series: both start at 100 on the same date; same dates; two series exactly; window shorter than data disclosed; missing days aligned (inner-join on trading dates).
- Whole-share buy-and-hold with cash; adjusted-close dividends inclusion; disclaimers displayed; benchmark labelled "reference only".

**I. Resilience, performance, accessibility**
Provider 429/timeouts; cache expiry & locks (100 concurrent users → ≤ 1 upstream call per TTL); cold DB start; recommendation latency target ≤ 3 s from snapshot (**[R]** target); keyboard/screen-reader access; phone layout; number formatting; timezone correctness (`Asia/Yerevan`).

### 12.5 Severity guide
Blocker: data leak across users, Investment reading Personal Finance data, wrong balance/conversion, weights ≠ 100 %, secrets exposed. Major: wrong weekend/holiday rate, non-deterministic recommendation, broken auth flow. Minor: copy/format issues. Any advice-like "buy now" wording = Major.

### 12.6 Exit criteria
All AC-B/AC-F pass; no Blocker/Major open; fixtures committed; test report per area.

### 12.7 Dependencies & limitations
Needs stable fixtures and a staging environment with two accounts; live provider tests limited to a small nightly smoke suite; results depend on frozen methodology version.

---

## 13. Day-1 verification spike (Backend) — what I could not verify

*Needs API keys/accounts. I did not (and must not) register accounts or handle credentials — **user action needed** to create free keys.*

1. **Finnhub:** `/quote`, `/stock/profile2`, `/stock/metric?metric=all`, `/stock/candle`, `/news?category=general` — record which return 403 on a free key; real-time vs delayed.
2. **Twelve Data:** `time_series` (batch), `quote`, `statistics`, `dividends`, `profile` — plan gates; batch size; commercial terms.
3. **FMP / Polygon(Massive):** free endpoint/symbol lists; `grouped daily` on free plan.
4. **SEC:** `dei` shares-outstanding fallback chain completeness, dividends concept fallbacks, fair-use rate & `User-Agent`; decide frames vs company facts for edge tickers.
5. **CBA:** log `ExchangeRatesLatest.CurrentDate` every 15 min for a week (local script or temporary GitHub Action) to learn publication time; look for terms of use.
6. **News terms:** read CNBC (403 for me), Bloomberg, FT, BBC, NYT, Guardian, Armenpress, News.am, Google News terms; ask ARKA/Armenpress about feed/syndication.
7. **Auth:** confirm Better Auth hashing algorithm/params, `firstName`/`lastName` additional fields, rate-limit hooks, password-reset flow on serverless; Resend sender-domain requirement for arbitrary recipients **[U]**.
8. **Vercel:** Hobby function max duration, cron behaviour, environment/region, deployment-protection options.
9. **Constituents licence:** confirm terms of the CSV source or pick an ETF-holdings file.
10. **US Treasury XML** parsing for risk-free rate (or keep `^IRX`).

**Decision gate:** if Finnhub *and* Twelve Data both gate needed metrics → use FMP + SEC EDGAR and compute ratios ourselves (every ratio in §7.3 is derivable from EDGAR + prices).

---

## 14. Risks & known limitations

| # | Risk / limitation | Impact | Mitigation |
|---|---|---|---|
| R1 | Free tiers and RSS terms are personal/non-commercial | Legal/cost if commercialised | Owner: personal prototype; gated by login; licence budget for production |
| R2 | Personalised stock recommendations may be regulated advice in Armenia | Legal | Legal opinion, disclaimers, kill switch (§9) |
| R3 | Unverified free-tier feature gates (§13) | Schedule | Day-1 spike + fallbacks |
| R4 | CBA is legacy SOAP/ASMX | Reliability | Adapter, persisted history, fallbacks |
| R5 | Weights/caps are uncalibrated starting values | Advice quality | Config-driven, versioned, backtest before real use |
| R6 | EDGAR tag gaps (~7 % revenue, ~63 % gross profit) | Data quality | Fallback chains, sector-aware metrics, completeness rule |
| R7 | Whole shares bias toward cheaper stocks on small budgets | UX/quality | Disclose; affordability-aware ranking |
| R8 | Hindsight/survivorship bias in benchmark chart | Misleading | Labels (§8.4), risk-first presentation |
| R9 | Vercel Hobby cron 1×/day, stateless, function time limits | Architecture | SWR + DB cache + GitHub Actions batch |
| R10 | Auth/data breach risk with real financial data | Severe | Proven library, OWASP settings, authz tests, minimal data, legal review |
| R11 | Armenia-specific finance news is sparse | Product | Soft quota, fallback to global |
| R12 | Neon free cold starts / 0.5 GB limit | Latency | Acceptable for prototype; upgrade in production |

---

## 15. Evidence log (what I actually ran, 2026-09-21)

| Check | Result |
|---|---|
| CBA SOAP `ExchangeRatesLatest` | 30 currencies; USD 363.44, EUR 417.05, GBP 485.52, RUB 4.3123 (Amount=1), date 2026-09-18 |
| CBA `ByDateByISO` Sat 09-12 / Sun 09-13 / Mon 09-21 | → CurrentDate 09-11 / 09-11 / 09-18 |
| CBA `ByDateRangeByISO` 08-20→09-20 | 22 rows/currency, working days only, DiffGram XML |
| Frankfurter v2 | 166 currencies incl. AMD, RUB; `providers=CBA` range = working days only |
| open.er-api / fawazahmed0 | AMD 364.47 / 363.44; fawazahmed0 historical 2026-08-21 = 364.63 |
| Yahoo `v8/chart` NVDA 1 mo | HTTP 200, 21 points; `quoteSummary` 401 Invalid Crumb |
| Yahoo chart SPY, VOO, IVV, ^GSPC 1 y with adj-close | 251 points each, adjclose YES; dividends 4/4/4/0; `^IRX` 3.982 % |
| Stooq CSV | JavaScript bot-check |
| SEC `companyfacts` NVDA; `company_tickers.json`; bulk `companyfacts.zip` | HTTP 200 (4.1 MB / 0.8 MB); zip HEAD 200, **1.41 GB** (too large for serverless; frames preferred) |
| SEC frames (Revenues, NetIncomeLoss, EPS, GrossProfit, OperatingIncome, Equity, Assets, OCF, Dividends, shares, capex) | HTTP 200, 0.3–0.9 MB, <1 s; S&P 500 coverage table §5.4 |
| SEC submissions NVDA | SIC 3674, Nasdaq, FYE 0131 |
| S&P 500 constituents CSV | 503 rows / 496 CIKs, 11 GICS sectors, updated 2026-09-21, no licence declared |
| RSS (global) | Yahoo 47, CNBC 30+30, MarketWatch 10/30 (marketpulse stale), WSJ 61, FT 11, Bloomberg 20, Guardian 40, BBC 54, NYT 49, SEC 25; Reuters unreachable |
| RSS (Armenia) | Armenpress EN 50 (categories; Economy 8/50), News.am ENG 100, PanArmenian 10, Armenian Weekly 10, Hetq 50, Google-News query 100; ARKA 403; Azatutyun Armenian-language; Mediamax 0; GDELT 1 item, 1 req/5 s |
| Reference site | sign-up: First name, Last name, Email, Password + checklist; login: Email, Password, Forgot password; nothing submitted |
| Alpha Vantage pricing page | free = 25 requests/day |

## 16. Sources
- CBA: https://api.cba.am/exchangerates.asmx · Frankfurter: https://frankfurter.dev · https://frankfurter.dev/providers/cba/ · https://github.com/fawazahmed0/exchange-api · https://www.exchangerate-api.com/docs/free
- Data vendors: https://www.alphavantage.co/premium/ · https://finnhub.io/pricing · https://twelvedata.com/pricing · https://site.financialmodelingprep.com/pricing-plans
- SEC EDGAR: https://data.sec.gov (frames/companyfacts/submissions) · https://www.sec.gov/files/company_tickers.json · S&P 500 CSV: https://github.com/datasets/s-and-p-500-companies
- Yahoo terms: https://legal.yahoo.com/us/en/yahoo/terms/otos/index.html
- Armenian news: https://armenpress.am/en · https://news.am/eng/ · https://arka.am/en/ · https://rss.feedspot.com/armenia_news_rss_feeds/
- Auth/DB: https://makerkit.dev/blog/tutorials/better-auth-vs-clerk · https://neon.com/pricing · https://resend.com/docs/knowledge-base/what-is-resend-pricing · OWASP Password Storage https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html · NIST SP 800-63B https://pages.nist.gov/800-63-4/sp800-63b.html
- Vercel: https://vercel.com/docs/cron-jobs/usage-and-pricing · https://vercel.com/docs/limits · https://vercel.com/docs/marketplace-storage
- Law/regulation: https://www.cba.am/en/Investment%20services%20providers/ · https://www.moj.am/storage/uploads/Personal_data_protection_law_ENG_OFFICIAL.pdf · https://www.esma.europa.eu/press-news/esma-news/esma-publishes-final-guidelines-mifid-ii-suitability-requirements-0
- Methodology: https://www.mdpi.com/1911-8074/14/11/551 · https://www.quant-investing.com/blog/quality-value-momentum-the-best-strategy-you-have-never-heard-of
- ETFs: https://www.nerdwallet.com/investing/learn/sp-500-etfs · https://capital.com/en-int/analysis/spy-ivv-and-voo-be-careful-not-all-s-p-500-etfs-are-the-same

*Blog/aggregator pages were used for [D] items and may be out of date; every [D]/[U] item that affects a build decision is scheduled for verification in §13.*


---

## 17. CHANGE ORDER 1 — Finova Frontend spec (2026-09-21) — **supersedes conflicting text above**

Source: `research/finova-frontend-spec.md` (owner-supplied). Product name is **Finova**. This section records exactly what changed in the Backend contract. Where this section and §1–§16 disagree, **this section wins**.

### 17.1 Personal Finance is now PERIOD-based (replaces §3, the `pf` tables in §2.6, the `pf` routes in §10.4, the balance fixture in §12.3, AC-B2/B3, §11.5)
No transactions table. No income categories. Income is **one amount per period**; expenses are **category amounts per period**.

```
pf.period          id uuid, user_id, kind ('month'|'custom'), start_date date, end_date date,
                   income numeric(14,2) NULL, created_at, updated_at
                   UNIQUE(user_id, start_date, end_date)   CHECK(start_date <= end_date)
                   kind='month' => start = 1st day, end = last day of that month
pf.period_expense  id uuid, period_id -> pf.period ON DELETE CASCADE, category_key text NULL,
                   label text, is_custom bool, amount numeric(14,2) NULL CHECK(amount IS NULL OR amount >= 0),
                   sort_order int      UNIQUE(period_id, lower(label))
```
- **Default expense categories (fixed keys/labels, always present in responses, all optional):** `housing` Housing · `food_dining` Food & Dining · `transportation` Transportation · `bills_utilities` Bills & Utilities · `shopping` Shopping · `entertainment` Entertainment · `other` Other.
- **Custom categories** belong to **that period only** (assumption; not carried to other periods), max 20 per period, label 1–40 chars, case-insensitive unique, must not equal a default label. Removing one = omit it in the next save.
- Derived values (server-computed, never trust the client): `expensesTotal = sum(amount)`; **`available = (income ?? 0) - expensesTotal`** — it is *not* a bank balance. `isEmpty = income is null AND every expense amount is null/0`. `incomeMissing = income is null AND expensesTotal > 0`.
- **Routes (all require a session, all scoped to `userId`):**

| Route | Behaviour |
|---|---|
| `GET /api/pf/periods` | list saved periods for the selector: `[{kind,start,end,hasData,updatedAt}]`, newest first |
| `GET /api/pf/period?kind=month&month=2026-09` or `?kind=custom&start=YYYY-MM-DD&end=YYYY-MM-DD` | if saved → data; if not → `exists:false` plus the default category list with null amounts (never an error) |
| `PUT /api/pf/period` | **upsert** the whole period `{kind, month or start+end, income, expenses:[{key?,label,amount}]}`; returns the computed view below. Custom categories missing from the payload are deleted. |
| `DELETE /api/pf/period?...` | delete one period (cascade) |

- **Response view (drives the charts):** `{ period:{kind,start,end}, exists, income, expenses:[{key,label,isCustom,amount}], totals:{income, expensesTotal, available}, expenseBreakdown:[{label,amount,percent}] /* only amount>0; percent sums to 100 via largest-remainder rounding */, cashFlow:{income, expenses, available}, isEmpty, incomeMissing, updatedAt }`.
- **Validation:** amounts ≥ 0, ≤ 1e12, ≤ 2 decimals; custom period span ≤ 366 days and `start ≤ end`; month is `YYYY-MM`. Any violation → `400 VALIDATION_ERROR` with `fields`.
- **Isolation rules (tests required):** saving period A never changes period B; two users never see each other's periods (IDOR); a monthly period and a custom period with different (start,end) are independent records.
- **Default period** for the UI = current calendar month in `Asia/Yerevan`. The old §3 "date-range default" is replaced by this period model.
- If any transaction-based `pf` code/tables/routes already exist, **remove them**.

### 17.2 News cards + News Detail (replaces §6.4 "what may be displayed" and the news routes in §10.4)
Owner ruling (educational prototype): cards may show **source, title, short summary, date/time, category, image, Read More**; the detail page lives at `/news/{article-id}`.
- Stored item fields: `id` (first 16 hex chars of sha256(canonical URL)), `title`, `source`, `url`, `publishedAt`, `region`, `category`, `summary` (feed description → strip HTML, decode entities, collapse whitespace, cap 400 chars at a word boundary + `…`), `imageUrl` (from `media:content` / `media:thumbnail` / `enclosure` / first `<img>` in the description; **https only**; else `null`), `topic`.
- **Category** (display label) is mapped from the topic bucket: Markets · Economy · Currencies & Commodities · Technology · Armenia · World.
- **Persist** the selected 6 **and** the last 7 days of candidates in `market.news_item` so `/news/{id}` keeps working after a refresh; unknown/expired id → `404 NOT_FOUND`.
- **Routes:** `GET /api/market/news` (6 items, all fields above), `POST /api/market/news/refresh` (throttled, unchanged), **`GET /api/market/news/:id`** → the item + `readFullUrl` (= the original `url`).
- **"Article Summary / Content" on the detail page = the feed summary only.** Do **not** scrape or store full article text. Attribution and the link to the original stay mandatory.
- No image proxying in v1; the client hot-links `imageUrl` (Frontend must handle missing/broken images with a placeholder). Production would need licensed images or a licensed news API.

### 17.3 Exchange-rate period selector (extends §4.4 and `GET /api/market/fx/history`)
`days` now accepts **7–366**. UI preset chips: **1W = 7, 1M = 30 (default), 3M = 90, 6M = 180, 1Y = 365**. Same forward-fill rules; still one CBA range call (+35-day pad); persisted rows in `market.fx_rate` are reused.

### 17.4 Recommendation output: score, section-level loading, AMD allocations (extends §7.7, §10.4)
- **`mode` = `single | portfolio`**, as separate calls, so the UI can load each section independently. Frontend will call `single`, `portfolio` and `comparison` in parallel. Request fields remain: `amountAmd, risk, horizon, mode, notNeededForEmergencies` (strict).
- **Score:** every result carries `score` (integer 0–100) = the pick's composite (single) or the **allocation-weighted composite** (portfolio), plus `scoreLabel: "Match score"` and `scoreNote: "How closely this selection fits your risk and horizon under Finova's scoring method. It is not a forecast of returns."` It is a **fit score, not a probability or an expected return**.
- **Portfolio holdings** add `allocationPercent` (actual, 1 decimal), `allocatedAmountUsd`, **`allocatedAmountAmd`** (integer AMD = cost × the conversion rate used). `sum(allocatedAmountAmd) + unallocatedCashAmd = amountAmd` **exactly** (put the rounding remainder into `unallocatedCashAmd`). Also return `usdRate`, `rateDate`.
- Single stock adds `allocatedAmountAmd/Usd` (= shares × price) and `unallocatedCashAmd`.

### 17.5 Recommendation History (REVERSES the earlier "recommendations are not saved" decision — now opt-in via an **Add** action)
- New table in the `invest` schema, **no FK/relationship to `pf`**: `invest.saved_recommendation` — `id uuid, user_id, created_at timestamptz, mode, inputs jsonb {amountAmd,risk,horizon}, usd_rate numeric, result jsonb (pick/holdings with prices, scores, weights, amounts, warnings), benchmark_summary jsonb NULL, methodology_version, snapshot_date, result_hash`.
- **Nothing is saved automatically.** Only the explicit Add action writes.
- **Tamper protection:** each recommendation response includes `saveToken` = HMAC-SHA256 over `(userId, resultHash, expiry ≤ 60 min)` with a server secret. `POST /api/invest/history {saveToken, result}` verifies the token and that `hash(result)` matches; otherwise `400 INVALID_SAVE_TOKEN`. Saving the same `result_hash` twice for the same user is **idempotent** (returns the existing row, 200).
- **Routes:** `POST /api/invest/history` (201/200), `GET /api/invest/history` → `{groups:[{date:"2026-09-21", label:"September 21, 2026", items:[...]}]}` (newest first; date = the `Asia/Yerevan` calendar day of `created_at`; pagination `page/pageSize≤50`), `GET /api/invest/history/:id`, `DELETE /api/invest/history/:id` (not in the spec — recommended, harmless; implement).
- **Independence rule updated:** `invest` may now write **only** to `invest.saved_recommendation`; it still never reads or joins `pf`; the module-separation test must keep failing on any `pf` reference from `invest/` or `market/`. Saved history is per user (IDOR tests).

### 17.6 Auth & profile (additions)
- **Auto-login after sign-up** (no email verification) — the sign-up route issues the session cookie; the UI then shows its normal loading transition.
- Forgot-password (email link → **Reset password** screen) stays as in §10.4. Product name **Finova** in email subject/templates and in one app-name constant.
- **Profile:** `GET /api/auth/session` returns `{user:{id, firstName, lastName, email}}`; Settings is **read-only** in v1 (edit profile / change password out of scope) plus sign-out.
- The reference login page is a **design/flow reference only**; Finova has its **own** accounts and database. No integration with the reference app's users or backend.

### 17.7 New/changed acceptance criteria (add to §10.8 / §11.10 / §12)
- **AC-B11** Saving period A does not change period B; a fresh period returns `exists:false` with the 7 default categories; custom category add/remove works; `available = income - sum(expenses)`; `expenseBreakdown.percent` sums to 100.
- **AC-B12** `GET /api/market/news/:id` returns the same item as in the list for an id from the last 7 days; unknown id → 404; card fields present (`summary`, `imageUrl` may be null, `category`).
- **AC-B13** `fx/history?days=365` returns 365 points with correct `isCarriedForward`.
- **AC-B14** Every recommendation has an integer `score` 0–100 and the AMD allocation sum identity holds exactly.
- **AC-B15** History: nothing saved without Add; forged/expired `saveToken` rejected; duplicate Add idempotent; groups by Yerevan date; user B cannot read/delete user A's history.
- **AC-B16** The module-separation test still passes with the new `invest.saved_recommendation` table (no `pf` references anywhere in `invest/` or `market/`).
- **Frontend (later):** all items in `research/finova-frontend-spec.md`; Adjust Preferences / Start Over always start from a clean form; no Personal Finance data reachable from the Investment flow.
