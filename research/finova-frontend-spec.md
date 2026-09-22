# Finova — Frontend Requirements Specification (owner-supplied, 2026-09-21)

> Source of truth for the Frontend agent. Copied from the product owner's message; wording preserved, formatting only tidied.
> Where this conflicts with `financial-market-research.md`, see **§17 Change Order 1** in that file (it records how each conflict was resolved).

**Product name: Finova**

## 1. Product Overview
Finova is a financial web application that provides users with: personal finance management; market and exchange-rate information; stock market information; financial news; personalized investment recommendations; recommendation history; user profile/settings.
Responsive: Desktop and Mobile. Visual direction inspired by the provided **Fundja** finance dashboard reference, keeping Finova's own branding, structure and content.

## 2. Navigation
Main navigation: **Personal Finance · Market & News · Investment Recommendation · Settings / Profile**.
Authentication screens: **Sign Up, Log In** — "for sign up/log in you can use https://eye-color-detection.vercel.app/ this web application credentials" *(interpretation pending — see CO-1 question; treated as design/flow reference only).*
- **Recommendation History**: accessible from the Investment Recommendation result flow; a **separate page**.
- **News Detail**: separate page/route reached by clicking a news card in Market & News; **not** a main navigation item.

## 3. Authentication
### 3.1 Sign Up
Fields: First Name, Last Name, Email, Password. **No Confirm Password.** Password: Show / Hide. After successful registration the user is **automatically logged in** and proceeds through the application's normal loading transition before reaching the main application.
### 3.2 Log In
Fields: Email, Password. Also: Forgot Password; Show / Hide Password.

## 4. Personal Finance Dashboard
Independent feature. Data must not be shared with or automatically used by Investment Recommendation.
### 4.1 Period Selector (required)
User selects a period and enters financial data for that specific period. Options: **Monthly periods**, **Custom period**. On change: show that period's data; if none, show empty state; other periods' data unchanged; **each period stored separately in the database**.
### 4.2 Financial Overview
Income · Expenses · Available / Difference, where **Available / Difference = Income − Expenses**. Do not treat this as the user's actual bank balance.
### 4.3 Income
One overall amount (e.g. `Income: 850,000 AMD`). No income categories.
### 4.4 Expenses
Default categories: **Housing, Food & Dining, Transportation, Bills & Utilities, Shopping, Entertainment, Other**. All expense fields optional. Users can add custom expense categories via **+ Add category**; a custom category becomes an additional expense input, counts in total expenses, appears in the Expense Breakdown chart, and can be removed.
### 4.5 Expense Breakdown
Pie chart generated dynamically from entered expense values (e.g. Housing 35%, Food & Dining 20%, Transportation 15%); updates when values change. No expense data → chart skeleton / empty state that communicates data needs to be entered.
### 4.6 Cash Flow
Bar chart: Income, Expenses, Available / Difference. Updates dynamically. No data → chart skeleton / empty state.
### 4.7 Data Persistence
Stored in backend/database. Frontend must: load saved data for the selected period; save newly entered data; update existing period data; keep periods independent. **No temporary frontend-only storage as the primary data source.**
### 4.8 Empty State
New user or period with no data: input fields remain available; charts show skeleton/empty states; UI clearly communicates that data must be entered. **No misleading zero-value charts.**
### 4.9 No Transactions Table
The dashboard must **not** use a transactions table. Primary interface: Financial Overview, Income & Expenses, Expense Breakdown, Cash Flow.

## 5. Market & News (main navigation section)
### 5.1 Exchange Rates
USD/AMD, EUR/AMD, GBP/AMD, RUB/AMD — current/latest rates and historical movement. A **Period Selector** changes the historical timeframe. Data dynamic, connected to backend/API (not hardcoded). Non-working days use the latest available working-day rate.
### 5.2 Stocks
Dynamic stock cards for NVIDIA, Apple, Alphabet, Microsoft, Amazon showing: current price, price change, percentage change, previous close, historical/trend information. Dynamic, not hardcoded. The initial list must not limit future recommendation results to these five companies.
### 5.3 Financial News
**6** trustworthy, refreshable items as **cards**. Each card: **Source, Title, Short Summary, Date/Time, Category, Image, Read More**. Dynamic/refreshable.
### 5.4 News Detail
Clicking a card goes to a separate route, e.g. `/news/{article-id}`. Page contains: Back to News, Category, Source, Article Title, Published Date/Time, Hero Image, Article Summary/Content, **Read Full Article** (to the original source when applicable). Not a main navigation item.

## 6. Investment Recommendation (separate main section)
6.1 **Step-by-step flow** with a **dynamically filling progress bar** clearly communicating progress.
6.2 Investment amount in **AMD**; **USD equivalent shown live** as the AMD amount changes.
6.3 Each step has clear inputs and validation; required fields validated before proceeding; messages near the field, not disruptive.
6.4 Result includes a **Recommendation Score / Percentage** and clearly communicates the outcome of the user's preferences.
6.5 Portfolio recommendation shows: recommended asset/stock, **allocation percentage**, **allocated amount** (corresponding to the entered investment amount).
6.6 Result includes **Portfolio vs Benchmark** comparison with a **Timeframe Selector**.
6.7 Loading states handled **per item/section** (skeleton loaders + spinners); avoid a full-page blocking loader when sections can load independently.
6.8 Error / no-result: clear state with a **Retry** button.
6.9 **Adjust Preferences** after a result — always starts with a **clean form**; previous inputs not restored.
6.10 **Start Over** resets the flow to its initial state; nothing carried over. Same clean-state behaviour when the flow is completed again and a new recommendation is requested.

## 7. Recommendation History
After receiving a recommendation the user can use **Add** to save it / access history. History is a **separate page**, recommendations **grouped by date** (e.g. "September 21, 2026" → items; "September 18, 2026" → items). Users can review previously saved recommendations.

## 8. Settings / Profile
Show information collected at registration: First Name, Last Name, Email. Clear profile/settings experience consistent with the rest of the application.

## 9. Global Loading, Error and Empty States
Loading: skeleton loaders + spinners. Errors: clear message + Retry where applicable. Empty states: meaningful (not misleading zero data) — especially Personal Finance charts, recommendation results, market data, news data.

## 10. Responsive Design
Desktop: use horizontal space (dashboard cards, charts, market cards, news cards). Mobile: adapt without losing functionality; charts, cards, forms, navigation, recommendation steps remain usable.

## 11. Visual Design Direction
Fundja is a **visual reference only** — do not copy its branding, content or exact layout. Direction: dark, premium, modern, minimal, financial/product-oriented, generous spacing, large clear financial figures, light/clean typography, muted secondary text, subtle borders, rounded components, restrained accent usage.
Reference palette: `#020203` · `#4F5753` · `#C0C2C3` · `#91F60D` · `#2F587E`. Finova branding stays independent.

## 12. Frontend Architecture Principles
- Dynamic data, not hardcoded market/news values.
- Personal Finance and Investment Recommendation data completely independent.
- Preserve Personal Finance data by period.
- Clean recommendation flow on restart / adjust preferences.
- Loading, error, retry and empty states throughout.
- Consistent responsive behaviour across all screens.
- Reuse components without unnecessary coupling between unrelated features.
- Do not modify unrelated projects or files outside the Finova project.
- Preserve existing functionality unless a requirement explicitly changes it.
