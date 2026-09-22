# Finova QA defect log

Format: `### QA-nnn [Blocker|Major|Minor] title` then repro, expected vs actual, evidence, owner.
Severity per research section 12.5. Only defects I reproduced are listed; doubts go to qa/QA-REPORT.md as observations.

### QA-001 [Minor] Portfolio ACTUAL weights can exceed the risk cap with no warning
- Area: Investment portfolio (AC-B6 "caps respected"; research 7.6). Owner: Backend.
- Repro: log in, `POST /api/invest/recommendation {"amountAmd":964908,"risk":"low","horizon":"medium","mode":"portfolio","notNeededForEmergencies":true}` (also 785527 medium/short, 852458 high/short, 641220 low/medium).
- Expected: cap (Low 20 % / Medium 25 % / High 30 %) respected, or an explicit warning when whole-share rounding pushes a position over it.
- Actual: TARGET weights respect the cap, but ACTUAL weights do not: 8 of 348 holdings across 45 random requests (e.g. SPG 23.8 % vs cap 20 %, TRV 32.1 % vs 30 %, JNJ 25.7 % vs 20 %); warnings contain only WHOLE_SHARES_BIAS or nothing about the cap.
- Evidence: tests/qa/invest.qa.ts H4 console output ("OBSERVATION actual weight above the risk cap").
- Note: research 7.6 explicitly reports target and actual side by side, so this is Minor; the missing disclosure is the gap.

### QA-002 [Major, FIXED - verified] News detail page `publishedAt` can differ from the list card for the same article id
- Area: News (AC-B12 "GET /api/market/news/:id returns the same item as in the list"; research 17.2). Owner: Backend.
- Repro: log in, `GET /api/market/news`, take any returned item's `id`, then `GET /api/market/news/:id` immediately after (same cache window, no refresh in between). Compare `publishedAt` between the list item and the detail response.
- Expected: detail response is field-for-field identical to the list card (plus `readFullUrl`), per AC-B12.
- Actual: in a live run, 2 of 6 items had a different `publishedAt` between list and detail (all other fields — title, source, summary, imageUrl, category — matched): id `014d1b0eff77c228` list `2026-09-21T23:03:57.000Z` vs detail `2026-09-21T19:00:18.000Z`; id `d32911d4be5e4c4b` list `2026-09-21T21:34:32.000Z` vs detail `2026-09-21T17:59:45.000Z`.
- Likely cause: when one canonical URL is matched by several source feeds, the persisted "representative" row picked for `/news/:id` differs from the one selected for the list card (main relayed that Backend recently touched `src/market/news/service.ts` for source/summary/image consistency in this exact scenario; `publishedAt` still mismatches).
- Evidence: tests/qa/news.qa.ts "F list vs detail consistency" (added after this was found); ad hoc probe output above. Confirmed visually in the browser: the Market & News list showed "22 Sep 2026, 01:34 · 3 h ago" for the Paramount/BBC card, but its detail page (`/news/d32911d4be5e4c4b`) showed "21 Sep 2026, 21:59" for the same article - a 3.5 h discrepancy visible to a real user, not just in raw API output.
- Note: not a security/money issue, but it is an explicit acceptance criterion (AC-B12) and a user-visible inconsistency (article appears to have two different times), so Major rather than Minor.
- **Fix verified 2026-09-22**: Backend fixed `src/market/news/store.ts` (publishedAt/region were missing from the `onConflictDoUpdate` SET clause, so a row's timestamp froze at its first insert). Re-ran `tests/qa/news.qa.ts` "list vs detail consistency" against the live server after the fix: PASS, 0 mismatches across the current 6 items. Closing as fixed.

### QA-003 [Minor] Visiting /auth while already logged in does not redirect away from the sign-up/login form
- Area: Auth UI (frontend-spec §3 flow reference / QA checklist item K "visiting /auth while logged in"). Owner: Frontend.
- Repro: sign in (or sign up) successfully so a valid session cookie exists, confirm `GET /api/auth/session` returns 200 with the user, then navigate the browser to `http://localhost:3000/auth`.
- Expected: redirected to the main app (e.g. `/personal-finance`), consistent with how `/` and `/` already correctly redirect a logged-in user away from auth.
- Actual: the Create Account form renders normally at `/auth` even though the session is valid; no redirect happens (waited 2s, no client-side navigation). By contrast, navigating to `/` while logged in correctly lands on Personal Finance.
- Evidence: browser session, screenshot description above; `fetch('/api/auth/session')` from that same page returned `200 {user:{...}}` while the sign-up form was showing.
- Impact: low - a logged-in user landing on /auth (e.g. via a bookmark or back-button) sees a confusing "create account" form instead of the app; attempting to sign up again would just fail with EMAIL_TAKEN. No data or security exposure.

### QA-004 [Minor] Personal Finance year selector is clipped/unreadable at 375px mobile width
- Area: Personal Finance UI, mobile responsive (frontend-spec §10 "Mobile: adapt without losing functionality"). Owner: Frontend.
- Repro: resize the browser to 375x812 (mobile), open `/personal-finance` (Monthly period selector). Look at the month/year picker row (prev arrow, month `<select>`, year `<select>`, next arrow).
- Expected: the year value ("2026") is legible, matching the month selector's legibility.
- Actual: the year `<select>` renders only 56px wide (vs 125px for the month select) - visually it shows just a sliver/colon-like glyph instead of "2026", even though the DOM value and selected option text are correct ("2026"). The control is still technically usable (tap opens the native picker) but the displayed value is not readable, which fails the "no loss of functionality/clarity" mobile bar.
- Evidence: screenshot at 375px width; `document.querySelectorAll('select')[2].getBoundingClientRect().width` = 56 vs `scrollWidth` 54 for the text - the box is sized to content in a way that leaves no room to render fully at this breakpoint. Root cause looks like a fixed/flex-basis width on the year select that doesn't grow with 4-digit years.
- Not tested: other breakpoints/browsers; this may render differently in a real mobile browser vs the emulated viewport.

### QA-005 [Minor] Login error message does not appear when the form is submitted with Enter (only with a mouse click)
- Area: Auth UI, keyboard behaviour (frontend-spec §3.2; AC-F7 keyboard operability). Owner: Frontend.
- Follow-up on QA's own flagged-but-unconfirmed finding ("pressing Enter/Space could not submit the sign-up, log-in, or investment-amount forms" in its automation tool, filed as inconclusive rather than a defect). I re-tested independently with a different browser-automation tool (real key events, not synthetic ones) to resolve the ambiguity.
- Finding: **Enter DOES submit the Log In form** - a real `POST /api/auth/sign-in` fired and returned `401` (confirmed via the network log), so QA's broader worry (a site-wide keyboard-submission block, which would have been Major/Blocker under AC-F7) is NOT reproduced. That part is cleared.
- However, a real, narrower bug was found in the same test: with wrong credentials, submitting via **mouse click** shows "Email or password is incorrect." (confirmed - the Frontend agent's own report says the same), but submitting the identical form with the **Enter key** does not show that message - the page is left showing the empty "Welcome back" form with no visible error, even though the 401 response was received.
- Repro: go to `/auth`, switch to Log In, type any email/password for an account that does not exist, click into the password field, press Enter. Compare with: same fields, click the "Log in" button instead.
- Expected: identical error message shown regardless of how the form was submitted (Enter vs click).
- Evidence: network log showed `POST /api/auth/sign-in -> 401` after Enter, but `get_page_text` right after showed no error text; the same flow via a button click showed "Email or password is incorrect." immediately.
- Impact: low but real - a keyboard-only user submitting the login form with Enter and getting the credentials wrong sees no feedback and no indication anything happened, which is worse than the mouse-click experience and a genuine (if narrow) AC-F7 gap. Sign-up and the investment-amount step were NOT re-tested with this method; Frontend should check whether the same click-vs-Enter gap exists there too.
- Filed by: main (Anna's session), not the QA subagent - the QA subagent's own run had ended before this was resolved; qa/QA-REPORT.md's "unresolved finding" section should be read together with this entry.

