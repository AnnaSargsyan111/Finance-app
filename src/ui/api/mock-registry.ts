/**
 * EXPLICIT MOCK REGISTRY - one boolean per endpoint.
 *
 *   true  = the UI is served by fixtures shaped like the contract; every result then carries `demo: true` and the UI
 *           shows a visible "Demo data" label (see <DemoBadge>).
 *   false = the UI calls the real Finova endpoint.
 *
 * STATE (2026-09-21, after the Backend delivered the investment routes): EVERY endpoint answers with the contract shape
 * and every flag is `false` (LIVE). Each value was checked by calling the running dev server (see the frontend report).
 * The values are typed as the literal `false` on purpose: the fixtures were removed once the routes went live, so the
 * compiler refuses `true`. To mock an endpoint again (e.g. a backend route is temporarily broken), add a fixture for it
 * in src/ui/api/fixtures/, widen its type to `boolean`, and branch on the flag inside its src/ui/api/*.ts function.
 */
export const MOCK = {
  // auth
  authSignUp: false,
  authSignIn: false,
  authSignOut: false,
  authForgotPassword: false,
  authResetPassword: false,
  authSession: false,
  authPasswordRules: false,
  // personal finance
  pfPeriods: false,
  pfPeriodGet: false,
  pfPeriodPut: false,
  pfPeriodDelete: false,
  // market
  fxLatest: false,
  fxHistory: false,
  stocks: false,
  stockHistory: false,
  news: false,
  newsRefresh: false,
  newsDetail: false,
  // investment
  convert: false,
  recommendationSingle: false,
  recommendationPortfolio: false,
  comparison: false,
  historyAdd: false,
  historyList: false,
  historyGet: false,
  historyDelete: false,
} as const;

export type EndpointId = keyof typeof MOCK;
export const anyMocked = (): boolean => (Object.values(MOCK) as boolean[]).some(Boolean);
