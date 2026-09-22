# Finova

Finova is an educational finance web app for a person living in Armenia. It combines three separate areas:

- **Personal Finance** — record income and expenses per period and see where the money goes.
- **Market Information** — AMD exchange rates, stock cards for five large companies, and financial news.
- **Investment Recommendation** — a step-by-step flow that suggests a single stock or a small portfolio from the S&P 500 and compares the portfolio with a broad-market benchmark.

> **Prototype for learning purposes.** Nothing here is investment advice. The app does not execute trades and has no broker integration. Recommendations come from a transparent, deterministic scoring method (no machine learning) and are a "fit" score, not a forecast of returns.

## Features

| Area | What it does |
|---|---|
| Accounts | Sign-up (first name, last name, email, password), login, forgot/reset password, automatic login after sign-up. The whole app is behind login. |
| Personal Finance | Period-based (monthly or custom period). One income amount, seven default expense categories plus custom ones. **Available / Difference = Income − Expenses** (it is not a bank balance). Expense breakdown pie and cash-flow bar chart. Every period is stored separately per user. |
| Exchange rates | USD, EUR, GBP and RUB against AMD from the Central Bank of Armenia, with 1W / 1M / 3M / 6M / 1Y history. Weekends and public holidays use the latest working-day rate. |
| Stocks | Cards for NVIDIA, Apple, Alphabet, Microsoft and Amazon (price, change, previous close, trend). These five are only the display list, not a recommendation list. |
| News | Six news cards (global markets plus some Armenia-specific items) with a detail page. Only the feed's own summary is shown, with a link to the original article. |
| Investment Recommendation | Amount in AMD (with live USD equivalent), risk tolerance, investment horizon, and a confirmation that the money is not needed for emergencies. Result: match score, single stock or portfolio with allocation percentages and amounts (whole shares), and a portfolio-vs-S&P 500 ETF comparison with a timeframe selector. Results can be saved to a history page only when the user chooses to. |
| Settings | Read-only profile (first name, last name, email) and sign-out. |

**Separation rule:** Personal Finance data is never used by the Investment Recommendation. This is enforced by an automated test (`tests/module-separation.test.ts`).

## Tech stack

Next.js 16 (App Router) and React 19, TypeScript, Better Auth, Drizzle ORM with Postgres (embedded PGlite for local development, Neon Postgres intended for production), Zod validation, Recharts, Vitest.

## Getting started

```bash
npm install
cp .env.example .env.local      # set BETTER_AUTH_SECRET (any long random string in dev), CRON_SECRET, SEC_USER_AGENT
npm run dev                     # http://localhost:3000 — local database in ./.data/pglite, migrations run automatically
npm test                        # test suites
npm run typecheck
```

Open http://localhost:3000/auth and create an account. See [`.env.example`](.env.example) for all environment variables (all server-side).

The universe of S&P 500 companies used for recommendations is built by a batch job (`npm run job:universe`, about 17 minutes). Until it has run once, the Investment API answers `503 NO_SNAPSHOT`. Details are in [`README-backend.md`](README-backend.md).

## Project layout

```
src/app/            pages (UI) and src/app/api/** (API route handlers)
src/ui/             frontend components, API client, styles
src/auth, pf, market, invest, lib, config   backend modules (pf / market / invest are separate)
drizzle/            SQL migrations          scripts/  migration and batch-job scripts
tests/              backend and UI tests (tests/fixtures = recorded and synthetic provider data)
research/           research, handover, Change Order 1, and the frontend specification
.claude/agents/     agent definitions used to build this project
```

## Documentation

- [`research/financial-market-research.md`](research/financial-market-research.md) — research, methodology and handovers (section 17 = latest changes)
- [`research/finova-frontend-spec.md`](research/finova-frontend-spec.md) — frontend requirements
- [`API-CONTRACT.md`](API-CONTRACT.md) — API request/response contract
- [`README-backend.md`](README-backend.md) — backend runbook, deviations and known limitations

## Data sources and current status

- **Working with real data:** Central Bank of Armenia exchange rates, SEC EDGAR fundamentals, RSS news feeds, S&P 500 constituent list.
- **Prototype only:** stock prices currently come from an unofficial Yahoo Finance endpoint (its terms restrict automated use). Do not rely on it beyond a prototype.
- **Written but not verified against the real services:** Finnhub, Twelve Data, Resend (email), Neon (production database) and Vercel deployment behaviour. No API keys are included in this repository.
- Free-tier and RSS terms are for personal/non-commercial use. Commercial use would need licensed market and news data and a legal review.

## License

No license has been chosen yet, so all rights are reserved by default.
