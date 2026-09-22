# Finova backend (README-backend)

Next.js 16 (App Router) Route Handlers as the API, Better Auth, Drizzle + Postgres (PGlite locally, Neon in production), Zod on every route. API contract: `API-CONTRACT.md`. Research/handover: `research/financial-market-research.md` (section 17 = Change Order 1, which wins).

## Run
```bash
cd Finance-app
npm install
cp .env.example .env.local      # then set BETTER_AUTH_SECRET (any long random string in dev), CRON_SECRET, SEC_USER_AGENT
npm run dev                     # http://localhost:3000, embedded PGlite DB in ./.data/pglite, migrations auto-applied
npm test                        # vitest: full suite (183 tests incl. Frontend tests/ui; backend: auth, pf, fx, news, stocks, universe batch, quant, invest, module separation)
npm run typecheck               # tsc --noEmit
npm run db:generate             # after editing a schema file (auto-generates the next SQL migration in ./drizzle)
npm run db:migrate              # explicit migration (DATABASE_URL=postgres://... for Neon; PGlite otherwise)
npm run job:universe            # nightly batch (see runbook). job:fx | job:news | job:stocks also exist
NEXT_DIST_DIR=.next-check npx next build   # production build without touching the dev server's .next
```
Only ONE process may open the PGlite directory. While `npm run dev` runs, trigger jobs through the server instead:
`curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H 'content-type: application/json' -d '{"limit":25}' http://localhost:3000/api/jobs/universe`.

## Folder map
```
src/app/api/**      Route Handlers (thin: route() factory + zod + service call)   <- Backend owns this
src/lib/            env, db (PGlite|pg switch), route factory, errors, time, money (exact decimals), methodology loader, quant/ (pure scoring maths shared by market batch + invest)
src/config/         app.ts (TTLs, limits, APP_NAME) + methodology.v1.json (ALL weights/caps/thresholds/keyword lists/source trust)
src/auth/           Better Auth config, shared password rules, scrypt hashing, CSRF/origin, rate limit, email adapter, service
src/pf/             Personal Finance (period based)      schema `pf`
src/market/         cache, polite http, fx/, news/, stocks/, providers/, universe/ (batch), read.ts (READ-ONLY facade for invest)   schema `market`
src/invest/         convert, recommend (single/portfolio), allocation, benchmark, comparison, history/ (opt-in save)   schema `invest`
drizzle/            generated SQL migrations          scripts/  migrate.ts, job.ts
tests/              vitest suites; tests/fixtures = official/open rate data (CBA, Frankfurter, fawazahmed0) + SYNTHETIC RSS feeds, Yahoo-shaped charts and keyed-provider fixtures (see tests/fixtures/README.md)
```
Frontend owns `src/ui/**`, `public/**`, `tests/ui/**` and the page/layout files in `src/app` outside `src/app/api`.

## Environment variables (`.env.example` lists them all; all server-side, none public)
`DATABASE_URL` (empty = local PGlite; `postgres://…` = Neon), `BETTER_AUTH_SECRET` (required in production; also derives the saveToken HMAC key), `APP_BASE_URL`, `TRUSTED_ORIGINS`, `PASSWORD_RESET_URL`, `RESEND_API_KEY` + `EMAIL_FROM`, `HTTP_USER_AGENT`, `SEC_USER_AGENT` (real contact required by SEC; no default, EDGAR calls are refused without it), `FINNHUB_API_KEY`, `TWELVE_DATA_API_KEY`, `KEYED_PROVIDER_MODE` (`auto`|`fixture`), `ALLOW_YAHOO_PROTOTYPE`, `CRON_SECRET`, `UNIVERSE_LIMIT`, `OFFLINE`.

## Architecture rules and how they are enforced
- `pf`, `market`, `invest` are separate folders and separate Postgres schemas. `tests/module-separation.test.ts` fails if `pf` imports market/invest/auth, if `market` imports pf/invest/auth, if `invest` imports anything from `market` except `@/market/read`, imports `pf` or `auth`, if any `pf.` SQL/`pgSchema("pf")` appears in `invest/` or `market/`, if `invest` touches the DB outside `invest/history/`, or writes anywhere except `invest.saved_recommendation` (Change Order 1). The check has a self-test.
- `invest` computes from: the request (strict schema, 5 fields), the latest universe snapshot, stored prices and the cached CBA rate. It never reads `pf` (verified by a test with a rich-pf user: identical output; row counts unchanged by recommend/comparison).
- Caching: `market.cache_entry` + lease lock `market.cache_lock` + in-process single-flight. Fresh -> served; expired -> ONE refresher; failure -> last good value with `stale:true`, failures back off 30 s. Verified: 100 concurrent callers = 1 upstream fetch (FX, news, stocks tests).
- Polite HTTP (`src/market/http.ts`): descriptive User-Agent from env, per-host spacing (SEC ~6/s, CBA/Yahoo 2/s, RSS 1.4/s), timeouts, bounded retries, OFFLINE switch.

## Providers and honesty about keys
No API keys exist yet. `GET /api/market/providers` and every stocks response report `notConfigured`. Live and verified: CBA SOAP, Frankfurter, fawazahmed0, SEC EDGAR, RSS feeds, Yahoo chart (prototype only). Keyed adapters (Finnhub, Twelve Data, Resend) are written from vendor docs and are **UNVERIFIED** against the real APIs. `KEYED_PROVIDER_MODE=fixture` serves synthetic fixtures from `tests/fixtures/providers` with `isFixture:true` on every item (dev/test only; reads files from disk, so not for Vercel).

## Nightly batch runbook (universe snapshot)
Steps: constituents CSV -> dedupe share classes -> EDGAR frames (41 calls, concept fallback chains from methodology) -> price history (Twelve Data if configured, else Yahoo prototype, 5 y, incremental afterwards) -> factor inputs/scores -> stable leaders -> `market.snapshot` row, then the `latest` pointer flips in one transaction (a failed run keeps the previous snapshot). Partial failures never block; symbols without prices/data are `incomplete` and excluded. Aborts the price stage after 8 consecutive provider failures.
- Run from GitHub Actions or a shell (`npm run job:universe`), ~17 min for the full universe with Yahoo pacing (measured 1004 s). Vercel Hobby cron is once a day and a function cannot run that long: use the job route only for `fx`/`news`/`stocks`.
- Check the last runs: `select job, status, started_at, finished_at, stats from market.job_run order by id desc`.
- The Investment API answers `503 NO_SNAPSHOT` until the first successful batch.

### Real coverage (full run on 2026-09-21, real constituents + EDGAR + Yahoo)
503 constituent rows -> 500 issuers (3 duplicate share classes dropped) · 500 with CIK · fundamentals FY2025: 494 with data · revenue 482, net income 494, EPS 478, operating income 380, gross profit 184, equity 499, assets 499, operating cash flow 494, dividends 352, shares 492 · prices 500/500, 0 price failures · **465 hard-eligible** (13 incomplete) · eligible by risk: low 77, medium 320, high 371. (The handover expected ~460 revenue with only two concepts; the four-concept chain reached 482.)

## Auth spike results (handover section 13.7)
- Better Auth 1.7.5 default hashing is scrypt N=2^14, r=16, p=1 (below the OWASP minimum N=2^17, r=8, p=1) -> replaced through `emailAndPassword.password.{hash,verify}` in `src/auth/password-hash.ts` (params stored in the hash; unit test asserts them).
- Extra fields `firstName`/`lastName` work via `user.additionalFields`. Reset tokens are stored hashed (`verification.storeIdentifier:"hashed"`, tested), single use, 60 min, sessions revoked after reset.
- Better Auth's own rate limiter only guards its HTTP handler, which we do not mount, so login/forgot/sign-up limits are our own Postgres-backed limiter (`auth.rate_event`).
- We call `auth.api.*` from our own routes (not the catch-all) so envelopes, shared password rules and CSRF apply uniformly.
- NOT VERIFIED: Resend sender-domain rules for arbitrary recipients (no key).

## Deviations from the handover (and why)
1. PGlite for dev/test behind `DATABASE_URL`; the `pg`/Neon path is compiled but **not exercised** (no Postgres server available).
2. `pf.period*` amounts are `numeric(15,2)` (spec DDL says 14,2) so the documented maximum 1e12 fits.
3. A custom period equal to one whole calendar month is normalised to that month (one record per (start,end)).
4. Factor percentiles are computed over the hard-eligible universe (same for all risks), not per risk level; per-risk caps only filter picks.
5. News dedupe adds synonym/stem normalisation ("Armenian"="Armenia", "prime minister"="PM") before the 0.6 Jaccard test; otherwise obvious duplicates across feeds were missed. News topic cap is 2 but Armenia items take their topic from content, so up to 3 Armenia items can coexist.
6. Missing dividend tag is treated as "no dividend" (flag `dps_assumed_zero`); every other data gap stays null and excludes the stock (no imputation).
7. Portfolio weights: when N x cap < 1 the per-position cap is infeasible and is relaxed to 1/N with a warning (`POSITION_CAP_NOT_ENFORCEABLE`). Budget is floored to the cent so AMD amounts can never exceed the input; AMD per holding is floored and the remainder goes to `unallocatedCashAmd` (identity exact).
8. History list/detail use the `{data, meta}` envelope (invest convention) rather than a bare `{groups}`.
9. `NEXT_DIST_DIR` support added to `next.config.ts` (lets a production build run beside the dev server).

## Known limitations / problems
- Free-tier, personal/non-commercial data terms (Yahoo prototype, RSS feeds, constituents CSV without a declared licence). Annual (not TTM) fundamentals. Whole-share bias toward cheaper stocks. Back-test bias (labelled in every comparison). Prices are delayed and the newest Yahoo bar can be an intraday value.
- Yahoo daily bars for the current session are partial while the market is open; fine for prototype, not for production.
- `pg` (Neon) path, Vercel behaviour (function limits, cron), Finnhub/Twelve Data/Resend adapters, CBA publication time and terms of use, news-publisher terms, Treasury XML (we use ^IRX via Yahoo): **not verified**.
- Cold start of a new serverless instance re-opens the DB and re-parses the ~1 MB snapshot once (memoised per instance).
- The forgot-password email is sent after the response; if the process dies before it runs the email is lost (no queue).
- Account deletion/export helper `deleteAllUserData` exists in `src/pf/periods.ts` but has no route (not in the contract).
- Data observation: in the 2026-09-21 Yahoo data, daily-return correlations of large tech stocks with the VOO series are ~0.35-0.65 (lag test confirms dates are aligned); comparison metrics reflect that data.
