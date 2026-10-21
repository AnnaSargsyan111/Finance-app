# Finova: ideas for what to add next

Prepared for Anna (product owner) by the Researcher. Date of research: 2026-10-21. Research only: no application code was changed, no accounts were created, no keys were used.

This document is written to be read without a technical background. Where a technical word is needed it is explained once.

---

## How to read the evidence labels

Every factual claim carries one of three marks.

| Mark | Meaning |
|---|---|
| **[V] Verified** | I opened the page, downloaded the file or called the data service myself on 2026-10-21 and saw it. |
| **[R] Reported** | I read it in a search summary or in a secondary article and did not open the original in full. Reasonable to design around, but re-check before quoting it to users. |
| **[I] My inference** | My own judgement or design opinion. Not a fact. |

Rule I followed: no statistic, price, law or app feature is stated without one of these marks. Where I could not find something, I say so (section 7 lists everything I could not verify).

---

## 1. Summary and top 5

### Summary (10 lines)

1. Finova already covers the basics well: a monthly budget view with explainable rules, official rates, six stock cards, news, a rules-based recommendation page and an AI assistant that teaches and plans.
2. What it does not yet do is turn understanding into a habit. It has no saved goals, no month-end moment, no reminders, and no Armenian-specific tools around deposits, the dram/dollar rate and the deposit guarantee.
3. The best research on financial education says general lessons barely change behaviour on their own (about 0.1% of the variation in behaviour, fading after roughly 20 months), while lessons delivered at the moment of a decision and tied to an action do help **[V]**. So most ideas below are small tools that sit where the decision happens, not a course.
4. Armenia has strong free official data that Finova does not use yet: the Central Bank of Armenia (CBA) policy rate and inflation, the monthly money-transfer (remittance) files, the Deposit Guarantee Fund limits, the Treasury Direct savings bonds, and the CBA registers of licensed firms **[V]**.
5. None of the official sources offers a clean programming interface (API). CBA publishes Excel files and web pages; the Armenian statistics office (Armstat) database returned an error on its standard API path **[V]**. So any "Armenia in numbers" feature needs a small monthly update routine, not live feeds.
6. The cheapest, most Armenian ideas need no new data: an exchange-spread meter (uses rates Finova already has), a deposit toolkit (after-tax interest, interest versus inflation, guarantee check) and income in other currencies.
7. Local banks are starting to offer budgeting inside their apps (Inecobank's Ineco app lists category limits and savings goals **[V]**), but they work on bank accounts. Finova's edge is being neutral, bank-independent, bilingual and explanatory.
8. Gamification evidence is mixed and the regulatory warning is real (Robinhood's confetti case **[R]**). Recommended: quiet progress markers, no streaks that punish, no rewards for trading.
9. Several tempting ideas are better left out: bank-account linking, "best deposit/best stock" rankings, AI forecasts, social investing chat. Section 5 explains why.
10. Suggested path: release 1 for trust and quick wins, release 2 for habit (goals, month story, reminders), release 3 for Armenian knowledge (numbers, options map, lessons).

### Top 5 recommendations

| # | Idea | Why it is in the top 5 |
|---|---|---|
| 1 | **Savings goals you can keep** (idea 2) | Turns the assistant's one-off plan into something the user comes back to. Evidence favours one clear main goal with a visible reminder **[V][R]**. Small data, medium effort, no advice involved. |
| 2 | **Deposit toolkit** (idea 5): interest after the 10% tax, interest versus inflation, deposit-guarantee check | The most Armenian "aha" per day of work. Uses verified official numbers (guarantee AMD 16 million / AMD 7 million, CBA inflation 4.3% for September 2026) **[V]**. Nothing is stored, no product is recommended. |
| 3 | **Month story plus a calm monthly check-in** (ideas 1 and 18) | Gives the app a rhythm: a short, kind summary at month end and one opt-in email on the first working day. Backed by the "fresh start" and reminder research **[R]**. Reuses the rules Finova already has. |
| 4 | **Where can money live? options map** (idea 9) | Answers the question the assistant must currently refuse ("where do I put my savings?") in a neutral, no-ranking way: what each kind of place is, what protects it, how it is taxed, who supervises it. Stays informational. |
| 5 | **Exchange-spread meter** (idea 6) | Smallest effort of all (days). Shows in plain words what a bank's buy/sell gap costs compared with the Central Bank rate. Fits dram/dollar habits. Uses data Finova already fetches. |

Close runners-up: income in other currencies (idea 4), "Report a wrong answer" (idea 22) and "Check before you trust" (idea 20).

---

## 2. What exists today (so nothing here repeats it)

From the earlier research files and the code I read **[V]**:

- Personal Finance: monthly or custom periods, income, default and custom expense categories, breakdown and cash-flow charts, and "Your money, explained" with fixed rules (thin month, housing share, category jump, too much in "Other", over-spending; at most 3 alerts, each with the rule shown and one suggestion plus a what-if).
- Market and News: CBA official rates with history, bank buy/sell for Ameriabank, ACBA, IDBank (read from Rate.am, no official API), six stock cards, six news items.
- Investment Recommendation: amount, risk, horizon; single stock or portfolio; drivers and metric explanations; back-test against a benchmark; saved history.
- AI Assistant: written answers (deposit guarantee, taxes, terms), savings-goal planner with a plan card (calculation done by code, not by the AI), web lookup limited to a few official pages, with confidence label and sources. Nothing is saved.
- Sign-up page "info" panels: the stock market in numbers, the psychology of spending, rules of thumb with sources.
- English default and Armenian, formal address, Noto Sans Armenian behind Manrope.

Architecture rule I protect throughout: **Personal Finance data is never an input to the Investment Recommendation.** Every idea below that touches personal numbers (month story, foreign-currency income, personal inflation, "Explain this") stays on the personal side only. Savings goals are designed as their own small module, not wired to Personal Finance or to recommendations.

---

## 3. The ideas (25)

Template for each idea: what the user sees, why it fits Armenia, evidence, data/tools/cost, size, risks and how to stay informational, how it connects to what exists, and priority.

Sizes: **S** = days, **M** = 1 to 2 weeks, **L** = more. "Cost" means running cost on top of what Finova already pays for (Vercel, Neon database, the email service); I have not re-checked those free-tier limits today **[U]**.

### A. Features

#### 1. Month story ("Your month, told in five cards")

- **What the user sees:** When a month closes (or on the first day of the next), a short, swipeable set of cards: "You kept 120,000 AMD of 850,000 AMD", "Your biggest category was Housing", "Compared with last month, Food & Dining was up 18%", "One thing to try next month" with a one-tap button to set a target. Can be skipped and closed at any time. Wording is the same plain voice as "Your money, explained".
- **Why it fits Armenia:** Finova already works in monthly periods and AMD. A story format helps people who do not like tables. **[I]**
- **Evidence:** Monzo's yearly "Year in Monzo" recap is private unless shared and respects the phone's reduced-motion setting **[R]** ([Monzo help](https://monzo.com/help/year-in-monzo-2024/year-in-monzo-faq)). People start goals after fresh-start dates such as a new month **[R]** ([Dai, Milkman, Riis 2014](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf)).
- **Data, tools, cost:** No new data. Built from the existing rules. Cost: none.
- **Size:** M. Depends on the Personal Finance rules engine and previous-period comparison (both exist).
- **Risks / staying informational:** Keep the existing wording "Available / Difference is not your bank balance". No comparison with other users. No judgement words ("bad month"). Not a financial recommendation: the "one thing to try" is a budgeting action, not a product.
- **Connects to:** Personal Finance, "Your money, explained", the monthly check-in (idea 18).
- **Priority: High.** Cheap, uses what is built, gives the app a rhythm.

#### 2. Savings goals you can keep

- **What the user sees:** A "Goals" page. One **main goal** is shown large (name, target in AMD or USD, date, progress bar, "you need 85,000 AMD a month"). Up to two more goals sit below, smaller. The user taps "+ add" when they put money aside; Finova does not see any bank. The assistant's plan card gets a "Save this goal" button.
- **Why it fits Armenia:** Big goals are typically a flat deposit, a car, university or a wedding; many are priced in USD, so a USD goal that shows its AMD value (CBA rate) matters. **[I]**
- **Evidence:** A single savings goal plus a visible reminder outperformed several goals in a small field experiment (about three times the control group's 3.5% of income) **[V]**, but the sample was 83 households in one town and not random, so treat it as a hint ([World Bank blog on Soman and Zhao](https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings)). Earmarking and a visual reminder raised saving in low-income consumers **[R]** ([Soman and Cheema, 2011](https://www.russellsage.org/sites/default/files/u137/jmr-C-s014-s021-online.pdf)). Inecobank's Ineco app lists savings goal tracking **[V]** ([App Store](https://apps.apple.com/app/id6477373305)). Commitment-style saving products were tested with a bank in the Philippines **[R]** ([Ashraf, Karlan, Yin](https://microfinancegateway.org/paper/2005/09/tying-odysseus-mast-evidence-commitment-savings-product-philippines)).
- **Data, tools, cost:** Stored per user: goal name, target amount and currency, date, list of "added" amounts. Justified because progress is the whole point; no bank link, no card data. Database rows only. Cost: effectively none.
- **Size:** M. Depends on the existing goal calculator (`goal-plan.ts`), sign-in and database.
- **Risks / staying informational:** Never say where to keep the money. Show the assumptions line the planner already uses (interest rate typed by the user, no inflation). A goal in USD must show which CBA rate and date were used.
- **Connects to:** AI assistant planner, what-if panel (idea 12), milestones (idea 19), check-in (idea 18).
- **Priority: High.** The biggest gap between "I understand" and "I do".

#### 3. Big irregular expenses planner

- **What the user sees:** A list of costs that are not monthly: insurance renewal, holiday, school or university fees, gifts, repairs. Each has an amount and a month. Finova shows "set aside about 31,000 AMD a month for these" and a 12-month bar chart where the heavy months stand out.
- **Why it fits Armenia:** Seasons (New Year, school start, winter heating) make some months heavy for many households. **[I]** The planner is fully user-defined, so it makes no assumption about any household.
- **Evidence:** YNAB's second principle is "For Later": split irregular costs into monthly amounts **[V]** ([YNAB](https://www.ynab.com/the-four-rules)). A reminder study found that people under-save partly because they overlook big, infrequent expenses, and reminders about a specific expense helped **[R]** ([Karlan, McConnell, Mullainathan, Zinman](https://img.nber.org/papers/w16205)).
- **Data, tools, cost:** User entries (label, amount, month). Cost: none.
- **Size:** M. Shares components with goals.
- **Risks / staying informational:** Low. Plain arithmetic.
- **Connects to:** Goals (same page, second tab), Personal Finance categories (as ideas only, not wired in), check-in reminders.
- **Priority: Medium.** Do after goals; it reuses the same building blocks.

#### 4. Income and expenses in other currencies

- **What the user sees:** In Personal Finance, next to an amount, a small currency switch (AMD, USD, EUR, RUB, the four rates Finova already tracks). Typing "1,200 USD" shows "about 460,000 AMD at the Central Bank rate of 14 Oct" (invented example) and the period total uses the AMD figure. The user can change the date used.
- **Why it fits Armenia:** Many people are paid or supported in foreign currency (IT sector, family abroad). World Bank data show personal remittances received were **5.38% of GDP in 2025** and 11.22% in 2021 **[V]** ([World Bank API](https://api.worldbank.org/v2/country/ARM/indicator/BX.TRF.PWKR.DT.GD.ZS?format=json)). Press figures for Russia-only transfers look larger because they measure something different (gross transfers), so any remittance figure shown in the app must name its measure **[R]**.
- **Data, tools, cost:** CBA history already in Finova **[V]**. Stored: original amount and currency, the AMD value and the rate used. Cost: none.
- **Size:** M (data model change: today amounts are AMD only).
- **Risks / staying informational:** Which date's rate is used must always be visible. No tax calculation. Rounding rules must be written down.
- **Connects to:** Personal Finance, FX history, Goals in USD.
- **Priority: High.** Removes a daily annoyance for exactly the users Finova targets.

#### 5. Deposit toolkit

- **What the user sees:** One page, three small tools. (a) **What will I really get?** Amount, rate the bank offered, months: shows interest, minus the 10% income tax on deposit interest, and the final sum. (b) **Is it beating prices?** The same rate after tax compared with the latest annual inflation from the CBA (4.3% for September 2026 **[V]** on the [CBA home page](https://www.cba.am/en/)), in plain words with a reminder that inflation changes. (c) **Is my money covered?** Enter deposits per bank; Finova shows what falls inside the guarantee (AMD 16 million for dram deposits, AMD 7 million for foreign-currency deposits, separately at each bank **[V]**, [Deposit Guarantee Fund FAQ](https://adgf.am/en/faq)). Nothing is stored.
- **Why it fits Armenia:** Deposits are the main savings tool and the dram/dollar rate gap is central. The guarantee limits are low enough that many savers can exceed them.
- **Evidence:** Guarantee limits and rules re-checked today **[V]**. The 10% deposit-interest tax comes from the Tax Code and the State Revenue Committee guide as cited in the earlier assistant research **[R]** (the earlier note itself asks to re-check the current consolidated text). Armstat offers an inflation calculator on its home page, so interest in this question exists **[V]** ([Armstat](https://armstat.am/en/)).
- **Data, tools, cost:** Numbers kept in one small settings file with an "as of" date: guarantee limits, tax rate. Inflation from the CBA page (small monthly update, see idea 8). Cost: none.
- **Size:** M. Depends on a monthly update routine for inflation.
- **Risks / staying informational:** The guarantee FAQ says dram deposits are counted first, then foreign currency, principal before interest, and overdue loans are deducted **[V]**; it does not state in one line how the two limits combine at one bank. The tool must therefore show the two limits as the Fund states them, not invent a combined formula, and link the FAQ. The bank's rate is typed by the user, so no bank is recommended or ranked. Show a visible "rules as of date".
- **Connects to:** Assistant (same facts, same wording), FX section, Goals (interest rate input).
- **Priority: High.** Most Armenian value for the least data.

#### 6. Exchange-spread meter

- **What the user sees:** Under the bank buy/sell rates, one plain sentence per bank: "Selling 1,000 USD and buying it back at this bank costs about 4,000 AMD (about 1%)" and "This bank's selling price is 1.4 AMD above the Central Bank rate." (All numbers in this sentence are invented examples, not current rates.) A small bar shows the gap. Cash and non-cash shown separately.
- **Why it fits Armenia:** Dram/dollar exchange is a weekly habit, and the gap between buy and sell is the cost nobody sees. **[I]**
- **Evidence:** The data are already in Finova **[V]**. A law-firm guide quotes typical retail USD/AMD spreads of about 1.0 to 1.3% **[R]**; I would not print that figure as a fact. Compare with the CBA reference rate that Finova already shows **[V]**.
- **Data, tools, cost:** Existing data. Cost: none.
- **Size:** S.
- **Risks / staying informational:** Rate.am has no public API and Finova reads its page layout; its `robots.txt` returns 404 and I did not read its terms of use **[V]/[U]**. Ask Rate.am for permission in writing before leaning more on it. Keep banks in a fixed order, no "best bank" label, and say the rates are indicative.
- **Connects to:** Market page, bank rates, assistant ("what is the buy/sell rate").
- **Priority: High.** Days of work, high clarity.

#### 7. Rate look-back and a user-set rate alert

- **What the user sees:** "What if I had exchanged 1,000 USD on 3 March 2025?" (past only, using CBA history). Plus: "Email me when USD/AMD reaches 395", a number the user chooses. Maximum three alerts.
- **Why it fits Armenia:** People watch the dollar and decide when to change money. **[I]**
- **Evidence:** CBA publishes rates with an archive and retrieval page **[V]** ([CBA](https://www.cba.am/en/exchange-rates-retrieval/)). The earlier research notes that Finova's host runs scheduled jobs once a day, which matches a daily CBA rate **[R]** (financial-market-research.md).
- **Data, tools, cost:** Existing rates and the existing email service. Stored: threshold, currency, direction, and the email already held. Cost: very low.
- **Size:** M.
- **Risks / staying informational:** An alert can feel like a signal. Wording: "You asked us to tell you when..." with no suggested thresholds and no "good time to exchange". State that the CBA rate is a reference and the bank will quote differently. Alert email must contain only the rate.
- **Connects to:** FX history chart, spread meter.
- **Priority: Medium.** Useful but not essential.

### B. New sections

#### 8. Armenia in numbers

- **What the user sees:** A page (or tab on Market) with six tiles: CBA policy rate (6.75%), annual inflation (4.3%, September 2026), dram per dollar, remittances as a share of GDP, deposit guarantee limits, latest government bond auction yield. Each tile has one sentence of "what this means for you", a date, and a source link. No forecasts.
- **Why it fits Armenia:** Finova's market page is mostly US stocks; this is the local economy that decides a household's money.
- **Evidence:** Policy rate 6.75% and annual inflation 4.3% (September 2026) are on the CBA home page today **[V]**. CBA publishes the money-transfer files by country, monthly and annual, in USD and AMD (I downloaded the file, about 1 MB; sheets: monthly in USD, annual in USD, monthly in AMD, annual in AMD) **[V]** ([file](https://old.cba.am/stat/stat_data_eng/5_Money_transfers_of_individuals_by_countries-eng.xlsx)). The CBA statistics pages offer Excel/Word files only, no CSV or JSON, and no interest-rate file on the external-sector page **[V]** ([CBA external sector](http://old.cba.am/en/SitePages/statexternalsector.aspx)). Armstat's statistics database (PxWeb) loads for people, but its API path returned an error **[V]** ([ArmStatBank](https://statbank.armstat.am/pxweb/en/ArmStatBank/)). World Bank API works and returns JSON **[V]**.
- **Data, tools, cost:** Mix: World Bank API (free, live); CBA home page values and Excel files updated once a month by a small checked routine or by hand with a visible date; Armstat figures by monthly download. Cost: low, but real maintenance time.
- **Size:** M. Depends on a monthly update routine and a rule "never show a number without its date; hide it if older than X".
- **Risks / staying informational:** Page layout of cba.am can change, so validate every value and show "not available" rather than a guess. "What this means" lines must be descriptive ("prices rose 4.3% over twelve months"), not predictive.
- **Connects to:** Deposit toolkit, assistant, bond page (idea 11).
- **Priority: High.** Unique to Armenia; but build after the quick wins because it needs the update routine.

#### 9. Where can money live? (options map)

- **What the user sees:** A neutral side-by-side table of places people in Armenia can keep money: cash at home, current account, term deposit (dram or foreign currency), Treasury Direct savings bonds, government bonds via dealers or banks, foreign shares through a licensed broker. Rows: protected by the deposit guarantee? how the income is taxed (only where verified, otherwise "check the State Revenue Committee"), how you get access, who supervises it, how fast you can get the money, what can go wrong. A short "I need the money within a year" filter changes which rows are highlighted, never which are "recommended".
- **Why it fits Armenia:** Retail stock-market access is thin; Treasury Direct and deposits matter more. The assistant currently has to refuse "where should I keep my savings?" and this gives a structured answer without advice.
- **Evidence:** Treasury Direct (Ministry of Finance) states it sells government securities directly to resident and non-resident individuals, that bond income is not taxed, and that bonds are sold without commissions; it cites Government decision N 381 of 13.04.2017 **[V]** ([Treasury Direct about page](https://www.gp.minfin.am/en/about-us)). On the day I looked, the sale table on its home page said no bonds for sale were found, so availability varies **[V]**. Deposit guarantee **[V]**. CBA registers of licensed banks, credit organisations, insurance, investment companies, fund managers, crypto-asset service providers and payment organisations exist **[V]** ([CBA register](https://www.cba.am/en/licensed-investment-companies/)). A 2013 survey summary says about 66% of citizens had savings but only 6% of them kept money in banks; that is old **[R]** ([ARKA](https://arka.am/en/news/business/survey_more_than_65_of_armenia_s_citizens_have_savings_but_only_6_of_them_keep_their_money_in_banks/)).
- **Data, tools, cost:** Written and reviewed content, re-checked every quarter. Cost: writing time.
- **Size:** M.
- **Risks / staying informational:** Highest sensitivity in the document. Describe categories, never products, banks or funds; no ranking; no "suits you". A short legal read is advisable because the earlier research found that investment services in Armenia are generally for licensed firms **[R]** (CBA clarification of 2022, cited in ai-assistant-plan.md).
- **Connects to:** Assistant (answers can point here), Investment page (stays the only place that suggests stocks), deposit toolkit.
- **Priority: High.** Answers a daily question and strengthens neutrality.

#### 10. Money check-up (four dials)

- **What the user sees:** Eight to ten short questions (3 minutes) about four areas: Spend, Save, Borrow, Plan. Result: four dials with one sentence each and two suggested lessons. No single total score. Nothing is stored unless the user chooses "remind me to repeat this in six months", which stores four small numbers.
- **Why it fits Armenia:** The CBA measures financial capability for the whole population every few years (baseline 2014, second round 2019) **[V]** ([FinDev Gateway](https://www.findevgateway.org/paper/2020/03/study-financial-capability-population-armenia-2019)), but I found no personal self-check in Armenian.
- **Evidence:** The Financial Health Network score uses eight questions under Spend, Save, Borrow, Plan **[R]** ([FHN](https://finhealthnetwork.org/score/)). The CFPB has a 10-question well-being scale with scoring guidance, and states it is not a diagnostic **[R]** ([CFPB](https://www.consumerfinance.gov/data-research/research-reports/financial-well-being-scale/)). I could not confirm the licence terms of either questionnaire, so write original questions.
- **Data, tools, cost:** Content only. Cost: none.
- **Size:** M.
- **Risks / staying informational:** Money stress is real; every question skippable; never look like a credit score (that is why no composite number). Not a diagnosis. Armenian wording must be reviewed.
- **Connects to:** Learn path (idea 17) and goals.
- **Priority: Medium.**

#### 11. Government bonds in plain words (later)

- **What the user sees:** A page explaining what a government bond is, how the Armenian auction works, the latest auctions' yields shown next to the policy rate and inflation, with a link to the CBA's yield-curve page. Descriptive only.
- **Why it fits Armenia:** Government bonds and Treasury Direct are the nearest thing to a "safe" instrument most people can actually buy locally. **[I]**
- **Evidence:** CBA has "Yield Curves of GB" and "GB Indexes" pages **[V]** (the pages load; I did not read the data) ([CBA yield curves](https://www.cba.am/en/yield-curves-of-gb/)). The Minister of Finance said the first 10-year auction of 2026 placed at 8.09%, against 9.6% in 2024 **[R]** ([Armenpress](https://armenpress.am/en/article/1240182/amp)). Treasury Direct publishes AMX-sourced bond market tables **[V]**.
- **Data, tools, cost:** Unknown. The AMX site returned only a small page shell for me, so I could not confirm a downloadable feed **[U]**. Cost: unknown.
- **Size:** L (mostly because data access is unproven).
- **Risks / staying informational:** Yields shown with no "invest here" wording. A history chart is fine; a "projected return" is not.
- **Connects to:** Armenia in numbers, options map.
- **Priority: Later.** First prove the data can be fetched reliably.

### C. Design and experience

#### 12. What-if panel (one shared component)

- **What the user sees:** A "Try changing it" panel with steppers or sliders: "cut Shopping by 10%", "save 20,000 AMD more", "extend by 6 months", "rate 8% to 10%". The result updates at once, shows old versus new, and states the assumptions. Nothing is saved unless the user taps "Keep this".
- **Why it fits Armenia:** Not specific; it makes every number feel adjustable.
- **Evidence:** Wealthfront's free planning tool shows trade-offs between goals **[R]** ([Wealthfront](https://www.wealthfront.com/what-we-do)); Monarch's higher plan advertises "what-if" forecasting **[R]** ([Sacra summary](https://sacra.com/c/monarch-money/)). Financial education works best close to the decision and tied to an action **[V]** ([Fernandes et al.](https://repub.eur.nl/pub/76416)).
- **Data, tools, cost:** None. Cost: none.
- **Size:** M (built once, reused by goals, deposits, Personal Finance).
- **Risks / staying informational:** A slider can look like a promise; always show the assumption line the planner already uses.
- **Connects to:** Existing what-if text in Personal Finance, goals, deposit toolkit.
- **Priority: High.** Shared building block; do it with goals.

#### 13. Fast mobile entry and "add to home screen"

- **What the user sees:** Entering amounts feels like a calculator: big number pad, thousands separators as you type, quick chips (+5,000, +10,000), a "same as last month" button per category that fills the form (the user still presses Save), actions within thumb reach. The site can be installed as a home-screen icon and opens full-screen.
- **Why it fits Armenia:** Digital 2026 reports about 2.36 million internet users (80%) and 4.08 million mobile connections (138% of population) **[R]** ([DataReportal](https://datareportal.com/reports/digital-2026-armenia)); I could not find how many use phones for money apps, so measure Finova's own device split first **[I]**.
- **Evidence:** WCAG 2.2 sets a minimum touch target of 24 by 24 CSS pixels (Level AA) **[R]** ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html)).
- **Data, tools, cost:** A web app manifest and icons. No offline storage of money data (privacy). Cost: none.
- **Size:** S to M.
- **Risks / staying informational:** None. Keep the rule that the database, not the browser, is the source of saved data.
- **Connects to:** Personal Finance entry, goals.
- **Priority: High.**

#### 14. First-win onboarding

- **What the user sees:** After sign-up, one question per screen, all skippable: "What would you like help with first?" (see my month / understand the dollar rate / save for a goal / learn the basics). The choice opens that tool, optionally with clearly labelled **example numbers** the user can try without saving anything. No personal data asked.
- **Why it fits Armenia:** Not specific; sign-up already carries education panels, so the next step should be doing.
- **Evidence:** Showing a few things first and revealing the rest as needed is the "progressive disclosure" principle, credited to Jakob Nielsen (1995) **[R]**; I did not retrieve NN/g's own article ([summary](https://uxcel.com/glossary/progressive-disclosure)). Fresh-start moments (a new account is one) raise goal-setting **[R]**.
- **Data, tools, cost:** Choice kept in the page only. Cost: none.
- **Size:** S to M.
- **Risks / staying informational:** Example numbers must be unmistakably examples and never written to the user's data.
- **Connects to:** Personal Finance, goals, assistant.
- **Priority: Medium.** Add basic analytics first so you can tell whether it helps.

#### 15. Charts you can read (accessibility plus Armenian reading)

- **What the user sees:** Every chart has a "View as table" switch and one sentence above it that says the main point. Colours are never the only signal (labels or patterns too). Armenian text is checked on a 360 px-wide phone, in bold and regular, including the dram sign.
- **Why it fits Armenia:** The app is bilingual and Armenian strings and words run long.
- **Evidence:** WCAG 2.2 **[R]**. Noto Sans Armenian is free under the SIL Open Font License **[R]** ([Google Fonts](https://fonts.google.com/noto/specimen/Noto+Sans+Armenian/about)). I found no independent Armenian-specific legibility guidance and will not claim any. The existing i18n plan already puts Noto Sans Armenian behind Manrope **[V]**.
- **Data, tools, cost:** None. Cost: none.
- **Size:** S to M.
- **Risks / staying informational:** None.
- **Connects to:** All charts, the Armenian translation review sheet.
- **Priority: Medium.**

#### 16. Hide amounts

- **What the user sees:** An eye icon that blurs every figure until tapped; remembered on that device.
- **Why it fits Armenia:** Phones are used on public transport and at home with family. **[I]** (I did not verify how common this feature is in banking apps.)
- **Evidence:** Own judgement **[I]**.
- **Data, tools, cost:** Device setting only. Cost: none.
- **Size:** S.
- **Risks / staying informational:** None. Must also hide screen-reader text if blurred.
- **Connects to:** Personal Finance, goals.
- **Priority: Medium.** Small and kind.

### D. Education and engagement

#### 17. Learn path (ten two-minute lessons, each ending in an action)

- **What the user sees:** A short ordered list: "What your month looks like", "Dram, dollar and the rate", "What a deposit really pays", "What is covered if a bank fails", "Inflation in one example", "What you buy when you buy a share", "Risk and time", "Funds versus single stocks", "Spotting too-good-to-be-true", "Your first goal". Each lesson has a source and a date, and ends with a button that opens the matching tool.
- **Why it fits Armenia:** The CBA runs its own national financial-education programme and portals (ABCfinance, Fininfo) and says it is shifting "from awareness to behaviour" **[V]** ([Regional Post](https://regionalpost.org/en/articles/from-awareness-to-behavior.html)). Finova should link to those rather than copy them, and add the tools next to the lessons.
- **Evidence:** A meta-analysis of 76 randomised experiments with over 160,000 people found financial education has positive effects on knowledge and behaviour **[V]** ([NBER 27057](https://www.nber.org/papers/w27057)). An older meta-analysis of 168 papers found literacy interventions explain about 0.1% of behaviour, fade, and work best "just in time" **[V]** ([Fernandes et al.](https://repub.eur.nl/pub/76416)). Simple rules of thumb beat a standard accounting course in a Dominican Republic trial **[R]** ([Drexler, Fischer, Schoar](https://researchonline.lse.ac.uk/id/eprint/33502)). Stash puts tap-to-explain icons beside terms in the app **[R]** ([InvestmentNews](https://investmentnews.com/fintech/fintech-apps-that-strive-for-good/205112)).
- **Data, tools, cost:** Content only; Armenian reviewed by Anna. Cost: writing time.
- **Size:** M for the first five lessons, L for ten.
- **Risks / staying informational:** Every fact needs a source and date. Lessons describe; they do not tell anyone what to buy.
- **Connects to:** Assistant, info panels on the sign-up page, tools.
- **Priority: Medium.** The research says lessons alone do little, so ship them after the tools they point to.

#### 18. Calm monthly check-in (opt-in)

- **What the user sees:** An optional email (or banner) once a month on the first working day: "New month. Two minutes to look at last month and set one number." One button. A second optional reminder for upcoming big expenses. One-click unsubscribe. The email contains no amounts.
- **Why it fits Armenia:** Not specific; salary and bills are monthly. **[I]**
- **Evidence:** Reminders raised saving, especially when they pointed to a specific goal or expense **[R]** ([Karlan et al. abstract](https://repec.cepr.org/repec/cpr/ceprdp/DP7907.pdf)); fresh-start dates matter **[R]**.
- **Data, tools, cost:** Stored: opt-in flag and language. Email service already exists (used for password reset, per the earlier research **[R]**). Cost: free-tier limit not re-checked **[U]**.
- **Size:** S to M.
- **Risks / staying informational:** Armenia's personal-data law needs a lawful basis, usually consent **[R]** (financial-market-research.md section 2.4, owner deferred consent for the educational prototype); an explicit opt-in is the safe way. Maximum one a month by default.
- **Connects to:** Month story, goals, big expenses.
- **Priority: High.**

#### 19. Quiet milestones (progress, not points)

- **What the user sees:** A small timeline of markers: "First month recorded", "Three months in a row", "Goal 25%, 50%, 100%", "Read the guarantee lesson". They stay once earned. No points, no leaderboards, no streak that resets, no confetti.
- **Why it fits Armenia:** Not specific. Finova's tone is calm; this keeps it so.
- **Evidence:** Gamification reviews are mixed: a 2026 review of 17 studies reports that cash rewards help short-term transactions while progress visualisation and real-time feedback support steady money management **[R]** ([PACIS 2025 review](https://aisel.aisnet.org/pacis2025/general_topic/general_topic/20/) covers 45 studies and notes unclear findings); a Bayes Business School study found badges, leaderboards and progress bars helped people meet a saving goal **[R]** ([Bayes](https://www.bayes.citystgeorges.ac.uk/news-and-events/news/2022/january/turning-long-term-savings-goals-into-a-game-can-increase-consumer-financial-well-being)). Massachusetts regulators fined Robinhood $7.5 million in January 2024 over "gamification" (confetti, scratch tickets); Robinhood disputed that its app was gamified **[R]** ([Vinson and Elkins](https://velaw.com/insights/game-over-robinhood-pays-7-5-million-to-resolve-gamification-securities-violations)). Zogo's figures are self-reported and I found no independent evaluation **[R]**.
- **Data, tools, cost:** A few flags per user. Cost: none.
- **Size:** S to M.
- **Risks / staying informational:** Never tie milestones to trading or to risk-taking. Never take them away.
- **Connects to:** Goals, Learn path, Personal Finance.
- **Priority: Medium.**

#### 20. Check before you trust

- **What the user sees:** A small tool: choose the type of company (bank, insurance, investment company, fund manager, crypto-asset provider, payment organisation); Finova opens the matching CBA register. Under it, a six-question "too good to be true?" checklist (guaranteed returns, pressure to act today, asks for card codes, not in the register...).
- **Why it fits Armenia:** The CBA has issued public warnings about unlicensed firms, including one in 2022 about people using a forged licence and the name of a large company, and reported that people still gave their personal data afterwards **[R]** ([CBA warning, PDF](https://www.cba.am/EN/pmessagesannouncements/Gazprom%20warning%2006.06.2022_eng.pdf)).
- **Evidence:** The CBA register pages exist and are separated by firm type **[V]** (links above). I did not find a 2025 to 2026 warning, so no fresh scam statistics are claimed.
- **Data, tools, cost:** Links only; do not copy the registers (they change). Cost: none.
- **Size:** S.
- **Risks / staying informational:** "Not found in the register" is not proof of fraud; say so. Never name a firm as a scam.
- **Connects to:** Assistant (which already reads the CBA licensed-banks page), Learn lesson 9.
- **Priority: High.** Small, protective, very local.

### E. Data and AI

#### 21. "Explain this" (opt-in AI)

- **What the user sees:** A small button on a chart or result: "Explain in simpler words". It produces a three-line explanation using only the numbers on that screen and Finova's reviewed notes, marked "written by AI". If a number in the AI's text does not match the screen, the app shows the fixed rule text instead.
- **Why it fits Armenia:** Armenian explanations of numbers are in short supply; the assistant already answers in Armenian. The earlier plan lists an opt-in "explain my result" as a later step **[V]** (ai-assistant-plan.md decision 2).
- **Evidence:** Chatbots can give inaccurate financial information and miss consumer rights **[R]** ([CFPB, June 2023, archived](https://www.consumerfinance.gov/about-us/newsroom/cfpb-issue-spotlight-analyzes-artificial-intelligence-chatbots-in-banking)). ESMA (EU) expects firms to tell clients they are dealing with AI and to keep human oversight **[R]** ([ESMA, 30 May 2024](https://www.esma.europa.eu/sites/default/files/2024-05/ESMA35-335435667-5924__Public_Statement_on_AI_and_investment_services.pdf)); it is not binding in Armenia, but it is a sensible benchmark. NIST's generative-AI profile names "confabulation" (invented content) as one of twelve risks **[R]** ([NIST AI 600-1](https://airc.nist.gov/docs/NIST.AI.600-1.GenAI-Profile.ipd.pdf)). Finova's own test found that plausible extra detail was the main risk and only a human read caught it **[V]** (ai-assistant-plan.md).
- **Data, tools, cost:** The same model service as the assistant. Per-use model cost; the free tier of one provider may use inputs to improve its products, so real user data needs a paid or data-safe setup **[V]** (ai-assistant-plan.md section 3.1). Cost: a few dollars to start, depending on use; check the provider page.
- **Size:** M.
- **Risks / staying informational:** On Personal Finance screens the numbers go to a model only after a click, and never reach the Investment page (architecture rule). No product advice. Rate-limit it.
- **Connects to:** Assistant, Personal Finance rules, Investment metric explanations.
- **Priority: Medium.** Good, but the rule-based "why" text already does most of the job.

#### 22. "Report a wrong answer" and "last checked" stamps

- **What the user sees:** A thumbs-down on each assistant answer with three choices: "wrong fact", "unclear", "Armenian wording". Every sensitive fact block shows "Checked on 21 October 2026 against adgf.am".
- **Why it fits Armenia:** Armenian answers from the first free model tested were weaker than English **[V]** (ai-assistant-plan.md; the Gemini test was better), and tax and guarantee rules change.
- **Evidence:** The AI plan's test reports show the main risk (plausible extra detail) was only caught by human reading **[V]**. A research note on finance question sets says citations should be tested, not only answers **[R]** (ai-assistant-plan.md section 2).
- **Data, tools, cost:** Stored: answer ID and category only, not the question text. Cost: none.
- **Size:** S.
- **Risks / staying informational:** None; privacy-safe by design.
- **Connects to:** Assistant, the 35-question test set (add every reported case as a new test).
- **Priority: High.** Cheap, protects trust.

#### 23. Personal inflation (later)

- **What the user sees:** "Your prices vs the headline": using the user's own expense mix and the official monthly price change by category, Finova shows what inflation looks like for their spending, next to the headline figure.
- **Why it fits Armenia:** Dram prices of food and utilities move differently from the headline.
- **Evidence:** ArmStatBank lists monthly consumer-price tables by category, based on a search summary **[R]**; its standard API path returned an error **[V]**. Mapping Finova's seven categories to the official categories is a judgement **[I]**.
- **Data, tools, cost:** Monthly download of a table; manual or small routine. Cost: low, maintenance high.
- **Size:** L.
- **Risks / staying informational:** Category mapping errors and noisy one-month weights; must show the method. It uses Personal Finance data, so keep it on the personal side only.
- **Connects to:** Armenia in numbers, deposit toolkit.
- **Priority: Later.**

#### 24. Pay and tax helper (later, sourcing problem first)

- **What the user sees:** "From gross to net" for employees, and a plain explainer of the regimes for sole entrepreneurs and IT work.
- **Why it fits Armenia:** Very high demand: IT sector, sole entrepreneurs, freelancers. **[I]**
- **Evidence and the problem I found:** The page code of abcfinance.am, a portal that a CBA-published article names as the CBA's financial-education site **[V/R]**, contains a salary calculation using 21% income tax and a 4.5% pension share below AMD 500,000, with other constants **[V]**. 2026 payroll guides say 20% flat income tax and a 5% funded pension contribution (and disagree with each other on details such as the base and a possible health deduction) **[R]** ([guide](https://armenian-lawyer.com/business-immigration/payroll-tax-rates-and-social-security-contributions-in-armenia/)). I cannot tell which is current or whether that calculator is live. Separately, a May 2026 announcement to raise the micro-business threshold from AMD 24 million to 50 million is reported, not confirmed as law **[R]** ([ARKA](https://arka.am/en/news/economy/armenia-plans-to-raise-the-threshold-for-micro-businesses-/)), and the IT-sector 1% rate has conflicting dates across sources **[R]**.
- **Data, tools, cost:** A single settings file with the law article, "as of" date and a January review. Cost: review time.
- **Size:** M for gross-to-net, L for regimes.
- **Risks / staying informational:** Wrong tax figures harm people. Explanation only, never "choose this regime". Needs the State Revenue Committee text or an accountant's confirmation before launch.
- **Connects to:** Foreign-currency income, assistant tax answers.
- **Priority: Later.** Valuable, but build only after one primary source is confirmed.

#### 25. "In the news today" on stock cards (later)

- **What the user sees:** On each stock card, up to three headlines from the news Finova already reads that mention that company in the last day, with source and time. No sentence that claims a cause.
- **Why it fits Armenia:** Not specific; helps newcomers connect price moves and headlines.
- **Evidence:** Public.com offers a "Why It's Moving" explainer **[R]** ([InvestmentNews](https://investmentnews.com/fintech/fintech-apps-that-strive-for-good/205112)). Finova would deliberately not claim "why".
- **Data, tools, cost:** Existing RSS. The earlier research allows title, source, time and link only **[V]**. Cost: none.
- **Size:** M.
- **Risks / staying informational:** Matching names can mis-tag. Avoid causal wording.
- **Connects to:** Stock cards, news.
- **Priority: Later.**

### Priority summary

| Priority | Ideas |
|---|---|
| High | 1 Month story, 2 Goals, 4 Other currencies, 5 Deposit toolkit, 6 Spread meter, 8 Armenia in numbers, 9 Options map, 12 What-if panel, 13 Fast mobile entry, 18 Monthly check-in, 20 Check before you trust, 22 Report a wrong answer |
| Medium | 3 Big expenses, 7 Look-back and alert, 10 Money check-up, 14 First-win onboarding, 15 Charts you can read, 16 Hide amounts, 17 Learn path, 19 Quiet milestones, 21 Explain this |
| Later | 11 Bond page, 23 Personal inflation, 24 Pay and tax helper, 25 News on stock cards |

---

## 4. Alternative directions (bigger bets)

Each is a different product shape. They are not mutually exclusive, but one should lead.

### Direction 1: Home money and remittance helper

A focus on households whose income arrives in foreign currency or from abroad.

- **What it would be:** Foreign-currency income tracking (idea 4), spread meter (idea 6), rate look-back and alerts (idea 7), planning for irregular inflows ("a good month funds two weak ones"), plus a plain explainer of how transfer costs work.
- **Pros:** Most specific to Armenia. Builds directly on rates Finova already has. Strong word of mouth in families. Remittances were 5.38% of GDP in 2025 **[V]**, and 11.22% in 2021 **[V]**, so the audience is real.
- **Cons:** The transfer-operator landscape moves with sanctions: in 2023 eight of 18 Armenian banks announced they were ending Unistream operations **[R]** ([Interfax](https://www.interfax.com/newsroom/top-stories/93200/)). The World Bank's cost-comparison database for the Russia to Armenia corridor shows data from 2021, and later Russia-origin data are limited to public online sources **[R]** ([World Bank RPW](https://remittanceprices.worldbank.org/corridor/RU/AM)), so a "cheapest way to send" comparison cannot be kept honest. Comparing providers could also be seen as a regulated comparison or referral service **[U]**: avoid.
- **My view:** The best of the three as an extension, if limited to "understand and track", not "compare providers".

### Direction 2: Family and teen money companion (non-banking)

A shared space for a family to talk about money without a card or an account.

- **What it would be:** Family goals, a pocket-money planner the parent fills in by hand, short teen-friendly lessons (the Learn path), a family version of the month story.
- **Pros:** Strong education value. The CBA already targets schoolchildren and families in its programme (it reports reaching over 425,000 students a year, self-reported) **[R]** ([Regional Post](https://regionalpost.org/en/articles/high-financial-capability-in-everyday-behavior-the-central-banks-vision.html)). Ameriabank's MyAmeria Star app for ages 6 to 18 shows a bank sees the market **[V]** ([App Store](https://apps.apple.com/mx/app/myameria-star/id6495064858)).
- **Cons:** MyAmeria Star has a real card and parental oversight of transactions **[V]**, which Finova cannot and should not copy. Children's data needs parental consent and a legal view **[U]**. Different design and tone. Slower to prove value.
- **My view:** Interesting as a content partnership later (schools, the CBA programme), not as the next product.

### Direction 3: Goals circles (shared savings goals among friends and family)

- **What it would be:** Small invitation-only groups share progress on goals as percentages only (no amounts): "Lilit is 60% towards her course". Gentle cheers, no chat about investments.
- **Pros:** Social accountability, low cost, no money handling. Public.com leans on social learning **[R]**, and commitment platforms show people set goals publicly (the fresh-start study used stickK data **[R]**).
- **Cons:** Needs invitations, moderation and strong privacy rules. Groups tend to drift into tips and recommendations, which is the regulatory edge we avoid. Armenian cultural fit is untested **[U]**. Harder to measure value.
- **My view:** Prototype only as "share my goal progress as an image or link", and only after goals (idea 2) prove people come back.

---

## 5. Do not do (or not now)

| Idea | Why not |
|---|---|
| Linking bank accounts or reading bank apps | No open-banking in Armenia we can rely on; credential handling and liability; it also breaks the "no transactions table, no bank link" principles. Note: banks themselves can do this (Ineco shows spend by category **[V]**); Finova's value is being independent. |
| Uploading bank statements for automatic categories (now) | 17 bank formats, third parties' names in statements, and Finova's spec forbids a transactions table. If ever considered, parse in the browser and keep nothing; revisit later. |
| "Best deposit", "best bank", "best stock for you" rankings or lead-gen for loans | Looks like personal investment or product advice, creates conflicts of interest, and the earlier research found Armenian investment services are generally for licensed firms **[R]**. |
| AI or model forecasts of exchange rates or stocks | Out of scope, misleading, and no verified method. |
| Roast or shame tones (Cleo-style) | Cleo's roast mode is popular with many of its users **[R]** ([Sifted](https://sifted.eu/articles/want-to-make-your-ai-chatbot-funny-hiring-comedians-is-a-start)), but money stress is real and Finova's promise is calm and trustworthy. A "plain / encouraging" tone choice is safe; roasting is not. |
| Streaks that punish, confetti, scratch cards, rewards for trading | Regulatory and ethical risk (Robinhood case **[R]**), and the evidence on savings is thin. Trading is out of scope anyway. |
| Leaderboards or "people like you" comparisons | Needs pooled personal data; small population; comparison can hurt. |
| Photo "future self" avatars | Evidence exists for age-progressed images **[R]** but needs a face photo; privacy cost far above the benefit. |
| Community chat about stocks or crypto | Pump-and-dump and unlicensed-advice risk; costly moderation. The CBA also keeps a separate register for crypto-asset service providers **[V]**, a regulated area I have not researched. |
| Letting the AI read Personal Finance data by default | Breaks the independence rule and the earlier decision "no personal data in v1". Only the explicit one-click case in idea 21. |
| A single "Finova score" for the user | Can be mistaken for a credit score. Use four dials with no total (idea 10). |
| Tax-optimisation advice for entrepreneurs | Advice risk and rules in flux (idea 24). Explain only. |
| Daily push notifications | Notification fatigue; works against "calm". |
| Handling or pooling money (savings circles with real money) | Moves Finova into regulated activity. |

---

## 6. Suggested order for the next three releases

**Release 1: Trust and quick wins (about 2 to 3 weeks)**
- 6 Exchange-spread meter (S)
- 5 Deposit toolkit (M); needs the small "as of" settings file
- 13 Fast mobile entry plus install-to-home-screen (S to M)
- 15 Charts you can read, table view and Armenian type check (S to M)
- 22 Report a wrong answer plus "last checked" stamps (S)
- 20 Check before you trust (S)
Why first: no new data sources, high clarity, and they build trust before asking for habits.

**Release 2: Habit (about 4 to 5 weeks)**
- 12 What-if panel (M), built together with
- 2 Savings goals you can keep (M) and 3 Big irregular expenses planner (M)
- 1 Month story (M)
- 18 Calm monthly check-in (S to M; with an explicit opt-in)
- 4 Income and expenses in other currencies (M)
- 19 Quiet milestones (S to M, last)
Why second: this is the loop (understand, set a number, come back next month). Goals and the what-if panel share the most code.

**Release 3: Armenian knowledge (about 4 to 6 weeks)**
- 8 Armenia in numbers (M), with the monthly update routine
- 9 Where can money live? (M), with a short legal read
- 17 Learn path, first five lessons (M), each linked to a tool built earlier
- 10 Money check-up (M)
- 14 First-win onboarding (S to M), once analytics show where people drop
Later: 7 Look-back and alerts, 11 Bonds page, 16 Hide amounts, 21 Explain this, 23 Personal inflation, 24 Pay and tax helper, 25 News on stock cards.

---

## 7. Assumptions, open questions, and what I could not verify

### Assumptions
- Costs assume Finova's current hosting, database and email plan stays as is; I did not re-check their free-tier limits today.
- Armenian users are mostly on phones (supported by connection counts **[R]**, not by usage data for money apps).
- The educational-prototype decision (no consent checkbox at sign-up) stays for now; ideas that send email (18) or store extra data should use an explicit opt-in anyway.

### Questions for Anna
1. Should the goals module (idea 2) be a new menu item, or live inside the AI Assistant page?
2. Is a reviewed, neutral "options map" (idea 9) acceptable, and should a lawyer read it before launch?
3. Do you want a tone choice ("plain" / "encouraging") anywhere? I recommend a calm default and no roast option.
4. Will you contact Rate.am for permission to keep using their bank-rate data (idea 6 increases how visible it is)?
5. Who maintains the monthly numbers for "Armenia in numbers" and the "as of" settings (you, or an automated check with your approval)?
6. Is there appetite for an email channel at all (idea 18), given the consent question?
7. Do you want any family or school partnership explored (direction 2) or is that out of scope?
8. For the Armenian review sheet: should the new lessons and options map follow the same review process as the translation?

### What I could not verify
- **Armstat API:** the PxWeb API path returned an error; I did not find a working programmatic route. The CPI-by-category tables are known only from a search summary. **[U]**
- **AMX (Armenia Securities Exchange):** the site returned a small page shell. I did not confirm any downloadable auction or yield feed. Bond yields (8.09% for the first 10-year auction of 2026) come from a news report. **[R]**
- **Deposit interest rates by bank:** no verified, current, official source. The Rate.am deposit address returned the exchange-rate page for me; the search showed aggregator sites quoting rates without dates. So no deposit comparison is proposed.
- **Current tax parameters:** conflicting (idea 24). The 10% deposit interest tax rests on the earlier research note, which asks for a re-check of the consolidated Tax Code.
- **Dividend tax change to 15% from 2027 for bank dividends** (seen in a secondary source in the earlier research) was not confirmed. Not used.
- **How the AMD 16 million and AMD 7 million guarantee limits combine in one bank:** the Fund FAQ does not state it in one line.
- **Whether the dram sign (֏) renders in the font stack** (Manrope plus Noto Sans Armenian). The Google Fonts stylesheet I fetched showed no unicode range. Test on real phones.
- **Frequency of CBA's statistics files** other than the two monthly reserve files; I did not check the file's latest month.
- **Ineco app launch year:** the App Store page shows "Apr 6" without a year **[V]**; a search summary said 2026 **[R]**.
- **Revolut budgeting limits, Monarch feature tiers, Wealthfront Path today:** from third-party reviews or older posts. **[R]**
- **Consent and children's data rules in Armenia, and any CBA rule on robo-advice or comparison services:** not read. Needs a lawyer.
- **No usage data** on how Finova's current users behave (device mix, drop-off). Add basic analytics before judging ideas 13, 14, 18.

### Verification checklist (before building any idea)
- [ ] Re-open ADGF FAQ and the Tax Code text; record the date in the settings file (ideas 5, 9).
- [ ] Ask the State Revenue Committee or an accountant for the current payroll and regime parameters (idea 24).
- [ ] Confirm Rate.am permission (idea 6, 7).
- [ ] Test whether AMX or the Ministry of Finance offers a file or feed for auction results (idea 11).
- [ ] Confirm the CBA home-page values can be read safely and what the update routine does when the layout changes (idea 8).
- [ ] Test ֏ and Armenian text on a 360 px phone in both weights (idea 15).
- [ ] Legal read of the options map and any email feature (ideas 9, 18).
- [ ] Re-read each source marked [R] that appears in user-facing text.

---

## 8. Sources

### Verified by me on 2026-10-21 [V]
- Central Bank of Armenia home page (policy rate 6.75%, annual inflation 4.3% for September 2026): https://www.cba.am/en/
- CBA external-sector statistics (file list): http://old.cba.am/en/SitePages/statexternalsector.aspx
- CBA money transfers by country, monthly and annual, USD and AMD (downloaded): https://old.cba.am/stat/stat_data_eng/5_Money_transfers_of_individuals_by_countries-eng.xlsx
- CBA registers of licensed firms (page loads, list of types): https://www.cba.am/en/licensed-investment-companies/ and https://www.cba.am/en/licensed-banks/
- CBA yield curves page (loads; data not read): https://www.cba.am/en/yield-curves-of-gb/
- Deposit Guarantee Fund FAQ (AMD 16 mln / AMD 7 mln, per bank, counting order, overdue liabilities): https://adgf.am/en/faq
- Treasury Direct, Ministry of Finance (retail sale to residents and non-residents, income not taxed, no commissions, decision N 381): https://www.gp.minfin.am/en/about-us and https://www.gp.minfin.am/
- Armstat home page (Inflation Calculator link): https://armstat.am/en/ ; ArmStatBank: https://statbank.armstat.am/pxweb/en/ArmStatBank/
- World Bank API, personal remittances received % of GDP: https://api.worldbank.org/v2/country/ARM/indicator/BX.TRF.PWKR.DT.GD.ZS?format=json
- abcfinance.am page source (salary calculation constants): https://abcfinance.am
- Rate.am (page loads; robots.txt 404): https://www.rate.am/robots.txt
- Ineco app (Inecobank) App Store listing: https://apps.apple.com/app/id6477373305
- MyAmeria Star (AmeriaBank CJSC) App Store listing: https://apps.apple.com/mx/app/myameria-star/id6495064858
- YNAB principles: https://www.ynab.com/the-four-rules
- Copilot Money: https://www.copilot.money/
- NBER Working Paper 27057 (Kaiser, Lusardi, Menkhoff, Urban): https://www.nber.org/papers/w27057
- Fernandes, Lynch, Netemeyer 2014 abstract: https://repub.eur.nl/pub/76416
- World Bank blog on single goal vs several goals (Soman and Zhao): https://blogs.worldbank.org/en/impactevaluations/marketing-saving-fewer-goals-can-lead-to-higher-savings
- Regional Post, CBA on moving from awareness to behaviour: https://regionalpost.org/en/articles/from-awareness-to-behavior.html
- FinDev Gateway page on Armenia 2019 Financial Capability Barometer (no figures on the page): https://www.findevgateway.org/paper/2020/03/study-financial-capability-population-armenia-2019
- Finova's own files: research/financial-market-research.md, finova-frontend-spec.md, ai-assistant-plan.md, i18n-plan.md, and `src/ui` (pages and rules).

### Reported, not independently checked [R]
- Dai, Milkman, Riis, fresh-start effect: https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf
- Karlan, McConnell, Mullainathan, Zinman, reminders: https://img.nber.org/papers/w16205 and https://repec.cepr.org/repec/cpr/ceprdp/DP7907.pdf
- Drexler, Fischer, Schoar, rules of thumb: https://researchonline.lse.ac.uk/id/eprint/33502
- Soman and Cheema, earmarking: https://www.russellsage.org/sites/default/files/u137/jmr-C-s014-s021-online.pdf
- Ashraf, Karlan, Yin, commitment savings: https://microfinancegateway.org/paper/2005/09/tying-odysseus-mast-evidence-commitment-savings-product-philippines
- Gamification reviews and study: https://aisel.aisnet.org/pacis2025/general_topic/general_topic/20/ ; https://www.bayes.citystgeorges.ac.uk/news-and-events/news/2022/january/turning-long-term-savings-goals-into-a-game-can-increase-consumer-financial-well-being
- Robinhood Massachusetts settlement: https://velaw.com/insights/game-over-robinhood-pays-7-5-million-to-resolve-gamification-securities-violations
- Monzo Year in Monzo FAQ: https://monzo.com/help/year-in-monzo-2024/year-in-monzo-faq
- Cleo (Sifted): https://sifted.eu/articles/want-to-make-your-ai-chatbot-funny-hiring-comedians-is-a-start
- Wealthfront planning: https://www.wealthfront.com/what-we-do ; Monarch (third-party): https://sacra.com/c/monarch-money/ ; Revolut analytics help: https://help.revolut.com/en-US/help/accounts/budget-and-analytics/how-can-i-see-my-spending-and-income-analytics/
- Stash and Public (InvestmentNews, 2021): https://investmentnews.com/fintech/fintech-apps-that-strive-for-good/205112 ; Zogo: https://www.cuinsight.com/press-release/gen-z-targeted-zogo-app-reaches-milestone-signing-200-financial-institution-partners/
- FinHealth Score: https://finhealthnetwork.org/score/ ; CFPB well-being scale: https://www.consumerfinance.gov/data-research/research-reports/financial-well-being-scale/
- CFPB chatbots: https://www.consumerfinance.gov/about-us/newsroom/cfpb-issue-spotlight-analyzes-artificial-intelligence-chatbots-in-banking ; ESMA: https://www.esma.europa.eu/sites/default/files/2024-05/ESMA35-335435667-5924__Public_Statement_on_AI_and_investment_services.pdf ; NIST AI 600-1: https://airc.nist.gov/docs/NIST.AI.600-1.GenAI-Profile.ipd.pdf
- WCAG 2.2 target size: https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html
- DataReportal Digital 2026 Armenia: https://datareportal.com/reports/digital-2026-armenia
- Noto Sans Armenian: https://fonts.google.com/noto/specimen/Noto+Sans+Armenian/about
- Progressive disclosure summary: https://uxcel.com/glossary/progressive-disclosure
- Payroll guide (conflicting): https://armenian-lawyer.com/business-immigration/payroll-tax-rates-and-social-security-contributions-in-armenia/ ; IT tax explainer: https://armenian-lawyer.com/business-immigration/armenia-1-percent-tech-tax/ ; micro-business threshold: https://arka.am/en/news/economy/armenia-plans-to-raise-the-threshold-for-micro-businesses-/
- Government bond yields (Minister of Finance): https://armenpress.am/en/article/1240182/amp
- Survey on savings and banks (2013): https://arka.am/en/news/business/survey_more_than_65_of_armenia_s_citizens_have_savings_but_only_6_of_them_keep_their_money_in_banks/
- CBA warning about forged licence (2022): https://www.cba.am/EN/pmessagesannouncements/Gazprom%20warning%2006.06.2022_eng.pdf
- Unistream and Armenian banks (2023): https://www.interfax.com/newsroom/top-stories/93200/
- World Bank Remittance Prices Worldwide, Russia to Armenia: https://remittanceprices.worldbank.org/corridor/RU/AM
- CBA schools and programme figures (self-reported): https://regionalpost.org/en/articles/high-financial-capability-in-everyday-behavior-the-central-banks-vision.html

### My own inference [I]
Fit-to-Armenia statements marked [I], priorities, sizes, running-cost estimates, release order, and the interpretation of the abcfinance.am calculator code.
