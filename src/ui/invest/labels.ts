import type { Driver, Horizon, Risk, Warning } from "../api/types";
import { EN } from "../i18n/dict/en";
import { tg, type Key, type Params } from "../i18n/translate";

/** the translator from useT() */
export type T = (key: Key, params?: Params) => string;

export const RISKS: readonly Risk[] = ["low", "medium", "high"];
export const HORIZONS: readonly Horizon[] = ["short", "medium", "long"];

export const riskLabel = (t: T, r: Risk): string => t(`invest.risk.${r}.label`);
export const riskHelp = (t: T, r: Risk): string => t(`invest.risk.${r}.help`);
export const horizonLabel = (t: T, h: Horizon): string => t(`invest.horizon.${h}.label`);
export const horizonHelp = (t: T, h: Horizon): string => t(`invest.horizon.${h}.help`);

export const MIN_AMOUNT = 1_000;
export const MAX_AMOUNT = 1_000_000_000;
/** the English wording (the checkbox itself reads "invest.flow.emergency" through the translator) */
export const EMERGENCY_LABEL: string = EN.invest.flow.emergency;

/** validation message for the amount step; null when valid. `raw` is the digits-only string. Plain function: reads the current language. */
export function amountProblem(raw: string): string | null {
  if (!raw.trim()) return tg("invest.flow.errAmountEmpty");
  if (!/^\d+$/.test(raw)) return tg("invest.flow.errAmountWhole");
  const n = Number(raw);
  if (n < MIN_AMOUNT) return tg("invest.flow.errAmountMin", { min: MIN_AMOUNT.toLocaleString("en-US") });
  if (n > MAX_AMOUNT) return tg("invest.flow.errAmountMax", { max: MAX_AMOUNT.toLocaleString("en-US") });
  return null;
}

/** how full the progress bar is: each completed requirement fills a quarter */
export function progressPercent(v: { amount: string; risk: Risk | null; horizon: Horizon | null; confirmed: boolean }): number {
  let p = 0;
  if (amountProblem(v.amount) === null) p += 25;
  if (v.risk) p += 25;
  if (v.horizon) p += 25;
  if (v.confirmed) p += 25;
  return p;
}

/* ------------------------------------------------------------------ driver and factor names (the server sends English labels) */

/** the server's English driver label (LABELS in src/invest/explain.ts) -> dictionary key */
const DRIVER_KEY_BY_ENGLISH: Record<string, Key> = {
  "Return on equity": "invest.driver.roe",
  "Operating margin": "invest.driver.opMargin",
  "Free-cash-flow margin": "invest.driver.fcfMargin",
  "Liabilities to equity": "invest.driver.debtToEquity",
  "Profitable years (last 3)": "invest.driver.earningsStability",
  "P/E (latest fiscal year)": "invest.driver.pe",
  "Price to sales": "invest.driver.ps",
  "Price to book": "invest.driver.pb",
  "Free-cash-flow yield": "invest.driver.fcfYield",
  "Revenue growth (year on year)": "invest.driver.revGrowth",
  "Revenue growth (3-year annualised)": "invest.driver.rev3yCAGR",
  "EPS growth (year on year)": "invest.driver.epsGrowth",
  "12-1 month price momentum": "invest.driver.mom12_1",
  "6-month price momentum": "invest.driver.mom6",
  "Price vs 200-day average": "invest.driver.above200dma",
  "1-year volatility": "invest.driver.vol1y",
  "Beta vs the S&P 500 ETF (3 years)": "invest.driver.beta3y",
  "1-year maximum drawdown": "invest.driver.maxDDAbs",
  "Dividend yield": "invest.driver.divYield",
  "Dividend payout at or below 70%": "invest.driver.payoutOk",
  "Pays a dividend": "invest.driver.paysDividend",
};

/** FACTOR_LABELS of src/invest/explain.ts */
const FACTOR_KEY_BY_ENGLISH: Record<string, Key> = {
  Quality: "invest.factor.quality",
  Value: "invest.factor.value",
  Growth: "invest.factor.growth",
  Momentum: "invest.factor.momentum",
  "Low risk": "invest.factor.lowRisk",
  Income: "invest.factor.income",
};

/** a driver name in the chosen language; an unknown label is shown as the server sent it */
export const driverLabel = (t: T, label: string): string => (DRIVER_KEY_BY_ENGLISH[label] ? t(DRIVER_KEY_BY_ENGLISH[label]) : label);

/** the display value of a driver: numbers stay as sent, the yes/no of the dividend drivers is translated */
export const driverValue = (t: T, value: string): string => (value === "yes" ? t("invest.server.yes") : value === "no" ? t("invest.server.no") : value);

/** growth figures from 1,000% up are shown as "42.7×" / "42.7 անգամ" (how many times larger): the backend sends that form, and older saved results are converted here from their number */
const GROWTH_LABELS = new Set(["Revenue growth (year on year)", "Revenue growth (3-year annualised)", "EPS growth (year on year)"]);
export function driverShown(t: T, d: Driver): string {
  const fromRaw = GROWTH_LABELS.has(d.label) && typeof d.rawValue === "number" && d.rawValue >= 10 ? (1 + d.rawValue).toFixed(1) : null;
  const n = fromRaw ?? /^(\d+(?:\.\d+)?)×$/.exec(d.value)?.[1];
  return n ? t("invest.server.times", { n }) : driverValue(t, d.value);
}

/** "Return on equity 12.0%" for the Reasons column */
export const driverText = (t: T, d: Driver): string => t("invest.result.driverValue", { label: driverLabel(t, d.label), value: driverShown(t, d) });

/* ------------------------------------------------------------------ server-provided English sentences */

const wordRisk = (t: T, w: string): string => (w === "Low" || w === "Medium" || w === "High" ? riskLabel(t, w.toLowerCase() as Risk) : w);
const wordHorizon = (t: T, w: string): string => (w === "Short" || w === "Medium" || w === "Long" ? t(`invest.horizonName.${w.toLowerCase() as Horizon}`) : w);

/** exact English text -> dictionary key */
const EXACT: Record<string, Key> = {
  "Match score": "invest.server.matchScore",
  "How closely this selection fits your risk and horizon under Finova's scoring method. It is not a forecast of returns.": "invest.server.scoreNote",
  "Informational only, not personal investment advice. Nothing here is an offer or a recommendation to buy or sell.": "invest.server.disclaimer1",
  "Finova executes no trades and connects to no broker.": "invest.server.disclaimer2",
  "Selections come from a rules-based method (see methodologyVersion) applied to public data; they are not predictions.": "invest.server.disclaimer3",
  "Prices are end-of-day / delayed values from free public sources and may differ from what a broker shows.": "invest.server.disclaimer4",
  "Shares can lose value over horizons under 2 years. For a short horizon with low risk tolerance, deposits or bonds are other options to consider. This result is shown for information.":
    "invest.server.warnLowRiskShort",
  "High risk combined with a short horizon means large price swings can occur before the horizon ends.": "invest.server.warnHighRiskShort",
  "The USD/AMD rate could not be refreshed; the last known CBA rate is used.": "invest.server.warnFxStale",
  "The benchmark comparison could not be computed from stored prices.": "invest.server.warnBenchmarkUnavailable",
  "No stock in the current universe passes the risk rules for this risk level and horizon.": "invest.server.noStockPasses",
  "Try a higher risk level or a longer horizon.": "invest.server.tryHigher",
  "No combination of eligible stocks fits this amount as whole shares.": "invest.server.noCombination",
  "Try a larger amount.": "invest.server.tryLarger",
  "No stock fits these inputs.": "invest.server.noStockFits",
  "Recommendation data is not available yet: the universe snapshot has not been built.": "invest.server.noSnapshot",
  Unknown: "invest.server.unknownSector",
};

interface Rule {
  re: RegExp;
  key: (m: RegExpExecArray) => Key;
  params: (m: RegExpExecArray, t: T) => Params;
}

/** sentences with numbers inside: the numbers are cut out of the English text and put back into the dictionary text */
const RULES: Rule[] = [
  { re: /^With less than about \$(\d+) the amount is too small to diversify meaningfully\.$/, key: () => "invest.server.warnSmallBudget", params: (m) => ({ usd: m[1] }) },
  { re: /^The underlying data is from (\S+) \((\d+) days old\)\.$/, key: () => "invest.server.warnStaleSnapshot", params: (m) => ({ date: m[1], days: m[2] }) },
  {
    re: /^A single stock is undiversified\. In the last year this stock fell as much as (\S+) from a peak and its volatility was (\S+)\.$/,
    key: () => "invest.server.warnConcentration",
    params: (m) => ({ drop: m[1], vol: m[2] }),
  },
  {
    re: /^Some inputs were unavailable for (\S+) \((.+)\); the score uses the remaining factors\.$/,
    key: () => "invest.server.warnFactorDropped",
    params: (m, t) => ({ symbol: m[1], factor: FACTOR_KEY_BY_ENGLISH[m[2]] ? t(FACTOR_KEY_BY_ENGLISH[m[2]]) : m[2] }),
  },
  {
    re: /^Only (\d+) holdings were possible for this amount \(target (\d+)\); the portfolio is less diversified than intended\.$/,
    key: () => "invest.server.warnFewerHoldings",
    params: (m) => ({ n: m[1], target: m[2] }),
  },
  {
    re: /^Because only whole shares are allocated, (\d+) higher-priced candidates were skipped for this amount; small amounts favour lower-priced shares\.$/,
    key: () => "invest.server.warnWholeShares",
    params: (m) => ({ n: m[1] }),
  },
  { re: /^With (\d+) holdings a (\d+)% per-position cap cannot hold, so weights are close to equal\.$/, key: () => "invest.server.warnCapNotEnforceable", params: (m) => ({ n: m[1], cap: m[2] }) },
  {
    re: /^Because only whole shares can be bought, (.+) ended up above the (\d+)% per-position guide for (Low|Medium|High) risk\. The target weights stay within it; the difference comes from rounding to whole shares\.$/,
    key: () => "invest.server.warnCapExceeded",
    params: (m, t) => ({ list: m[1], cap: m[2], risk: wordRisk(t, m[3]) }),
  },
  {
    re: /^To reach (\d+) holdings, the (correlation filter|sector cap|correlation filter and sector cap) had to be relaxed\.$/,
    key: (m) => (m[2] === "correlation filter" ? "invest.server.warnRelaxedCorrelation" : m[2] === "sector cap" ? "invest.server.warnRelaxedSector" : "invest.server.warnRelaxedBoth"),
    params: (m) => ({ n: m[1] }),
  },
  {
    re: /^Estimated portfolio volatility \((\S+)\) is above the (\S+) guide for (Low|Medium|High) risk\.$/,
    key: () => "invest.server.warnVolatilityAbove",
    params: (m, t) => ({ vol: m[1], band: m[2], risk: wordRisk(t, m[3]) }),
  },
  {
    re: /^(\d+) holdings for a budget of about \$([\d,]+) \(methodology rule: (\d+) holdings at this size, at least \$(\d+) per position\)\.$/,
    key: () => "invest.server.whyHoldings",
    params: (m) => ({ n: m[1], budget: m[2], target: m[3], min: m[4] }),
  },
  {
    re: /^Weights are proportional to each stock's match score divided by its 1-year volatility, limited to (\d+)% per position and at least (\d+)%, then rounded to whole shares \(target and actual percentages are both shown\)\.$/,
    key: () => "invest.server.whyWeighting",
    params: (m) => ({ cap: m[1], floor: m[2] }),
  },
  {
    re: /^At most (\d+) holdings per sector and no pair of holdings with average return correlation above (\S+) where alternatives existed\.$/,
    key: () => "invest.server.whyDiversification",
    params: (m) => ({ n: m[1], corr: m[2] }),
  },
  { re: /^The amount is smaller than the cheapest eligible share \(\$(\S+)\)\.$/, key: () => "invest.server.cheapestShare", params: (m) => ({ price: m[1] }) },
  { re: /^An amount of at least about (\d+) AMD is needed for one share\.$/, key: () => "invest.server.minAmount", params: (m) => ({ amd: m[1] }) },
  { re: /^(\d+) holdings$/, key: () => "invest.server.holdingsHeadline", params: (m) => ({ n: m[1] }) },
];

/**
 * A sentence the server sent (always English), in the chosen language. Looked up by its exact English text (numbers cut out and
 * put back); the server's own text is shown when there is no entry. In English the result is byte-identical to the input.
 */
export function localizeServer(t: T, text: string | null | undefined): string {
  if (!text) return text ?? "";
  const exact = EXACT[text];
  if (exact) return t(exact);
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (m) return t(rule.key(m), rule.params(m, t));
  }
  return text;
}

export const localizeWarning = (t: T, w: Warning): string => localizeServer(t, w.message);

/** the server's "Drivers... . Scoring weights for Low risk and Short horizon: Quality 30%, ..." sentence; unchanged when it does not have that shape */
export function localizeExplanation(t: T, text: string | undefined, drivers: Driver[] | undefined): string {
  if (!text) return "";
  const m = /^(.*)\. Scoring weights for (Low|Medium|High) risk and (Short|Medium|Long) horizon: (.+)\.$/.exec(text);
  if (!m || !drivers?.length) return text;
  const english = drivers.map((d) => (d.value === "yes" ? d.label : `${d.label} ${d.value} (top ${d.topPercent}% of eligible stocks)`)).join(" · ");
  if (english !== m[1]) return text;
  const weights: string[] = [];
  for (const part of m[4].split(", ")) {
    const w = /^(.+) (\d+)%$/.exec(part);
    if (!w) return text;
    weights.push(`${FACTOR_KEY_BY_ENGLISH[w[1]] ? t(FACTOR_KEY_BY_ENGLISH[w[1]]) : w[1]} ${w[2]}%`);
  }
  const lines = drivers.map((d) =>
    d.value === "yes" ? driverLabel(t, d.label) : t("invest.server.explanationDriver", { label: driverLabel(t, d.label), value: driverShown(t, d), n: d.topPercent ?? 0 }),
  );
  return t("invest.server.explanation", { drivers: lines.join(" · "), risk: wordRisk(t, m[2]), horizon: wordHorizon(t, m[3]), weights: weights.join(", ") });
}
