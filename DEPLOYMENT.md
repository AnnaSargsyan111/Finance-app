# Deploying Finova to Vercel — readiness checklist

This is a checklist, not a deploy log — nothing in this repository has been deployed, and no Vercel/Neon/GitHub
Actions/Resend account was created or touched while writing it. Everything below is either a code fix already in the
repo or a manual step for whoever actually deploys. Follow it in order the first time; steps marked **(repeat after
schema changes)** or **(repeat periodically)** are ongoing, not one-time.

Companion docs: `README-backend.md` (architecture, folder map, how to run locally), `API-CONTRACT.md` (the HTTP
contract). This file only covers what changes between "works on the shared dev server" and "works once deployed."

---

## 1. Environment variables

Set these as **Vercel project environment variables** (Project → Settings → Environment Variables), not in a
committed file. `.env.example` lists the same names with dev placeholders — copy the *names*, not the *values*, into
Vercel. All variables are server-side; none are ever read by client code (enforced by
`tests/module-separation.test.ts`, which fails the build's test suite if any `NEXT_PUBLIC_*` var or a secret name
appears in `src/ui/**`).

| Variable | Required? | Real value for production | **What breaks if left as the dev default / unset** |
|---|---|---|---|
| `DATABASE_URL` | **Required** | Neon **pooled** connection string (host contains `-pooler`), e.g. `postgres://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require` | Unset in production → the app throws at startup (`DATABASE_URL must be set...`, `src/lib/db.ts`). Using the *unpooled* Neon host instead of `-pooler` → the app will still work at low traffic, but is exactly the serverless connection-exhaustion trap Neon's pooler exists to prevent (§4 below) — you will eventually see connection errors under concurrent load. |
| `BETTER_AUTH_SECRET` | **Required** | A long random string, generated once and never rotated casually (rotating invalidates every session and every in-flight password-reset token). Generate with `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`. | Unset in production → throws at startup (`src/lib/env.ts` `getAuthSecret()`). If it were left as the dev fallback, every session/reset token would be forgeable — this is why the app refuses to start instead. |
| `APP_BASE_URL` | **Required** | The real deployed origin, e.g. `https://finova.vercel.app` (no path, no trailing slash) | **Silent breakage, not a startup error you'd notice immediately**: `getEnv()` *does* now refuse to start if this is left at `http://localhost:3000` (or any `127.0.0.1`/`[::1]`/`0.0.0.0` host) while `NODE_ENV=production` — see `tests/env.test.ts`. Before that guard existed the failure mode was worse: the CSRF check (`src/auth/csrf.ts`) allow-lists origins from `APP_BASE_URL`, so leaving it at the dev default would make **every** sign-up/sign-in/PUT/POST from the real site fail with `403 CSRF_ORIGIN_MISMATCH` — nothing mutating would work, with no obvious single error to point at. Password-reset email links would also point at `localhost`. |
| `TRUSTED_ORIGINS` | Optional | Comma-separated extra origins (e.g. a Vercel preview-deployment URL) that should also be allowed to make state-changing requests | Left unset: only `APP_BASE_URL` is trusted. Preview deployments (each gets its own `*.vercel.app` URL) will get `CSRF_ORIGIN_MISMATCH` on mutating requests unless you add their origin here or accept that previews are read-only for testing. |
| `PASSWORD_RESET_URL` | Optional | Leave unset unless you want a non-default link shape; default is `${APP_BASE_URL}/auth?mode=reset&token={token}` | Left unset: falls back to the default template built from `APP_BASE_URL`, which is correct as long as `APP_BASE_URL` itself is correct. |
| `RESEND_API_KEY` + `EMAIL_FROM` | Optional (owner-gated) | A real Resend API key and a verified sending address/domain | Left unset: password-reset emails are **printed to the Vercel function log instead of sent** (`src/auth/email.ts`). Forgot-password still returns the correct generic response to the user (no enumeration), but no email arrives — this is a known, accepted gap for a prototype with no email provider yet (§7). |
| `SEC_USER_AGENT` | **Required for SEC EDGAR / the universe batch** | `"YourAppName contact@your-real-domain"` — SEC requires a real, working contact in the User-Agent | Left unset: every SEC EDGAR call is refused before it is made (`NotConfiguredError`, `src/market/universe/edgar.ts`) — the universe batch cannot run at all, not even partially. Never hard-code an email in source; it only ever comes from this env var. |
| `HTTP_USER_AGENT` | Optional | A descriptive string identifying the deployed app (CBA/RSS/Yahoo/GitHub requests) | Left unset: falls back to a generic educational-project string, which still works but doesn't identify *your* deployment to upstream hosts you're polling — set it if you want to be a better citizen of those APIs. |
| `FINNHUB_API_KEY` | Optional (owner-gated) | A real Finnhub key | Unset: `GET /api/market/stocks` falls back to the Yahoo prototype route for quotes (labelled `isDelayed`, `notConfigured: ["finnhub", ...]`) — still functions, just less data (no P/E, EPS, etc. beyond what the SEC-derived snapshot fills in). |
| `TWELVE_DATA_API_KEY` | Optional (owner-gated) | A real Twelve Data key | Unset: 1-month stock history and the universe price batch fall back to the Yahoo prototype route. Same caveat as above (§7). |
| `KEYED_PROVIDER_MODE` | Optional | `auto` (default) in production. **Never `fixture` in production** | Leaving it at `fixture` would serve synthetic/invented numbers (clearly flagged `isFixture:true`, but still not real data) as if they were live — only use `fixture` for local dev/tests. `auto` is what makes `notConfigured` reporting work correctly. |
| `ALLOW_YAHOO_PROTOTYPE` | Optional | `true` unless you have replaced the Yahoo fallback with a licensed feed | `false`: the last fallback for quotes/history/universe prices/benchmark data disappears — with no Finnhub/Twelve Data keys either, stocks/universe/benchmark endpoints would mostly return `UPSTREAM_UNAVAILABLE` or `NO_SNAPSHOT`. Leave `true` for now; this fallback is unofficial and ToS-restricted regardless (§7) — replacing it with a licensed source is a pre-launch item, not a deploy-readiness one. |
| `CRON_SECRET` | **Required for any scheduled/automated job trigger** | A long random string (same generation command as `BETTER_AUTH_SECRET`, but a **different** value — do not reuse it) | Unset: `/api/jobs/*` refuses every request (403), including Vercel Cron's own auto-authenticated requests — the daily `fx`/`news`/`stocks` refreshes configured in `vercel.json` (§4) silently 403 forever with nothing else looking broken (the app still works via its own on-demand cache refresh; the jobs are a warm-cache convenience, not a hard dependency — see README-backend "Caching"). |
| `UNIVERSE_LIMIT` | Optional | Leave unset in production (unset = full ~500-issuer run) | Only meaningful for local dev; if accidentally left set on a production `CRON_SECRET`-triggered run it would silently produce a partial (test-sized) snapshot. Not read by the cron `GET` path at all (see §3 — `universe` never runs from cron), only relevant to a manual/GitHub-Actions `POST`. |
| `OFFLINE` | Optional | Must be unset/`false` in production | `true`: every outbound provider call is refused (`UPSTREAM_UNAVAILABLE`) — this flag exists only for fully offline test runs. |

**Do NOT set `NEXT_DIST_DIR` in Vercel.** It exists only so a local production build (`next build`) can write to a
directory other than `.next` while a `next dev` server is also running against the same checkout — a dev-machine
convenience (see `next.config.ts`). Vercel's own build pipeline always wants the default `.next` output directory;
setting `NEXT_DIST_DIR` on Vercel would misplace the build output and the deployment would fail to serve.

**Node.js version:** `package.json` now pins `"engines": { "node": "22.x" }`. This repository was developed against
Node v24.19.0 locally; Next.js 16 itself only requires `>=20.9.0`. 22.x was chosen as a safely-supported LTS line
comfortably above that floor. **Before your first deploy, confirm 22.x is still in Vercel's supported Node.js
versions** (Project Settings → General → Node.js Version) — Vercel's supported list moves over time and this could
not be checked live while writing this doc (no Vercel account was used). If it has moved on, update the `engines`
pin to match rather than leaving a mismatch; Vercel fails the build outright on an unsupported pinned major.

---

## 2. Database: run migrations against Neon yourself

**Migrations do NOT run automatically against Neon/Postgres.** They only auto-run against the local PGlite database
(that's why `npm run dev` "just works" with zero setup) — `src/lib/db.ts` now says this loudly in a comment at the
top of the file, and the `pg` (Neon) code path deliberately never calls `migrate()` on its own. This is intentional:
running DDL from inside a request handler on every cold start against a shared production database is not something
to do implicitly.

```bash
# One-time, before first use, AND again after every schema change (a new/changed file under src/*/schema.ts
# followed by `npm run db:generate`, which writes the new SQL file under drizzle/):
DATABASE_URL="<your Neon pooled connection string>" npm run db:migrate
```

Run this from your own machine (or CI) with the real `DATABASE_URL` — never commit that value. Confirm it worked by
connecting to Neon (its SQL console, or `psql`) and checking the four schemas exist: `select schema_name from
information_schema.schemata where schema_name in ('auth','pf','market','invest');`

---

## 3. Universe batch: required once before Investment works

`POST /api/invest/recommendation`, `.../comparison` and `.../history` all read the latest **universe snapshot**
(`market.snapshot`, built by the nightly batch). Before that batch has run successfully at least once, every
Investment request returns `503 NO_SNAPSHOT` — this is correct, honest behaviour (no invented data), but it means
Investment is **not usable immediately after deploy** until you run the batch.

The batch takes about 17 minutes for the full ~500-issuer S&P 500 universe (measured locally: 1004 s), which is far
longer than a Vercel serverless function's budget — **never trigger it from a Vercel Cron / scheduled request** (the
`GET /api/jobs/universe` route refuses this on purpose with `405 METHOD_NOT_ALLOWED`, see §4). Run it from
somewhere with no serverless time limit instead:

**Option A — GitHub Actions**, `workflow_dispatch` (manual button) or a low-frequency `schedule` (e.g. weekly —
fundamentals don't change daily; see README-backend "Real coverage"). This repository does **not** currently commit
a workflow file (adding one wasn't in scope for this readiness pass, and a scheduled workflow starts running for
real the moment it lands on the default branch of a public repo) — add one shaped like this when you're ready:

```yaml
# .github/workflows/universe.yml (add this file yourself when ready to run it - not committed by this readiness pass)
name: universe batch
on:
  workflow_dispatch: {}
  schedule:
    - cron: "0 3 * * 1"   # weekly, Monday 03:00 UTC - adjust as you like
jobs:
  run:
    runs-on: ubuntu-latest
    timeout-minutes: 30
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "22.x" }
      - run: npm ci
      - run: npm run job:universe
        env:
          DATABASE_URL: ${{ secrets.DATABASE_URL }}
          SEC_USER_AGENT: ${{ secrets.SEC_USER_AGENT }}
          TWELVE_DATA_API_KEY: ${{ secrets.TWELVE_DATA_API_KEY }}   # optional; falls back to the Yahoo prototype
          ALLOW_YAHOO_PROTOTYPE: "true"
```

This runs `scripts/job.ts universe` directly against Neon (bypassing the deployed app's HTTP layer entirely, so
there's no function-duration limit and no `CRON_SECRET` needed for this path). Add `DATABASE_URL` and
`SEC_USER_AGENT` as **GitHub Actions repository secrets** yourself when you set this up.

**Option B — trigger it via the deployed app itself**, from your own machine, with generous timeouts (this DOES go
through the Vercel function, so it needs a plan/config whose function timeout covers ~17-20 minutes; Hobby's default
is far shorter — check your current plan before relying on this path in production):

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" -H 'content-type: application/json' -d '{}' \
  https://<your-deployment>.vercel.app/api/jobs/universe
```

Either way, the batch is **safe to re-run**: it writes a brand-new snapshot row and only flips the `latest` pointer
to it after the whole run succeeds (atomic swap, `src/market/universe/snapshot-store.ts`) — a failed or partial run
never replaces a good snapshot, and Investment keeps serving the last good one throughout. It is also already paced
politely against SEC (≈6.6 req/s), CBA and Yahoo (`src/market/http.ts` per-host spacing) — nothing extra to
configure for rate-limit safety.

**Repeat periodically** (weekly is reasonable — fundamentals and the constituent list don't move daily) via
whichever option you chose above.

---

## 4. Vercel Cron: `fx` / `news` / `stocks` (NOT `universe`)

A `vercel.json` is already committed at the repo root:

```json
{
  "crons": [
    { "path": "/api/jobs/fx", "schedule": "5 4 * * *" },
    { "path": "/api/jobs/news", "schedule": "20 4 * * *" },
    { "path": "/api/jobs/stocks", "schedule": "35 4 * * *" }
  ]
}
```

This file is inert until you actually deploy to Vercel — nothing runs from it just by being in the repo. Once
deployed with `CRON_SECRET` set as a project env var, Vercel will `GET` each path once a day at the given UTC time
(staggered a few minutes apart so they don't all hit their upstreams at once) and **automatically attaches
`Authorization: Bearer $CRON_SECRET`** — no extra wiring needed on your side. `GET /api/jobs/[name]/route.ts` was
extended specifically for this: it requires the same bearer secret as the existing `POST` path, takes no request
body (cron requests send none), and explicitly refuses `name=universe` with `405 METHOD_NOT_ALLOWED` so a scheduler
can never accidentally kick off the long batch (§3) and repeatedly burn function time hitting a timeout.

- **Hobby plan**: cron jobs run **at most once per day** each, and Vercel says a job "fires anywhere within the
  scheduled hour" rather than at an exact minute — the schedules above are already daily, which is the cadence this
  app needs (each job just warms/refreshes a 15-45-minute cache; see README-backend "Caching" — none of these are
  load-bearing for correctness, the app refreshes on demand regardless of whether cron ever fires).
- If you're on a paid plan and want a shorter interval, tighten the `schedule` cron expressions — nothing else needs
  to change.
- These three jobs are all fast (seconds), well within any function timeout.

---

## 5. Connection pooling & TLS to Neon (already handled in code — read this before raising `max`)

`src/lib/db.ts`'s `createPg()`:
- Uses `max: 3` for the pool **per serverless function instance**. This does **not** bound total connections across
  a deployment — Vercel can run many concurrent instances of the same function, each with its own process and
  therefore its own pool, so real fan-out is `(concurrent instances) × max`. **You must use Neon's pooled connection
  string** (hostname contains `-pooler`) in `DATABASE_URL` — that's what actually protects the underlying Postgres
  from too many simultaneous connections under serverless fan-out; our own `max` only bounds one instance's reuse.
  Do not point `DATABASE_URL` at Neon's direct (non-pooled) host in production.
- Forces TLS (`ssl: true`) whenever the connection string doesn't already specify `sslmode`/`sslcert`/`sslkey`/
  `sslrootcert` itself. Neon's own pooled connection strings already include `?sslmode=require`, in which case `pg`
  parses that from the URL and this explicit option is inert (the URL's own value always wins) — the fallback only
  matters if you ever point `DATABASE_URL` at a Postgres host whose connection string omits sslmode entirely; without
  it, `pg` would silently attempt (and Neon would refuse) a plaintext connection instead of clearly requesting TLS.
- Migrations use a separate one-shot `max: 1` pool (`migratePg()`, §2) — unrelated to the app's own runtime pool.

If you later see connection-limit errors under real traffic, first confirm you're on the pooled endpoint before
raising `max` — raising it multiplies by every concurrent instance, which is rarely what you want on Neon's free/low
tiers.

---

## 6. Post-deploy smoke test

Run these against the real deployed URL after the steps above. Expected results assume you've run the universe
batch (§3) and migrations (§2) already; FX/news/stocks results depend on the real upstreams being reachable, which
they should be from Vercel's network same as from any other host.

1. **Sign up** — `POST /api/auth/sign-up` with a real-looking email/password (or through the UI once Frontend's
   pages are live). Expect `201` with `{user}` and a session cookie; the CSRF check must accept the request (if it
   doesn't, `APP_BASE_URL` is still wrong — see §1).
2. **FX latest** — `GET /api/market/fx/latest` (with the session cookie). Expect `200`, `meta.source: "CBA"`,
   `meta.stale: false`, four rates (USD/EUR/GBP/RUB).
3. **News list** — `GET /api/market/news`. Expect `200` with up to 6 items, each with `title`, `source`,
   `publishedAt`, `category`, `summary`/`imageUrl` (may be `null`). First call after deploy may take a few seconds
   (cold cache, real RSS fetches); subsequent calls should be fast (cached).
4. **Run the universe job once** (if you haven't via §3) and confirm it completes: check `market.job_run` in Neon for
   a row with `status='ok'`, or the command/route's own JSON response for `coverage.hardEligible > 0`.
5. **Single-stock recommendation** — `POST /api/invest/recommendation` with
   `{"amountAmd": 500000, "risk": "medium", "horizon": "long", "mode": "single", "notNeededForEmergencies": true}`.
   Expect `200`, a `pick` with a real S&P 500 symbol, an integer `score` 0-100, and `allocatedAmountAmd +
   unallocatedCashAmd === amountAmd` exactly.
6. **Portfolio recommendation** — same request with `"mode": "portfolio"` and a larger `amountAmd` (e.g.
   `5000000`). Expect `200`, several `holdings`, weights summing to ~100%, and an embedded `benchmark` block
   (1Y vs VOO) unless price history is thin for some holding.

If any of 5/6 returns `503 NO_SNAPSHOT`, the universe batch (§3) hasn't completed yet — that is the expected,
honest failure mode, not a bug.

---

## 7. Known gaps — same in production as they are in dev (not surprises, not blockers)

- **No real Finnhub / Twelve Data / Resend keys exist yet.** Stocks/universe fall back to the unofficial Yahoo
  `v8/chart` prototype route (clearly labelled `isDelayed`/`notConfigured` in every response); password-reset emails
  are logged to the Vercel function log instead of sent. Both are accepted, owner-gated gaps, not deploy blockers —
  see README-backend "Providers and honesty about keys."
- **The Yahoo fallback is unofficial and ToS-restricted** (`ALLOW_YAHOO_PROTOTYPE`). It is a prototype-only stopgap
  in production exactly as it is in dev; replacing it with a licensed feed is a pre-launch item, not something this
  readiness pass changes.
- **Fundamentals are annual, not TTM** (SEC EDGAR frames, latest fiscal year) — same data basis in prod as in dev.
- **Free-tier / no-declared-licence data sources** (RSS feeds, the S&P 500 constituents CSV, Yahoo) — see
  README-backend "Known limitations" for the full list; none of this changes by deploying.
- **The `pg` (Neon) code path itself was never exercised against a real Postgres server** while building this app
  (no Neon instance was available) — it compiles, is type-checked, and its SSL/pooling logic was reasoned through
  and fixed as part of this readiness pass (§5), but the very first real connection to Neon is still a genuine
  first, not a re-verification. Budget time for that in your first deploy rather than assuming it is a formality.
