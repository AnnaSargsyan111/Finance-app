# Finova QA test plan (independent black-box, 2026-09-21)

Environment: shared dev server http://localhost:3000 (Next 16 dev, PGlite, no Resend/Finnhub/TwelveData keys -> stocks are notConfigured/Yahoo prototype, reset email printed to console).
Method: automated black-box HTTP suites `tests/qa/*.qa.ts` (run: `npx vitest run --config qa/vitest.qa.config.mts`), browser walkthrough (own tab, desktop/tablet/375px), manual review of responses. No `src/**` edits.

Priority (risk-first): 1) security/authz/independence (A, B, D)  2) money maths (C, H, I)  3) data correctness (E, F, G)  4) history (J)  5) UI vs spec + a11y + responsive (K)  6) resilience (L)  7) build/typecheck/flakiness (M).

| Area | Suite / method | Notes |
|---|---|---|
| A auth & accounts | tests/qa/auth.qa.ts + browser | sign-up rules, enumeration, rate limit (own fake IPs via X-Forwarded-For), cookie flags, logout, 401 on every route, forgot/reset e2e, CSRF, XSS/SQLi strings, secrets scan |
| B authorization | tests/qa/authz.qa.ts | two users, PF periods + history by id |
| C personal finance | tests/qa/pf.qa.ts | 0.10+0.20, percents, flags, custom categories, validation, normalisation, cascade |
| D independence | tests/qa/independence.qa.ts + code scan + browser payloads | rich-PF vs empty user, identical outputs |
| E FX | tests/qa/fx.qa.ts | fixtures section 12.3, boundaries |
| F news | tests/qa/news.qa.ts | invariants |
| G stocks | tests/qa/stocks.qa.ts | |
| H recommendation | tests/qa/invest.qa.ts | property style |
| I benchmark | tests/qa/benchmark.qa.ts | independent maths from returned series |
| J history | tests/qa/history.qa.ts | |
| K UI | browser | desktop, tablet, 375 |
| L resilience | limited; rest NOT TESTED | |
| M build | typecheck, isolated next build | |
