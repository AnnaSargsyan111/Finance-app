/**
 * English texts of the "metrics" area: the explanations behind the "i" buttons (what it is, how to read it, the example) and the
 * Portfolio vs Benchmark section of the investment result.
 *
 * Every metric has `title`, `what`, `read` and `example`. `example` is a complete sentence built from the numbers of the result on screen;
 * the caller formats the numbers (amounts, percentages) and passes them as {placeholders}. Where the sentence depends on the numbers
 * ("gained" or "lost", with or without a dram amount) there is one complete sentence per case (`exampleDown`, `exampleAmd`, ...) and the
 * code only chooses between them. Short extra sentences (`costNote`, `bandNote`) are appended after a space as a separate sentence.
 */
export const metrics = {
  /* ---- pieces used by several explanations ---- */
  shared: {
    thisStock: "This stock",
    thePeriod: "the period",
    theBenchmark: "the benchmark",
    /** appended as its own sentence to the "Why this match" examples */
    rank: "On this measure it ranks in the top {top}% of the eligible stocks we compared.",
  },
  /** the comparison window as it reads inside a sentence ("Over the last year, ...") */
  period: {
    "1M": "the last month",
    "3M": "the last 3 months",
    "6M": "the last 6 months",
    "1Y": "the last year",
    "3Y": "the last 3 years",
    "5Y": "the last 5 years",
  },
  /** the popover */
  tip: {
    whatItIs: "What it is",
    howToRead: "How to read it",
    inThisResult: "In this result",
  },

  /* ---- the single-stock card ---- */
  price: {
    title: "Price per share",
    what: "The latest price of one share of the company, in US dollars.",
    read: "A higher price does not mean a better or a worse company. It only decides how many whole shares your amount can buy.",
    example: "One share of {name} costs {price}.",
  },
  shares: {
    title: "Shares for your amount",
    what: "How many whole shares your amount buys at the current price. Only whole shares are counted.",
    read: "More shares is not better by itself: it depends on the price. Whatever cannot buy another whole share stays as cash.",
    example: (p: Record<string, string | number>) => `${p.cost} buys ${p.shares} ${p.count === 1 ? "share" : "shares"} of ${p.name} at ${p.price} each.`,
  },
  cost: {
    title: "Cost",
    what: "The total price of the shares: the number of shares times the price per share, in US dollars, with the dram amount at the CBA rate below it.",
    read: "It is usually a little less than the amount you entered, because you cannot buy part of a share.",
    example: "{shares} × {price} = {cost}.",
    exampleAmd: "{shares} × {price} = {cost} ({amd}).",
  },
  cashLeft: {
    title: "Cash left over",
    what: "The part of your amount that cannot buy another whole share.",
    read: "A small leftover is normal. It stays with you as cash and is not invested.",
    example: "Another share of {name} would cost {price}, more than the {leftUsd} left, so {leftAmd} stays uninvested.",
  },
  vol1y: {
    title: "1-year volatility",
    what: "How much the share price moved up and down over the past year, as a yearly percentage. It measures the size of the swings, not their direction.",
    read: "Lower means a calmer ride; higher means bigger ups and downs. It describes the past and is not a forecast.",
    example: "{name}'s price has typically swung about {vol} over a year.",
    costNote: "On {cost}, a swing of that size is about {swing} up or down.",
  },
  maxDD: {
    title: "1-year maximum drawdown",
    what: "The biggest fall from a peak to a later low during the past year.",
    read: "Closer to 0% is better. For example, -20% means that at its worst moment the price was 20% below its earlier high.",
    example: "At its worst, {name} fell {drawdown} from a high.",
    costNote: "On {cost} that would be about {loss} lost on paper at the low point.",
  },

  /* ---- allocated / left over (both result types) ---- */
  allocated: {
    title: "Allocated",
    what: "The part of your amount that is used to buy whole shares.",
    read: "It is a little less than the amount you entered, because part of a share cannot be bought.",
    example: "Of your {input}, {allocated} is used to buy shares.",
  },
  unallocated: {
    title: "Unallocated cash",
    what: "What is left of your amount after buying whole shares.",
    read: "A small remainder is normal. It is not invested.",
    example: "{unallocated} of your {input} stays uninvested.",
  },
  matchScore: {
    title: "Match score",
    what: "A score from 0 to 100 for how well this recommendation fits the answers you gave: your risk level and your investment horizon.",
    read: "Higher means a closer fit. It is a fit score, not a probability of making money and not an expected return.",
    example: "Your score is {score} out of 100.",
  },

  /* ---- "Why this match": the measures a stock can stand out on ---- */
  roe: {
    title: "Return on equity",
    what: "Yearly profit divided by the money shareholders have put into the company (its equity). It shows how much profit the company makes from each dollar of shareholders' money.",
    read: "Higher is better. Be a little careful with very high values: they can appear when a company has little equity left, for example after heavy borrowing or buying back its own shares.",
    example: "{name}'s return on equity is {roe}: about {profit} of yearly profit for every $1 of shareholders' equity.",
  },
  opMargin: {
    title: "Operating margin",
    what: "The share of sales left as profit from running the business, before interest and taxes.",
    read: "Higher is better: the company keeps more of each sale. Margins differ a lot between industries, so compare similar businesses.",
    example: "Of every $100 {name} sells, about {amount} remains as operating profit.",
  },
  fcfMargin: {
    title: "Free-cash-flow margin",
    what: "The cash left after paying running costs and investing in equipment, as a share of sales.",
    read: "Higher is better. It is real cash, so it is harder to flatter than accounting profit.",
    example: "Of every $100 {name} sells, about {amount} ends up as free cash.",
  },
  debtToEquity: {
    title: "Liabilities to equity",
    what: "Compares everything the company owes (its liabilities) with the shareholders' stake (its equity).",
    read: "Lower generally means less reliance on borrowed money and more cushion in a bad year. Some businesses, such as banks and real-estate companies, normally carry more.",
    example: "{name} owes about {amount} for every $1 of shareholders' equity.",
  },
  earningsStability: {
    title: "Profitable years (last 3)",
    what: "The share of the last three financial years in which the company made a profit.",
    read: "100% means it was profitable in all three years. Steadier profits are better.",
    example: "{name} was profitable in {years} of the last 3 years.",
  },
  pe: {
    title: "P/E (latest fiscal year)",
    what: "The price/earnings ratio: the share price divided by the company's profit per share in its latest financial year. It shows how many dollars investors pay for each $1 of yearly profit.",
    read: "Lower can mean cheaper compared with profit, but a low P/E can also mean the market expects trouble or slow growth. Compare similar companies.",
    example: "At {pe}, investors pay about {amount} for each $1 of {name}'s yearly profit.",
  },
  ps: {
    title: "Price to sales",
    what: "The company's total market value divided by its yearly sales: what you pay for each $1 of sales.",
    read: "Lower means cheaper relative to sales. Profitability matters too, so read it together with the margins.",
    example: "Investors pay about {amount} for each $1 of {name}'s yearly sales.",
  },
  pb: {
    title: "Price to book",
    what: "The share price divided by the company's book value per share, which is what would be left if you subtracted its debts from everything it owns.",
    read: "Lower can mean cheaper compared with net assets. It is most useful for businesses that own a lot of assets, and says less for companies that own little.",
    example: "Investors pay about {amount} for each $1 of {name}'s net assets.",
  },
  fcfYield: {
    title: "Free-cash-flow yield",
    what: "The cash the business generates in a year (free cash flow) divided by its market value.",
    read: "Higher is better, a bit like a higher interest rate on what you pay for the company.",
    example: "{name} generates about {amount} of free cash flow a year for every $100 of company value.",
  },
  revGrowth: {
    title: "Revenue growth (year on year)",
    what: "How much the company's sales grew compared with the previous year.",
    read: "Higher is better, especially if profits grow too. A negative number means sales shrank.",
    example: "{name}'s sales grew by {change} compared with the year before.",
    exampleDown: "{name}'s sales fell by {change} compared with the year before.",
  },
  rev3yCAGR: {
    title: "Revenue growth (3-year annualised)",
    what: "The steady yearly growth rate of the company's sales over the last three years (the compound annual growth rate).",
    read: "Higher is better. Looking at three years smooths out a single unusual year.",
    example: "{name}'s sales grew by about {change} a year on average over three years.",
    exampleDown: "{name}'s sales fell by about {change} a year on average over three years.",
  },
  epsGrowth: {
    title: "EPS growth (year on year)",
    what: "Earnings per share (EPS) is profit divided by the number of shares. This is how much it grew compared with the previous year.",
    read: "Higher is better. A very large jump often follows a weak year, so read it together with the other numbers.",
    example: "{name}'s profit per share rose by {change} compared with the year before.",
    exampleDown: "{name}'s profit per share fell by {change} compared with the year before.",
  },
  mom12_1: {
    title: "12-1 month price momentum",
    what: "How much the share price rose or fell over the past 12 months, leaving out the most recent month.",
    read: "Higher means a stronger recent trend. It describes the past only and does not predict the future.",
    example: "Over that period {name}'s price rose {change}.",
    exampleDown: "Over that period {name}'s price fell {change}.",
  },
  mom6: {
    title: "6-month price momentum",
    what: "How much the share price rose or fell over the past six months.",
    read: "Higher means a stronger recent trend. It describes the past only and does not predict the future.",
    example: "Over the past six months {name}'s price rose {change}.",
    exampleDown: "Over the past six months {name}'s price fell {change}.",
  },
  above200dma: {
    title: "Price vs 200-day average",
    what: "How far today's price is above or below its average over the last 200 trading days, about ten months.",
    read: "Above the average (a positive number) suggests an uptrend; below it suggests a downtrend. It is a trend gauge, not a forecast.",
    example: "{name}'s price is {change} above its 200-day average.",
    exampleDown: "{name}'s price is {change} below its 200-day average.",
  },
  beta3y: {
    title: "Beta vs the S&P 500 ETF (3 years)",
    what: "How strongly the stock has moved together with the overall US market (an S&P 500 fund) over three years. A beta of 1.0 means it moved about as much as the market.",
    read: "Above 1 means bigger swings than the market; below 1 means calmer. It is not good or bad: it shows the kind of ride to expect.",
    example: "With a beta of {beta}, when the market moved 10%, {name} tended to move about {moved}%.",
  },
  divYield: {
    title: "Dividend yield",
    what: "The dividends a company pays in a year, per share, as a share of the share price.",
    read: "Higher means more cash income, but a very high yield can be a warning sign. Dividends are not guaranteed.",
    example: "At today's price, {name} pays about {amount} in dividends a year for every $1,000 invested.",
  },
  payoutOk: {
    title: "Dividend payout at or below 70%",
    what: "The payout ratio is the share of profit a company pays out as dividends. This check passes when it is 70% or lower.",
    read: "Passing means the company keeps enough profit to keep paying, so the dividend is more likely to last.",
    example: "{name} passes this check.",
  },
  paysDividend: {
    title: "Pays a dividend",
    what: "Whether the company pays a regular dividend: a share of its profit paid out in cash to shareholders.",
    read: "Yes means shareholders receive cash income on top of any change in the share price.",
    example: "{name} pays a dividend.",
  },

  /* ---- portfolio characteristics ---- */
  holdingsCount: {
    title: "Holdings",
    what: "How many different stocks the portfolio is split across.",
    read: "More holdings spread the risk, but only up to a point: many similar stocks can be less diversified than a few different ones.",
    example: "Your portfolio holds {count} stocks.",
  },
  weightedBeta: {
    title: "Weighted beta",
    what: "The average beta of the stocks, weighted by how much of your money is in each. Beta shows how strongly a stock moves with the overall US market; 1.0 means about the same as the market.",
    read: "Above 1 means bigger swings than the market; below 1 means calmer.",
    example: "With a weighted beta of {beta}, when the market moved 10%, this portfolio tended to move about {moved}%.",
  },
  estimatedVolatility: {
    title: "Estimated volatility",
    what: "An estimate of how much the whole portfolio's value would swing in a year, based on the past year of prices. It accounts for stocks that move together or offset each other.",
    read: "Lower means a calmer ride. The portfolio is built to stay within a limit set by your risk level. It describes the past and is not a forecast.",
    example: "A swing of about {vol} a year.",
    exampleAmount: "A swing of about {vol} a year is roughly {swing} up or down on your {base}.",
    bandNote: "Your risk level allows up to {band}.",
  },
  portfolioDividendYield: {
    title: "Dividend yield",
    what: "The dividends the portfolio's stocks pay in a year, as a share of what you invest, averaged by amount.",
    read: "Higher means more cash income. Dividends are not guaranteed and can change.",
    example: "If payouts stay the same, about {amount} a year on your {base}.",
  },
  effectiveN: {
    title: "Effective holdings",
    what: "How many equal-sized holdings the portfolio behaves like. If one stock is much bigger than the others, this is lower than the real number of holdings.",
    read: "The closer it is to the number of holdings, the more evenly your money is spread.",
    example: "Your money is spread like {effective} equal-sized ones.",
    exampleCount: "{count} holdings, but your money is spread like {effective} equal-sized ones.",
  },

  /* ---- holdings table headers ---- */
  allocation: {
    title: "Allocation",
    what: "The share of your amount that goes into each stock. A target is the planned share; because only whole shares can be bought, the real share is slightly different.",
    read: "All the shares add up to about 100%, with a little cash left over.",
    example: "{name} gets {percent} of your amount.",
    exampleAmd: "{name} gets {percent} of your amount, about {amount}.",
  },
  sharesCol: {
    title: "Shares",
    what: "How many whole shares of each stock the amount buys.",
    read: "Only whole shares are counted, which is why the real allocation is slightly different from the target.",
    example: (p: Record<string, string | number>) => `${p.shares} ${p.count === 1 ? "share" : "shares"} of ${p.name} at ${p.price} each.`,
  },
  reasons: {
    title: "Reasons",
    what: "The two things that stood out most for each stock when it was scored, with their values.",
    read: "Each reason is a measure from the scoring, such as profitability or low risk. Open the explanation of a measure to see what it means.",
    example: "For {name}: {text}.",
  },

  /* ---- benchmark comparison: performance and risk (keys "bm.<name>") ---- */
  bm: {
    annualisedVolatility: {
      title: "Volatility (annualised)",
      what: "How much the value moved up and down, shown as a yearly percentage. It is the typical size of the swings, not their direction.",
      read: "Lower means a smoother ride; higher means bigger ups and downs.",
      example: "Over {window}, the portfolio typically swung about {p} a year; {bench} about {b}.",
    },
    maxDrawdown: {
      title: "Max drawdown",
      what: "The biggest fall from a peak to a later low within the period.",
      read: "Closer to 0% is better. For example, -20% means that at its worst the value was 20% below its earlier high.",
      example: "Over {window}, the portfolio's worst fall from a high was {p}; {bench}'s was {b}.",
    },
    worstDay: {
      title: "Worst day",
      what: "The single worst one-day change in the period.",
      read: "Closer to 0% is better. It shows how sharp a bad day can be.",
      example: "The portfolio's worst day was {p}; {bench}'s was {b}.",
    },
    worstMonth: {
      title: "Worst month",
      what: "The worst change from one month-end to the next in the period.",
      read: "Closer to 0% is better. It shows how rough a bad month can be.",
      example: "The portfolio's worst month was {p}; {bench}'s was {b}.",
    },
    totalReturn: {
      title: "Total return",
      what: "How much the value changed from the start to the end of the period. This is a back-test: today's stocks, bought at the start of the period.",
      read: "Higher is better, but past results do not predict future ones, and a higher return usually came with bigger swings.",
      example: "Over {window}, the portfolio gained {p}, while {bench} gained {b}.",
      exampleUpDown: "Over {window}, the portfolio gained {p}, while {bench} lost {b}.",
      exampleDownUp: "Over {window}, the portfolio lost {p}, while {bench} gained {b}.",
      exampleDownDown: "Over {window}, the portfolio lost {p}, while {bench} lost {b}.",
    },
    cagr: {
      title: "Annualised return",
      what: "The steady yearly rate that would give the same total change over the period. For example, 21% over two years is about 10% a year.",
      read: "It makes periods of different length comparable. Higher is better, with the same caveat: it is the past.",
      example: "That works out to about {p} a year for the portfolio and {b} a year for {bench}.",
    },
    sharpe: {
      title: "Sharpe ratio",
      what: "The return above a risk-free rate (a safe short-term government bill), divided by the volatility. It tells how much return you got for each unit of risk.",
      read: "Higher is better. Below 0 means it earned less than the safe alternative. Compare it with the benchmark rather than reading it alone.",
      example: "The portfolio's return above the risk-free rate was {p} times its volatility; {bench}'s was {b} times.",
    },
    sortino: {
      title: "Sortino ratio",
      what: "Like the Sharpe ratio, but it only counts the downward swings as risk, not the upward ones.",
      read: "Higher is better. It is useful when a portfolio's ups are bigger than its downs.",
      example: "The portfolio scored {p} and {bench} {b}.",
    },
    beta: {
      title: "Beta vs benchmark",
      what: "How strongly the portfolio moved together with the benchmark. A beta of 1.0 means it moved as much as the benchmark.",
      read: "Above 1 means bigger swings than the benchmark; below 1 means calmer.",
      example: "With a beta of {p}, when {bench} moved 10%, the portfolio tended to move about {moved}%.",
    },
    correlation: {
      title: "Correlation",
      what: "How closely the portfolio's day-to-day moves line up with the benchmark's, from -1 to 1. A value of 1 means they moved in lockstep.",
      read: "Closer to 1 means the portfolio behaves like the benchmark; lower means it moved more on its own.",
      example: "A correlation of {p} means the portfolio moved almost in step with {bench}.",
      exampleMid: "A correlation of {p} means the portfolio moved fairly closely with {bench}.",
      exampleLow: "A correlation of {p} means the portfolio moved quite differently from {bench}.",
    },
    trackingError: {
      title: "Tracking error",
      what: "How much the portfolio's returns differ from the benchmark's, shown as a yearly percentage.",
      read: "Lower means it behaves more like the benchmark; higher means it follows its own path.",
      example: "The portfolio typically drifted about {p} a year away from {bench}.",
    },
    upCapture: {
      title: "Up-capture",
      what: "On the days the benchmark rose, how much of its average gain the portfolio captured.",
      read: "Above 100% means it gained more than the benchmark on up days; below 100% means less.",
      example: "On days {bench} rose, the portfolio captured {p} of its average gain.",
    },
    downCapture: {
      title: "Down-capture",
      what: "On the days the benchmark fell, how much of its average loss the portfolio took.",
      read: "Below 100% is better: it lost less than the benchmark on down days.",
      example: "On days {bench} fell, the portfolio took {p} of its average loss.",
    },
  },

  /* ---- benchmark comparison: diversification (keys "div.<name>") ---- */
  div: {
    holdingsCount: {
      title: "Number of holdings",
      what: "How many different stocks the portfolio holds, next to how many stocks the benchmark index holds.",
      read: "More holdings spread the risk, but similar stocks add less than different ones.",
      example: "The portfolio holds {p} stocks.",
      exampleBench: "The portfolio holds {p} stocks; the benchmark holds {bText}.",
    },
    effectiveN: {
      title: "Effective number of holdings",
      what: "How many equal-sized holdings the portfolio behaves like. If one stock is much bigger than the others, it is lower than the real count.",
      read: "The closer it is to the real number of holdings, the more evenly your money is spread.",
      example: "The portfolio behaves like {p} equal-sized holdings.",
    },
    top1: {
      title: "Largest holding",
      what: "The share of the portfolio in its single biggest stock.",
      read: "Lower means less depends on one company.",
      example: "{p} of the portfolio is in its biggest stock.",
    },
    top3: {
      title: "Top 3 holdings",
      what: "The share of the portfolio in its three biggest stocks together.",
      read: "Lower means less depends on a few companies.",
      example: "{p} of the portfolio is in its three biggest stocks.",
    },
    sectors: {
      title: "Sectors covered",
      what: "How many different industries (sectors) the stocks come from.",
      read: "More sectors mean a bad stretch in one industry hurts less.",
      example: (p: Record<string, string | number>) => `The portfolio covers ${p.p} ${p.count === 1 ? "sector" : "sectors"}.`,
    },
    maxSector: {
      title: "Largest sector",
      what: "The share of the portfolio in its biggest industry, next to the same figure for the benchmark.",
      read: "Lower means less depends on one industry. Compare it with the benchmark's figure.",
      example: "{p} of the portfolio is in its biggest sector.",
      exampleBench: "{p} of the portfolio is in its biggest sector, compared with {b} in {bench}.",
    },
    avgCorr: {
      title: "Average pairwise correlation",
      what: "How closely the stocks in the portfolio move together on average, from -1 to 1.",
      read: "Lower is better for spreading risk: stocks that do not all move together soften each other's bad days.",
      example: "An average of {p} means the stocks tend to move together a lot.",
      exampleMid: "An average of {p} means the stocks move together to a moderate degree.",
      exampleLow: "An average of {p} means the stocks do not move together much.",
    },
    divRatio: {
      title: "Diversification ratio",
      what: "The average volatility of the individual stocks divided by the volatility of the whole portfolio.",
      read: "Higher means diversification is doing more work: the portfolio is calmer than its stocks are on their own. 1.0 means no benefit.",
      example: "At {p}, the portfolio's swings are about {smaller} smaller than the stocks' average swings.",
    },
  },

  /* ---- the Portfolio vs Benchmark section ---- */
  benchmark: {
    title: "Portfolio vs Benchmark",
    eyebrow: "Hypothetical back-test",
    loading: "Loading comparison",
    timeframe: "Timeframe",
    /** the timeframe buttons */
    window: { "1M": "1M", "3M": "3M", "6M": "6M", "1Y": "1Y", "3Y": "3Y", "5Y": "5Y" },
    noteStrong: "Hypothetical back-test of today's selection using historical prices. Not a forecast; past performance does not guarantee future results.",
    noteRest: "The benchmark is a reference, not a recommendation.",
    errorTitle: "We couldn't load the comparison",
    retry: "Retry",
    emptyTitle: "No comparison available",
    emptyMessage: "There isn't enough price history for these holdings to draw a comparison.",
    shortTitle: "Not enough history",
    shortMessage: "These holdings don't have enough price history for this timeframe. Try a shorter one.",
    truncated: "Showing {start} to {end}, which is shorter than the {window} you chose because some holdings have less price history.",
    /** "S&P 500 ETF: reference only, not a recommendation." */
    footNote: "{label}: {note}",
    footNoteDefault: "reference only, not a recommendation.",

    portfolioName: "Recommended Portfolio",
    benchmarkName: "Benchmark",
    legendPortfolio: "Recommended Portfolio (solid)",
    legendBenchmark: "Benchmark: {label} (dashed)",
    legendStart: "Both start at 100",
    chartSummary: "Recommended Portfolio versus benchmark over {window}, both rebased to 100 on {first}. On {last} the portfolio stands at {portfolio} and the benchmark at {benchmark}. Hypothetical back-test; not a forecast.",
    tableCaption: "Rebased values over time (start = 100)",
    colDate: "Date",
    colPortfolio: "Recommended Portfolio",
    colBenchmark: "Benchmark",

    perfTitle: "Performance and risk",
    perfCaption: "Portfolio and benchmark metrics over {window}",
    colMetric: "Metric",
    colMeasure: "Measure",
    colSector: "Sector",
    headPortfolio: "Portfolio",
    headBenchmark: "Benchmark",

    divTitle: "Diversification",
    divCaption: "Diversification of the portfolio compared with the benchmark",
    sectorExposure: "Sector exposure vs benchmark",
    indexMembers: "{n} (index members)",

    /** server texts shown through the dictionary when they match exactly (otherwise the server text is shown) */
    server: {
      disclaimer1: "Hypothetical back-test of today's selection using historical prices. It is not a forecast; past performance does not guarantee future results.",
      disclaimer2: "Hindsight and selection bias: today's holdings were chosen with today's data, so their past looks flattering by construction.",
      disclaimer3: "Survivorship bias: the universe contains only the current S&P 500 members.",
      disclaimer4: "Costs, taxes, FX spreads and dividend withholding are not modelled. Dividends are included through adjusted closing prices.",
      disclaimer5: "The benchmark is shown for context only (reference only - not a recommendation). Risk measures such as volatility and drawdown matter as much as return.",
      benchmarkNote: "Reference only - not a recommendation.",
      truncatedNote: "The requested {window} window is longer than the history all holdings share; the comparison starts on {start}.",
    },
  },
} as const;
