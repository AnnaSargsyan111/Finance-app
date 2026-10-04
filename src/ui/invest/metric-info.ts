import { formatAmd, formatNumber, formatPercent, formatUsd } from "../lib/format";

/**
 * Plain-language explanations for every metric on the recommendation result, shown in the "i" popovers. Each has three short parts:
 * what it is, how to read it, and an "in this result" line built from the REAL numbers of the result on screen (never invented). The wording
 * is educational: it explains a number and never tells anyone to buy or sell.
 */
export interface MetricInfo {
  title: string;
  what: string;
  read: string;
  /** "in this result": null when the numbers it needs are missing */
  example: string | null;
}

/** what a popover knows about the result it sits in; a missing value just means no example line */
export type InfoCtx = Record<string, string | number | null | undefined>;

interface Entry {
  title: string;
  what: string;
  read: string;
  example?: (c: InfoCtx) => string | null;
}

/* ------------------------------------------------------------------ small helpers */
const n = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const str = (v: unknown, fallback: string): string => (typeof v === "string" && v ? v : fallback);
const pct = (x: number, d = 1) => formatPercent(x * 100, d);
const usd = (x: number, d = 2) => formatUsd(x, d);
const num = (x: number, d = 2) => formatNumber(x, d);
/** "This puts it in the top 3% of the eligible stocks we compared." (drivers carry this) */
const rank = (c: InfoCtx) => (n(c.top) !== null ? ` On this measure it ranks in the top ${c.top}% of the eligible stocks we compared.` : "");
const who = (c: InfoCtx) => str(c.name, "This stock");
const win = (c: InfoCtx) => str(c.window, "the period");
const bench = (c: InfoCtx) => str(c.bench, "the benchmark");

/** "gained 12.3%" / "lost 4.5%" */
const move = (x: number) => `${x >= 0 ? "gained" : "lost"} ${pct(Math.abs(x))}`;

/* ------------------------------------------------------------------ the entries */
const ENTRIES: Record<string, Entry> = {
  /* ---- the single-stock card ---- */
  price: {
    title: "Price per share",
    what: "The latest price of one share of the company, in US dollars.",
    read: "A higher price does not mean a better or a worse company. It only decides how many whole shares your amount can buy.",
    example: (c) => (n(c.price) !== null ? `One share of ${who(c)} costs ${usd(n(c.price)!)}.` : null),
  },
  shares: {
    title: "Shares for your amount",
    what: "How many whole shares your amount buys at the current price. Only whole shares are counted.",
    read: "More shares is not better by itself: it depends on the price. Whatever cannot buy another whole share stays as cash.",
    example: (c) => (n(c.shares) !== null && n(c.cost) !== null && n(c.price) !== null ? `${usd(n(c.cost)!)} buys ${num(n(c.shares)!, 0)} ${n(c.shares) === 1 ? "share" : "shares"} of ${who(c)} at ${usd(n(c.price)!)} each.` : null),
  },
  cost: {
    title: "Cost",
    what: "The total price of the shares: the number of shares times the price per share, in US dollars, with the dram amount at the CBA rate below it.",
    read: "It is usually a little less than the amount you entered, because you cannot buy part of a share.",
    example: (c) => (n(c.shares) !== null && n(c.price) !== null && n(c.cost) !== null ? `${num(n(c.shares)!, 0)} × ${usd(n(c.price)!)} = ${usd(n(c.cost)!)}${n(c.allocatedAmd) !== null ? ` (${formatAmd(n(c.allocatedAmd)!)})` : ""}.` : null),
  },
  cashLeft: {
    title: "Cash left over",
    what: "The part of your amount that cannot buy another whole share.",
    read: "A small leftover is normal. It stays with you as cash and is not invested.",
    example: (c) => (n(c.price) !== null && n(c.leftUsd) !== null && n(c.leftAmd) !== null ? `Another share of ${who(c)} would cost ${usd(n(c.price)!)}, more than the ${usd(n(c.leftUsd)!)} left, so ${formatAmd(n(c.leftAmd)!)} stays uninvested.` : null),
  },
  vol1y: {
    title: "1-year volatility",
    what: "How much the share price moved up and down over the past year, as a yearly percentage. It measures the size of the swings, not their direction.",
    read: "Lower means a calmer ride; higher means bigger ups and downs. It describes the past and is not a forecast.",
    example: (c) => {
      const v = n(c.value);
      if (v === null) return null;
      const cost = n(c.cost);
      return `${who(c)}'s price has typically swung about ${pct(v)} over a year.${cost !== null ? ` On ${usd(cost)}, a swing of that size is about ${usd(cost * v, 0)} up or down.` : ""}${rank(c)}`;
    },
  },
  maxDD: {
    title: "1-year maximum drawdown",
    what: "The biggest fall from a peak to a later low during the past year.",
    read: "Closer to 0% is better. For example, -20% means that at its worst moment the price was 20% below its earlier high.",
    example: (c) => {
      const v = n(c.value);
      if (v === null) return null;
      const cost = n(c.cost);
      return `At its worst, ${who(c)} fell ${pct(Math.abs(v))} from a high.${cost !== null ? ` On ${usd(cost)} that would be about ${usd(cost * Math.abs(v), 0)} lost on paper at the low point.` : ""}${rank(c)}`;
    },
  },

  /* ---- allocated / left over (both result types) ---- */
  allocated: {
    title: "Allocated",
    what: "The part of your amount that is used to buy whole shares.",
    read: "It is a little less than the amount you entered, because part of a share cannot be bought.",
    example: (c) => (n(c.inputAmd) !== null && n(c.allocatedAmd) !== null ? `Of your ${formatAmd(n(c.inputAmd)!)}, ${formatAmd(n(c.allocatedAmd)!)} is used to buy shares.` : null),
  },
  unallocated: {
    title: "Unallocated cash",
    what: "What is left of your amount after buying whole shares.",
    read: "A small remainder is normal. It is not invested.",
    example: (c) => (n(c.unallocatedAmd) !== null && n(c.inputAmd) !== null ? `${formatAmd(n(c.unallocatedAmd)!)} of your ${formatAmd(n(c.inputAmd)!)} stays uninvested.` : null),
  },
  matchScore: {
    title: "Match score",
    what: "A score from 0 to 100 for how well this recommendation fits the answers you gave: your risk level and your investment horizon.",
    read: "Higher means a closer fit. It is a fit score, not a probability of making money and not an expected return.",
    example: (c) => (n(c.score) !== null ? `Your score is ${num(n(c.score)!, 0)} out of 100.` : null),
  },

  /* ---- "Why this match": the measures a stock can stand out on ---- */
  roe: {
    title: "Return on equity",
    what: "Yearly profit divided by the money shareholders have put into the company (its equity). It shows how much profit the company makes from each dollar of shareholders' money.",
    read: "Higher is better. Be a little careful with very high values: they can appear when a company has little equity left, for example after heavy borrowing or buying back its own shares.",
    example: (c) => (n(c.value) !== null ? `${who(c)}'s return on equity is ${pct(n(c.value)!)}: about ${usd(n(c.value)!)} of yearly profit for every $1 of shareholders' equity.${rank(c)}` : null),
  },
  opMargin: {
    title: "Operating margin",
    what: "The share of sales left as profit from running the business, before interest and taxes.",
    read: "Higher is better: the company keeps more of each sale. Margins differ a lot between industries, so compare similar businesses.",
    example: (c) => (n(c.value) !== null ? `Of every $100 ${who(c)} sells, about ${usd(n(c.value)! * 100, 0)} remains as operating profit.${rank(c)}` : null),
  },
  fcfMargin: {
    title: "Free-cash-flow margin",
    what: "The cash left after paying running costs and investing in equipment, as a share of sales.",
    read: "Higher is better. It is real cash, so it is harder to flatter than accounting profit.",
    example: (c) => (n(c.value) !== null ? `Of every $100 ${who(c)} sells, about ${usd(n(c.value)! * 100, 0)} ends up as free cash.${rank(c)}` : null),
  },
  debtToEquity: {
    title: "Liabilities to equity",
    what: "Compares everything the company owes (its liabilities) with the shareholders' stake (its equity).",
    read: "Lower generally means less reliance on borrowed money and more cushion in a bad year. Some businesses, such as banks and real-estate companies, normally carry more.",
    example: (c) => (n(c.value) !== null ? `${who(c)} owes about ${usd(n(c.value)!)} for every $1 of shareholders' equity.${rank(c)}` : null),
  },
  earningsStability: {
    title: "Profitable years (last 3)",
    what: "The share of the last three financial years in which the company made a profit.",
    read: "100% means it was profitable in all three years. Steadier profits are better.",
    example: (c) => (n(c.value) !== null ? `${who(c)} was profitable in ${Math.round(n(c.value)! * 3)} of the last 3 years.${rank(c)}` : null),
  },
  pe: {
    title: "P/E (latest fiscal year)",
    what: "The price/earnings ratio: the share price divided by the company's profit per share in its latest financial year. It shows how many dollars investors pay for each $1 of yearly profit.",
    read: "Lower can mean cheaper compared with profit, but a low P/E can also mean the market expects trouble or slow growth. Compare similar companies.",
    example: (c) => (n(c.value) !== null ? `At ${num(n(c.value)!)}, investors pay about ${usd(n(c.value)!)} for each $1 of ${who(c)}'s yearly profit.${rank(c)}` : null),
  },
  ps: {
    title: "Price to sales",
    what: "The company's total market value divided by its yearly sales: what you pay for each $1 of sales.",
    read: "Lower means cheaper relative to sales. Profitability matters too, so read it together with the margins.",
    example: (c) => (n(c.value) !== null ? `Investors pay about ${usd(n(c.value)!)} for each $1 of ${who(c)}'s yearly sales.${rank(c)}` : null),
  },
  pb: {
    title: "Price to book",
    what: "The share price divided by the company's book value per share, which is what would be left if you subtracted its debts from everything it owns.",
    read: "Lower can mean cheaper compared with net assets. It is most useful for businesses that own a lot of assets, and says less for companies that own little.",
    example: (c) => (n(c.value) !== null ? `Investors pay about ${usd(n(c.value)!)} for each $1 of ${who(c)}'s net assets.${rank(c)}` : null),
  },
  fcfYield: {
    title: "Free-cash-flow yield",
    what: "The cash the business generates in a year (free cash flow) divided by its market value.",
    read: "Higher is better, a bit like a higher interest rate on what you pay for the company.",
    example: (c) => (n(c.value) !== null ? `${who(c)} generates about ${usd(n(c.value)! * 100, 2)} of free cash flow a year for every $100 of company value.${rank(c)}` : null),
  },
  revGrowth: {
    title: "Revenue growth (year on year)",
    what: "How much the company's sales grew compared with the previous year.",
    read: "Higher is better, especially if profits grow too. A negative number means sales shrank.",
    example: (c) => (n(c.value) !== null ? `${who(c)}'s sales ${n(c.value)! >= 0 ? "grew" : "fell"} by ${pct(Math.abs(n(c.value)!))} compared with the year before.${rank(c)}` : null),
  },
  rev3yCAGR: {
    title: "Revenue growth (3-year annualised)",
    what: "The steady yearly growth rate of the company's sales over the last three years (the compound annual growth rate).",
    read: "Higher is better. Looking at three years smooths out a single unusual year.",
    example: (c) => (n(c.value) !== null ? `${who(c)}'s sales ${n(c.value)! >= 0 ? "grew" : "fell"} by about ${pct(Math.abs(n(c.value)!))} a year on average over three years.${rank(c)}` : null),
  },
  epsGrowth: {
    title: "EPS growth (year on year)",
    what: "Earnings per share (EPS) is profit divided by the number of shares. This is how much it grew compared with the previous year.",
    read: "Higher is better. A very large jump often follows a weak year, so read it together with the other numbers.",
    example: (c) => (n(c.value) !== null ? `${who(c)}'s profit per share ${n(c.value)! >= 0 ? "rose" : "fell"} by ${pct(Math.abs(n(c.value)!))} compared with the year before.${rank(c)}` : null),
  },
  mom12_1: {
    title: "12-1 month price momentum",
    what: "How much the share price rose or fell over the past 12 months, leaving out the most recent month.",
    read: "Higher means a stronger recent trend. It describes the past only and does not predict the future.",
    example: (c) => (n(c.value) !== null ? `Over that period ${who(c)}'s price ${n(c.value)! >= 0 ? "rose" : "fell"} ${pct(Math.abs(n(c.value)!))}.${rank(c)}` : null),
  },
  mom6: {
    title: "6-month price momentum",
    what: "How much the share price rose or fell over the past six months.",
    read: "Higher means a stronger recent trend. It describes the past only and does not predict the future.",
    example: (c) => (n(c.value) !== null ? `Over the past six months ${who(c)}'s price ${n(c.value)! >= 0 ? "rose" : "fell"} ${pct(Math.abs(n(c.value)!))}.${rank(c)}` : null),
  },
  above200dma: {
    title: "Price vs 200-day average",
    what: "How far today's price is above or below its average over the last 200 trading days, about ten months.",
    read: "Above the average (a positive number) suggests an uptrend; below it suggests a downtrend. It is a trend gauge, not a forecast.",
    example: (c) => (n(c.value) !== null ? `${who(c)}'s price is ${pct(Math.abs(n(c.value)!))} ${n(c.value)! >= 0 ? "above" : "below"} its 200-day average.${rank(c)}` : null),
  },
  beta3y: {
    title: "Beta vs the S&P 500 ETF (3 years)",
    what: "How strongly the stock has moved together with the overall US market (an S&P 500 fund) over three years. A beta of 1.0 means it moved about as much as the market.",
    read: "Above 1 means bigger swings than the market; below 1 means calmer. It is not good or bad: it shows the kind of ride to expect.",
    example: (c) => (n(c.value) !== null ? `With a beta of ${num(n(c.value)!)}, when the market moved 10%, ${who(c)} tended to move about ${num(n(c.value)! * 10, 1)}%.${rank(c)}` : null),
  },
  divYield: {
    title: "Dividend yield",
    what: "The dividends a company pays in a year, per share, as a share of the share price.",
    read: "Higher means more cash income, but a very high yield can be a warning sign. Dividends are not guaranteed.",
    example: (c) => (n(c.value) !== null ? `At today's price, ${who(c)} pays about ${usd(n(c.value)! * 1000, 0)} in dividends a year for every $1,000 invested.${rank(c)}` : null),
  },
  payoutOk: {
    title: "Dividend payout at or below 70%",
    what: "The payout ratio is the share of profit a company pays out as dividends. This check passes when it is 70% or lower.",
    read: "Passing means the company keeps enough profit to keep paying, so the dividend is more likely to last.",
    example: (c) => `${who(c)} passes this check.${rank(c)}`,
  },
  paysDividend: {
    title: "Pays a dividend",
    what: "Whether the company pays a regular dividend: a share of its profit paid out in cash to shareholders.",
    read: "Yes means shareholders receive cash income on top of any change in the share price.",
    example: (c) => `${who(c)} pays a dividend.${rank(c)}`,
  },

  /* ---- portfolio characteristics ---- */
  holdingsCount: {
    title: "Holdings",
    what: "How many different stocks the portfolio is split across.",
    read: "More holdings spread the risk, but only up to a point: many similar stocks can be less diversified than a few different ones.",
    example: (c) => (n(c.value) !== null ? `Your portfolio holds ${num(n(c.value)!, 0)} stocks.` : null),
  },
  weightedBeta: {
    title: "Weighted beta",
    what: "The average beta of the stocks, weighted by how much of your money is in each. Beta shows how strongly a stock moves with the overall US market; 1.0 means about the same as the market.",
    read: "Above 1 means bigger swings than the market; below 1 means calmer.",
    example: (c) => (n(c.value) !== null ? `With a weighted beta of ${num(n(c.value)!)}, when the market moved 10%, this portfolio tended to move about ${num(n(c.value)! * 10, 1)}%.` : null),
  },
  estimatedVolatility: {
    title: "Estimated volatility",
    what: "An estimate of how much the whole portfolio's value would swing in a year, based on the past year of prices. It accounts for stocks that move together or offset each other.",
    read: "Lower means a calmer ride. The portfolio is built to stay within a limit set by your risk level. It describes the past and is not a forecast.",
    example: (c) => {
      const v = n(c.value);
      if (v === null) return null;
      const base = n(c.allocatedAmd);
      return `A swing of about ${pct(v)} a year${base !== null ? ` is roughly ${formatAmd(base * v)} up or down on your ${formatAmd(base)}` : ""}.${n(c.band) !== null ? ` Your risk level allows up to ${pct(n(c.band)!, 0)}.` : ""}`;
    },
  },
  portfolioDividendYield: {
    title: "Dividend yield",
    what: "The dividends the portfolio's stocks pay in a year, as a share of what you invest, averaged by amount.",
    read: "Higher means more cash income. Dividends are not guaranteed and can change.",
    example: (c) => {
      const v = n(c.value);
      const base = n(c.allocatedAmd);
      return v !== null && base !== null ? `If payouts stay the same, about ${formatAmd(base * v)} a year on your ${formatAmd(base)}.` : null;
    },
  },
  effectiveN: {
    title: "Effective holdings",
    what: "How many equal-sized holdings the portfolio behaves like. If one stock is much bigger than the others, this is lower than the real number of holdings.",
    read: "The closer it is to the number of holdings, the more evenly your money is spread.",
    example: (c) => (n(c.value) !== null ? `${n(c.count) !== null ? `${num(n(c.count)!, 0)} holdings, but your money is` : "Your money is"} spread like ${num(n(c.value)!, 1)} equal-sized ones.` : null),
  },

  /* ---- holdings table headers ---- */
  allocation: {
    title: "Allocation",
    what: "The share of your amount that goes into each stock. A target is the planned share; because only whole shares can be bought, the real share is slightly different.",
    read: "All the shares add up to about 100%, with a little cash left over.",
    example: (c) => (n(c.percent) !== null ? `${who(c)} gets ${formatPercent(n(c.percent)!, 1)} of your amount${n(c.amountAmd) !== null ? `, about ${formatAmd(n(c.amountAmd)!)}` : ""}.` : null),
  },
  sharesCol: {
    title: "Shares",
    what: "How many whole shares of each stock the amount buys.",
    read: "Only whole shares are counted, which is why the real allocation is slightly different from the target.",
    example: (c) => (n(c.shares) !== null && n(c.price) !== null ? `${num(n(c.shares)!, 0)} ${n(c.shares) === 1 ? "share" : "shares"} of ${who(c)} at ${usd(n(c.price)!)} each.` : null),
  },
  reasons: {
    title: "Reasons",
    what: "The two things that stood out most for each stock when it was scored, with their values.",
    read: "Each reason is a measure from the scoring, such as profitability or low risk. Open the explanation of a measure to see what it means.",
    example: (c) => (typeof c.text === "string" && c.text ? `For ${who(c)}: ${c.text}.` : null),
  },

  /* ---- benchmark comparison: performance and risk ---- */
  "bm.annualisedVolatility": {
    title: "Volatility (annualised)",
    what: "How much the value moved up and down, shown as a yearly percentage. It is the typical size of the swings, not their direction.",
    read: "Lower means a smoother ride; higher means bigger ups and downs.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `Over ${win(c)}, the portfolio typically swung about ${pct(n(c.p)!)} a year; ${bench(c)} about ${pct(n(c.b)!)}.` : null),
  },
  "bm.maxDrawdown": {
    title: "Max drawdown",
    what: "The biggest fall from a peak to a later low within the period.",
    read: "Closer to 0% is better. For example, -20% means that at its worst the value was 20% below its earlier high.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `Over ${win(c)}, the portfolio's worst fall from a high was ${pct(Math.abs(n(c.p)!))}; ${bench(c)}'s was ${pct(Math.abs(n(c.b)!))}.` : null),
  },
  "bm.worstDay": {
    title: "Worst day",
    what: "The single worst one-day change in the period.",
    read: "Closer to 0% is better. It shows how sharp a bad day can be.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `The portfolio's worst day was ${pct(n(c.p)!)}; ${bench(c)}'s was ${pct(n(c.b)!)}.` : null),
  },
  "bm.worstMonth": {
    title: "Worst month",
    what: "The worst change from one month-end to the next in the period.",
    read: "Closer to 0% is better. It shows how rough a bad month can be.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `The portfolio's worst month was ${pct(n(c.p)!)}; ${bench(c)}'s was ${pct(n(c.b)!)}.` : null),
  },
  "bm.totalReturn": {
    title: "Total return",
    what: "How much the value changed from the start to the end of the period. This is a back-test: today's stocks, bought at the start of the period.",
    read: "Higher is better, but past results do not predict future ones, and a higher return usually came with bigger swings.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `Over ${win(c)}, the portfolio ${move(n(c.p)!)}, while ${bench(c)} ${move(n(c.b)!)}.` : null),
  },
  "bm.cagr": {
    title: "Annualised return",
    what: "The steady yearly rate that would give the same total change over the period. For example, 21% over two years is about 10% a year.",
    read: "It makes periods of different length comparable. Higher is better, with the same caveat: it is the past.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `That works out to about ${pct(n(c.p)!)} a year for the portfolio and ${pct(n(c.b)!)} a year for ${bench(c)}.` : null),
  },
  "bm.sharpe": {
    title: "Sharpe ratio",
    what: "The return above a risk-free rate (a safe short-term government bill), divided by the volatility. It tells how much return you got for each unit of risk.",
    read: "Higher is better. Below 0 means it earned less than the safe alternative. Compare it with the benchmark rather than reading it alone.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `The portfolio's return above the risk-free rate was ${num(n(c.p)!)} times its volatility; ${bench(c)}'s was ${num(n(c.b)!)} times.` : null),
  },
  "bm.sortino": {
    title: "Sortino ratio",
    what: "Like the Sharpe ratio, but it only counts the downward swings as risk, not the upward ones.",
    read: "Higher is better. It is useful when a portfolio's ups are bigger than its downs.",
    example: (c) => (n(c.p) !== null && n(c.b) !== null ? `The portfolio scored ${num(n(c.p)!)} and ${bench(c)} ${num(n(c.b)!)}.` : null),
  },
  "bm.beta": {
    title: "Beta vs benchmark",
    what: "How strongly the portfolio moved together with the benchmark. A beta of 1.0 means it moved as much as the benchmark.",
    read: "Above 1 means bigger swings than the benchmark; below 1 means calmer.",
    example: (c) => (n(c.p) !== null ? `With a beta of ${num(n(c.p)!)}, when ${bench(c)} moved 10%, the portfolio tended to move about ${num(n(c.p)! * 10, 1)}%.` : null),
  },
  "bm.correlation": {
    title: "Correlation",
    what: "How closely the portfolio's day-to-day moves line up with the benchmark's, from -1 to 1. A value of 1 means they moved in lockstep.",
    read: "Closer to 1 means the portfolio behaves like the benchmark; lower means it moved more on its own.",
    example: (c) => (n(c.p) !== null ? `A correlation of ${num(n(c.p)!)} means the portfolio ${n(c.p)! >= 0.9 ? "moved almost in step with" : n(c.p)! >= 0.6 ? "moved fairly closely with" : "moved quite differently from"} ${bench(c)}.` : null),
  },
  "bm.trackingError": {
    title: "Tracking error",
    what: "How much the portfolio's returns differ from the benchmark's, shown as a yearly percentage.",
    read: "Lower means it behaves more like the benchmark; higher means it follows its own path.",
    example: (c) => (n(c.p) !== null ? `The portfolio typically drifted about ${pct(n(c.p)!)} a year away from ${bench(c)}.` : null),
  },
  "bm.upCapture": {
    title: "Up-capture",
    what: "On the days the benchmark rose, how much of its average gain the portfolio captured.",
    read: "Above 100% means it gained more than the benchmark on up days; below 100% means less.",
    example: (c) => (n(c.p) !== null ? `On days ${bench(c)} rose, the portfolio captured ${pct(n(c.p)!, 0)} of its average gain.` : null),
  },
  "bm.downCapture": {
    title: "Down-capture",
    what: "On the days the benchmark fell, how much of its average loss the portfolio took.",
    read: "Below 100% is better: it lost less than the benchmark on down days.",
    example: (c) => (n(c.p) !== null ? `On days ${bench(c)} fell, the portfolio took ${pct(n(c.p)!, 0)} of its average loss.` : null),
  },

  /* ---- benchmark comparison: diversification ---- */
  "div.holdingsCount": {
    title: "Number of holdings",
    what: "How many different stocks the portfolio holds, next to how many stocks the benchmark index holds.",
    read: "More holdings spread the risk, but similar stocks add less than different ones.",
    example: (c) => (n(c.p) !== null ? `The portfolio holds ${num(n(c.p)!, 0)} stocks${typeof c.bText === "string" && c.bText !== "-" ? `; the benchmark holds ${c.bText}` : ""}.` : null),
  },
  "div.effectiveN": {
    title: "Effective number of holdings",
    what: "How many equal-sized holdings the portfolio behaves like. If one stock is much bigger than the others, it is lower than the real count.",
    read: "The closer it is to the real number of holdings, the more evenly your money is spread.",
    example: (c) => (n(c.p) !== null ? `The portfolio behaves like ${num(n(c.p)!, 1)} equal-sized holdings.` : null),
  },
  "div.top1": {
    title: "Largest holding",
    what: "The share of the portfolio in its single biggest stock.",
    read: "Lower means less depends on one company.",
    example: (c) => (n(c.p) !== null ? `${pct(n(c.p)!)} of the portfolio is in its biggest stock.` : null),
  },
  "div.top3": {
    title: "Top 3 holdings",
    what: "The share of the portfolio in its three biggest stocks together.",
    read: "Lower means less depends on a few companies.",
    example: (c) => (n(c.p) !== null ? `${pct(n(c.p)!)} of the portfolio is in its three biggest stocks.` : null),
  },
  "div.sectors": {
    title: "Sectors covered",
    what: "How many different industries (sectors) the stocks come from.",
    read: "More sectors mean a bad stretch in one industry hurts less.",
    example: (c) => (n(c.p) !== null ? `The portfolio covers ${num(n(c.p)!, 0)} ${n(c.p) === 1 ? "sector" : "sectors"}.` : null),
  },
  "div.maxSector": {
    title: "Largest sector",
    what: "The share of the portfolio in its biggest industry, next to the same figure for the benchmark.",
    read: "Lower means less depends on one industry. Compare it with the benchmark's figure.",
    example: (c) => (n(c.p) !== null ? `${pct(n(c.p)!)} of the portfolio is in its biggest sector${n(c.b) !== null ? `, compared with ${pct(n(c.b)!)} in ${bench(c)}` : ""}.` : null),
  },
  "div.avgCorr": {
    title: "Average pairwise correlation",
    what: "How closely the stocks in the portfolio move together on average, from -1 to 1.",
    read: "Lower is better for spreading risk: stocks that do not all move together soften each other's bad days.",
    example: (c) => (n(c.p) !== null ? `An average of ${num(n(c.p)!)} means the stocks ${n(c.p)! >= 0.6 ? "tend to move together a lot" : n(c.p)! >= 0.3 ? "move together to a moderate degree" : "do not move together much"}.` : null),
  },
  "div.divRatio": {
    title: "Diversification ratio",
    what: "The average volatility of the individual stocks divided by the volatility of the whole portfolio.",
    read: "Higher means diversification is doing more work: the portfolio is calmer than its stocks are on their own. 1.0 means no benefit.",
    example: (c) => (n(c.p) !== null ? `At ${num(n(c.p)!)}, the portfolio's swings are about ${pct(1 - 1 / Math.max(n(c.p)!, 1), 0)} smaller than the stocks' average swings.` : null),
  },
};

/** the key for a "Why this match" row, from the label the recommendation engine puts on it */
const DRIVER_KEY_BY_LABEL: Record<string, string> = {
  "Return on equity": "roe",
  "Operating margin": "opMargin",
  "Free-cash-flow margin": "fcfMargin",
  "Liabilities to equity": "debtToEquity",
  "Profitable years (last 3)": "earningsStability",
  "P/E (latest fiscal year)": "pe",
  "Price to sales": "ps",
  "Price to book": "pb",
  "Free-cash-flow yield": "fcfYield",
  "Revenue growth (year on year)": "revGrowth",
  "Revenue growth (3-year annualised)": "rev3yCAGR",
  "EPS growth (year on year)": "epsGrowth",
  "12-1 month price momentum": "mom12_1",
  "6-month price momentum": "mom6",
  "Price vs 200-day average": "above200dma",
  "1-year volatility": "vol1y",
  "Beta vs the S&P 500 ETF (3 years)": "beta3y",
  "1-year maximum drawdown": "maxDD",
  "Dividend yield": "divYield",
  "Dividend payout at or below 70%": "payoutOk",
  "Pays a dividend": "paysDividend",
};

/** the number behind a driver: its raw value, or, for older saved results without one, the one read back from its text ("103.0%" -> 1.03) */
export function driverNumber(d: { value: string; rawValue?: number | null }): number | null {
  if (typeof d.rawValue === "number" && Number.isFinite(d.rawValue)) return d.rawValue;
  const text = d.value.trim();
  const m = /^(-?\d+(?:\.\d+)?)(%?)$/.exec(text.replace(/,/g, ""));
  if (!m) return text === "yes" ? 1 : text === "no" ? 0 : null;
  return m[2] ? Number(m[1]) / 100 : Number(m[1]);
}

export const DRIVER_LABELS = Object.keys(DRIVER_KEY_BY_LABEL);
export const INFO_KEYS = Object.keys(ENTRIES);

export function driverInfoKey(label: string): string | null {
  return DRIVER_KEY_BY_LABEL[label] ?? null;
}

/** the explanation for a metric, or null when there is none for that key */
export function metricInfo(key: string | null, ctx: InfoCtx = {}): MetricInfo | null {
  const e = key ? ENTRIES[key] : undefined;
  if (!e) return null;
  return { title: e.title, what: e.what, read: e.read, example: e.example ? e.example(ctx) : null };
}
