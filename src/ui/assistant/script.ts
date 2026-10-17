/**
 * The scripted conversation engine of the AI Assistant prototype. No AI is called: every answer here is written text or comes
 * from the exact calculator (goal-plan.ts). It follows the behaviour rules in research/ai-assistant-plan.md:
 *  - facts about Armenia are only the verified ones (deposit guarantee, 10% tax on deposit interest, 5% tax on dividends);
 *  - no personal investment advice, no predictions, no live numbers (it points to the page that has them);
 *  - the savings-goal interview asks one question at a time and calculates as soon as it has an amount and a time.
 * The state lives in memory only (it is handed back and forth, nothing is stored).
 */
import { formatAmd } from "../lib/format";
import { STOCK_METRIC_INFO } from "../market/stock-metric-info";
import { respondHy } from "./script-hy";
import { LIMITS, checkPlanInput, durationLabel, monthsNeeded, netRatePct, planFor } from "./goal-plan";
import type { BotMessage, ChatMessage, Chip, ConvState } from "./types";

type Draft = Omit<BotMessage, "id" | "role">;

export const STARTER_CHIPS: Chip[] = [
  { label: "Plan my savings goal", value: "I want to plan a savings goal" },
  { label: "Are bank deposits protected?", value: "Are bank deposits protected in Armenia?" },
  { label: "How are interest and dividends taxed?", value: "How are interest and dividends taxed?" },
  { label: "What is P/E?", value: "What does P/E mean?" },
  { label: "What is inflation?", value: "What is inflation?" },
  { label: "Should I buy a stock?", value: "Should I buy a stock?" },
];

const WELCOME = "Hi, I'm the Finova Assistant. I can explain money and market terms, show how Finova works, and help you plan a savings goal. I can't give personal investment advice. What would you like to do?";

const INITIAL: ConvState = { n: 0, mode: "free", goalName: null, amount: null, months: null, saved: 0, income: null, ratePct: null, topic: null };

function finish(state: ConvState, drafts: Draft[]): { state: ConvState; messages: BotMessage[] } {
  const messages = drafts.map((d, i): BotMessage => ({ id: `b${state.n + i + 1}`, role: "bot", ...d }));
  return { state: { ...state, n: state.n + drafts.length }, messages };
}

export function initialConversation(): { state: ConvState; messages: ChatMessage[] } {
  const r = finish(INITIAL, [{ text: WELCOME, chips: STARTER_CHIPS }]);
  return { state: r.state, messages: r.messages };
}

/* ------------------------------------------------------------------ reading numbers out of free text */
const WORDS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, eighteen: 18, twenty: 20, thirty: 30 };
const MONEY_SRC = "(\\d{1,3}(?:[ ,\\u00a0]\\d{3})+|\\d+(?:[.,]\\d+)?)(?:\\s*(k|m|mn|mln|million|millions|thousand)\\b)?";
const PER_MONTH = "(?:\\s*(?:amd|dram|drams)\\b)?(?:\\s*(?:a|per|each|every)\\s*month\\b)?";

/** "3,000,000" "3 000 000" "500k" "3.5m" "3 million" -> 3000000 ... */
export function moneyValue(num: string, unit?: string): number {
  const grouped = /^\d{1,3}(?:[ , ]\d{3})+$/.test(num);
  const base = grouped ? Number(num.replace(/[ , ]/g, "")) : Number(num.replace(",", "."));
  const u = unit?.toLowerCase();
  return !u ? base : u === "k" || u === "thousand" ? base * 1e3 : base * 1e6;
}

/** "2 years", "18 months", "1.5 years", "in a year", "2 years 6 months" -> months; returns the text without the matched parts */
export function parseDuration(text: string): { months: number; rest: string } | null {
  let months = 0;
  let found = false;
  // "half a year" first, so that "a year" inside it is not counted as a whole year
  const halfRx = /\bhalf (a )?year\b/i;
  const withoutHalf = text.replace(halfRx, () => {
    months += 6;
    found = true;
    return " ";
  });
  const unitRx = new RegExp(`\\b(\\d+(?:[.,]\\d+)?|${Object.keys(WORDS).join("|")})\\s*(years?|yrs?|months?|mos?)\\b`, "gi");
  const rest = withoutHalf.replace(unitRx, (_m, n: string, unit: string) => {
    const v = /^\d/.test(n) ? Number(n.replace(",", ".")) : WORDS[n.toLowerCase()];
    months += /^y/i.test(unit) ? Math.round(v * 12) : Math.round(v);
    found = true;
    return " ";
  });
  return found ? { months, rest } : null;
}

export interface Slots {
  income?: number;
  saved?: number;
  /** the amount the person says they can put aside every month */
  monthly?: number;
  ratePct?: number;
  months?: number;
  amount?: number;
}

/** pulls income, already-saved, monthly saving, rate, time and the goal amount out of one sentence (each at most once) */
export function extractSlots(text: string): Slots {
  const out: Slots = {};
  let t = ` ${text} `;
  const take = (rx: RegExp, assign: (m: RegExpExecArray) => void) => {
    const m = rx.exec(t);
    if (!m) return;
    assign(m);
    t = t.replace(m[0], " ");
  };
  take(new RegExp(`(?:\\bearn|\\bearns|\\bearning|\\bincome(?: is| of)?|\\bsalary(?: is| of)?|\\bmake|\\bget paid)\\D{0,25}?(-?)${MONEY_SRC}${PER_MONTH}`, "i"), (m) => (out.income = (m[1] ? -1 : 1) * moneyValue(m[2], m[3])));
  take(new RegExp(`(?:\\balready (?:saved|have|got)|\\bhave saved|\\bsaved|\\bgot)\\D{0,20}?${MONEY_SRC}`, "i"), (m) => (out.saved = moneyValue(m[1], m[2])));
  take(new RegExp(`${MONEY_SRC}(?:\\s*(?:amd|dram|drams)\\b)?\\s*(?:a|per|each|every)\\s*month\\b`, "i"), (m) => (out.monthly = moneyValue(m[1], m[2])));
  take(/(\d+(?:[.,]\d+)?)\s*%/, (m) => (out.ratePct = Number(m[1].replace(",", "."))));
  const d = parseDuration(t);
  if (d) {
    out.months = d.months;
    t = d.rest;
  }
  const nums = [...t.matchAll(new RegExp(MONEY_SRC, "gi"))].map((m) => moneyValue(m[1], m[2])).filter((n) => Number.isFinite(n));
  if (nums.length) out.amount = Math.max(...nums);
  return out;
}

/** a bare answer to "how much?" */
function parseAmountOnly(text: string): number | null {
  const m = new RegExp(MONEY_SRC, "i").exec(text);
  return m ? moneyValue(m[1], m[2]) : null;
}

/* ------------------------------------------------------------------ what the person is asking */
const RX = {
  card: /(?:\d[ -]?){13,19}/,
  armenian: /[԰-֏]/g,
  reset: /^\s*(start over|new chat|reset|cancel|never ?mind)\s*[.!]?\s*$/i,
  injection: /(ignore (all |your |the |previous |these )?(rules|instructions)|hidden instructions|system prompt|reveal your (rules|prompt|instructions)|you are now|act as (a )?(licensed|financial)|pretend (to be|you))/i,
  otherUsers: /((another|other|someone else'?s?) (user|person|customer|client)'?s?\b.*(history|data|recommendation|balance|account))|(someone else'?s? (history|account|data|balance))/i,
  offTopic: /\b(poem|joke|song|weather|recipe|football|movie|story|horoscope)\b/i,
  plan: /\b(savings? (goal|plan)|plan (my|a|the) (savings?|goal)|save (up )?for|saving for|want to save|need to save|how much (should|do|must|can) i (save|put aside|set aside)|how much (per|a|each) month|put aside|set aside|afford)\b|\b(want|plan|need|going|hope) to (buy|get|purchase|afford|save)\b|\bcan i (buy|afford|get)\b[^.?!]*\b(in|within)\b[^.?!]*\b(year|month)/i,
  keepSavings: /\bwhere (should|can|to|do) i (keep|put|save|store)\b/i,
  advice: /\b(should i (buy|sell|invest|hold|get)|what (should|do) i (buy|invest|do with)|which (stock|share|fund)s?\b|best (stock|share|fund|investment)|recommend (me )?(a |some |an )?(stock|share|fund|investment|portfolio)|invest (my|\d)|portfolio for me|stock tip|give me (a |one )?tip)/i,
  timing: /\b(good|right|best|perfect) time\b|\bwhen (should|to) (i )?(buy|sell|exchange|convert)\b/i,
  currency: /\b(dollars?|usd|euros?|eur|lari|gel|rubles?|rub|dram|amd|currency|exchange)\b/i,
  predict: /\b(will (the )?[a-z ]{0,25}(rise|fall|grow|go up|go down|drop|crash|increase|decrease|be worth|win)|next (week|month|year)|from now|forecast|predict(ion)?s?)\b/i,
  live: /\b(rate|price|quote)\b[^.?!]{0,25}\b(today|now|current|currently|right now)\b|\b(today|current|latest)\b[^.?!]{0,20}\b(rate|price|news)\b|\bdollar rate\b|\bstock price\b|\bnews\b|\bhow much is\b[^.?!]*\b(usd|eur|dollars?|euros?|gel|lari|rub|rubles?)\b|\bwhich bank\b|\bbest rate\b/i,
  sure: /(definitely|for sure|certainly|guarantee|guaranteed|promise).{0,40}(reach|achieve|get|make|work|succeed|hit)|will i (definitely|certainly|surely)/i,
  example: /\b(examples?|for instance|e\.g\.|illustrate|demonstrate|worked out|show me how)\b/i,
  greeting: /^\s*(hi|hello|hey|hi there|good (morning|afternoon|evening)|help|what can you do|who are you|what do you do)\b/i,
};

function wantsPlan(text: string, slots: Slots): boolean {
  if (RX.plan.test(text)) return true;
  return slots.months !== undefined && slots.amount !== undefined && /\b(sav|buy|afford|need|want|reach|goal|get)/i.test(text);
}

/** "save for a car" / "buy an apartment" -> "a car" / "an apartment" */
function goalNameFrom(text: string): string | null {
  const m = /(?:\b(?:save|saving) for|\bbuy|\bpurchase|\bafford|\bget)\s+((?:a |an |my |the )?[a-z][a-z ]{1,28}?)(?=\s+(?:in|within|by|for|of|worth|costing|that|which|with)\b|[.,?!]|$)/i.exec(text);
  const name = m?.[1]?.trim().toLowerCase();
  return name && !/^(it|that|this|something|money)$/.test(name) ? name : null;
}

/* ------------------------------------------------------------------ written answers */
const MARKET_LINK = { href: "/market", label: "Open Market & News" } as const;
const INVEST_LINK = { href: "/invest", label: "Open Investment Recommendation" } as const;

const REPLIES = {
  card: "Please don't share card numbers, passwords or ID numbers here. I can't see any accounts and I don't need them. For your balance, use your bank's app or website.",
  injection: "I can't change my rules or share them, but I'm happy to explain a finance term, show how Finova works or help you plan a savings goal.",
  otherUsers: "I can't see anyone's account or stored data, including other users' recommendation history. This assistant has no access to Finova's stored information.",
  offTopic: "I can only help with money, markets and Finova. Would you like to plan a savings goal or learn a term?",
  advice: "I can't tell you what to buy or what to do with your money: that depends on your goal, how long you can leave the money and how much of a fall you could live with. Worth thinking about: your goal and time, spreading money across different investments, and costs and taxes. If your question is about shares, the Investment Recommendation page asks about your amount, risk and time and then suggests companies using fixed rules. It is information, not personal advice.",
  keepSavings: "I can't say which bank or product to use. In general people compare how easily they can reach the money, the interest offered (and the 10% tax on deposit interest in Armenia), whether the amount fits within the deposit guarantee limits (AMD 16 million in drams, AMD 7 million in foreign currency, per bank), and the currency they will spend in.",
  sure: "No one can guarantee it: income, prices and interest rates can change. The calculation shows what is needed if everything stays as assumed, so it is best used as a guide and checked from time to time.",
  timing: "Nobody can reliably say when a currency will be cheaper or dearer, so I can't say whether now is a good time. I can explain what moves exchange rates in general, or how the buy and sell rates differ.",
  predict: "I can't predict future prices, exchange rates or interest rates, and nobody can do it reliably. I can explain what usually influences them, or you can look at today's figures on the Market & News page.",
  live: "This prototype can't look up live numbers yet. The latest Central Bank rates, bank buy and sell rates, stock cards and news are on the Market & News page.",
  fallback: "I'm not sure how to answer that in this prototype. I can explain terms like P/E or inflation, tell you how bank deposits and taxes work in Armenia, show where to find live rates, or plan a savings goal. For anything about a specific law, tax or product, please check the official source.",
};

const TAX_INTEREST = "In Armenia an individual pays income tax of 10% on interest from bank deposits (Tax Code).";
const TAX_DIVIDEND = "Dividends paid to individuals are taxed at 5% (Tax Code). For dividends from foreign shares I'm not sure how the tax works, because the other country may tax them first, so please check with the State Revenue Committee.";
const TAX_NOTE = "Tax rules can change, so check the State Revenue Committee for the current rates.";

interface Faq {
  id: string;
  test: RegExp;
  text: string;
  link?: { href: string; label: string };
}

/** checked in this order: the first match wins */
const FAQS: Faq[] = [
  { id: "deposit-guarantee", test: /(deposit|bank|savings|money in (a|the) bank).{0,40}(protect|guarant|insur|safe|secure|fails|collapse|bankrupt)|(guarantee|protection) (fund|limit)|deposit guarantee/i, text: "In Armenia, bank deposits of individuals (including sole entrepreneurs) are guaranteed up to AMD 16 million for deposits in drams and AMD 7 million for deposits in foreign currency. The limits apply separately at each bank, and payouts are made in drams. Source: the Armenian Deposit Guarantee Fund (adgf.am). Limits can change, so check the Fund's website for the current figures." },
  { id: "tax-both", test: /tax.{0,40}(interest|deposit).{0,40}dividend|tax.{0,40}dividend.{0,40}(interest|deposit)|(interest|deposit).{0,30}and.{0,30}dividend.{0,30}tax/i, text: `${TAX_INTEREST} ${TAX_DIVIDEND} ${TAX_NOTE}` },
  { id: "tax-dividend", test: /tax.{0,30}dividend|dividend.{0,30}tax/i, text: `${TAX_DIVIDEND} ${TAX_NOTE}` },
  { id: "tax-interest", test: /tax.{0,30}(interest|deposit)|(interest|deposit).{0,30}tax/i, text: `${TAX_INTEREST} ${TAX_NOTE}` },
  { id: "yield-better", test: /higher dividend yield|high dividend yield|yield always better/i, text: "No, not automatically. A high yield can appear because a share price has fallen, and a company may not keep paying that dividend. It is worth looking at the company's profits and how much of them it pays out, not only the yield." },
  { id: "dividend-yield", test: /dividend yield/i, text: STOCK_METRIC_INFO.dividendYield.text },
  { id: "pe", test: /\bp\/?e\b|price[- ]to[- ]earnings/i, text: STOCK_METRIC_INFO.pe.text },
  { id: "eps", test: /\beps\b|earnings per share/i, text: STOCK_METRIC_INFO.eps.text },
  { id: "market-cap", test: /market cap/i, text: STOCK_METRIC_INFO.marketCap.text },
  { id: "previous-close", test: /previous close/i, text: STOCK_METRIC_INFO.previousClose.text },
  { id: "range52w", test: /52[- ]week/i, text: STOCK_METRIC_INFO.range52w.text },
  { id: "dividend", test: /\bdividends?\b/i, text: "A dividend is a share of a company's profit that it pays to its shareholders, usually in cash and on a regular schedule. A company is not obliged to pay one, and it can cut or stop it." },
  { id: "inflation", test: /inflation/i, text: "Inflation is the general rise of prices over time. When prices rise, the same amount of money buys less, so money kept as cash loses buying power if prices grow faster than the interest it earns." },
  { id: "diversification", test: /diversif/i, text: "Diversification means not putting all your money in one place: spreading it across different companies, kinds of investment and currencies, so that a problem with one hurts less. It lowers the effect of any single loss, but it doesn't remove risk." },
  { id: "compound", test: /compound/i, text: "Compound interest is interest earned on the interest you already earned, not only on your original amount. For example, 10,000 AMD at 5% a year becomes 10,500 AMD after year one and 11,025 AMD after year two, because year two's interest is calculated on 10,500 (an assumed rate, for illustration only)." },
  { id: "buy-sell", test: /(buy|sell).{0,20}rate|spread/i, text: "A bank buys foreign currency from you at its buy rate and sells it to you at its sell rate. The sell rate is higher, and the difference (the spread) is the bank's margin, which is why exchanging back and forth costs you. Finova shows both, for cash and non-cash, on the Market & News page.", link: MARKET_LINK },
  { id: "stocks-vs-deposit", test: /(stocks?|shares?)\b.{0,40}\b(or|vs\.?|versus)\b.{0,40}\b(deposits?|bonds?)|(deposits?|bonds?)\b.{0,40}\b(or|vs\.?|versus)\b.{0,40}\b(stocks?|shares?)/i, text: "They work differently, so neither is simply better. A bank deposit pays a stated interest and, in Armenia, is guaranteed up to AMD 16 million (drams) or AMD 7 million (foreign currency) per bank, but its return is usually modest and, after the 10% tax on interest, lower. Shares can grow more over long periods, but their price goes up and down, there is no guarantee and you can lose money. What suits a person depends on their goal, how long they can leave the money and how much of a fall they could live with." },
  { id: "dram-vs-dollars", test: /(dram|amd)\b.{0,20}\b(or|vs\.?|versus)\b.{0,20}\b(dollars?|usd)|(dollars?|usd)\b.{0,20}\b(or|vs\.?|versus)\b.{0,20}\b(dram|amd)/i, text: "Keeping savings in drams or in dollars carries different risks: if prices rise faster than the interest you earn, savings lose buying power, and if the exchange rate moves, the value of savings in the other currency changes too. A common thing to consider is the currency of your future spending. I can't say which is better for you." },
  { id: "rates-move", test: /(why|what).{0,30}(exchange rate|dram|dollar).{0,20}(move|change|fall|rise|weaken|strengthen)/i, text: "Exchange rates move with the supply and demand for each currency. In general they are influenced by inflation, interest rates, trade and money flows, central-bank decisions and news. I can explain these, but I can't predict where a rate will go." },
  { id: "stock-bond", test: /stock.{0,25}\bbond|\bbond.{0,25}stock|what is a (stock|share)\b|what is a bond/i, text: "A stock (share) makes you a part-owner of a company: its price can rise or fall and some companies pay dividends. A bond is a loan to a company or a government: it usually pays interest at set times and returns the amount at the end, but its price can move too and the issuer can fail to pay." },
  { id: "etf", test: /\betfs?\b|exchange[- ]traded fund/i, text: "An ETF (exchange-traded fund) holds many investments in one package and is bought and sold like a share. It gives instant diversification, but its value still goes up and down with what it holds, and it has costs." },
  { id: "risk-vol", test: /volatil|risk and (return|volatility)|risk vs/i, text: "Risk is the chance that you lose money or earn less than you hoped. Volatility is how much a price moves up and down: it shows how bumpy the ride is, but it is not the same as risk, because the real risk depends on your goal and how long you can wait." },
  { id: "drawdown", test: /drawdown/i, text: "A drawdown is the fall from a peak to a later low. If a price drops from 100 to 70, that is a 30% drawdown. It shows how bad a bad stretch has been." },
  { id: "available", test: /\bavailable\b/i, text: "On Personal Finance, \"Available\" is your income minus your expenses for the period you picked. It is not your bank balance.", link: { href: "/personal-finance", label: "Open Personal Finance" } },
  { id: "banks", test: /\b(which|what) banks\b|banks (are there|exist|in armenia)|(list|names) of banks|bank list/i, text: "Finova shows the exchange rates of three banks: Ameriabank, ACBA Bank and IDBank (from Rate.am), on the Market & News page. The full list of banks in Armenia is on the Central Bank of Armenia website (cba.am).", link: MARKET_LINK },
  { id: "recommendation", test: /investment recommendation|how does the recommendation/i, text: "The Investment Recommendation page asks about your amount, risk and time horizon and suggests companies from a wide list using fixed, published rules. It is information to help you think, not personal advice, and it does not know your whole situation.", link: INVEST_LINK },
  { id: "deposit", test: /(what is|what are|explain|define|meaning of).{0,15}\b(a |an )?(bank )?deposits?\b/i, text: "A bank deposit is money you leave in a bank on agreed terms, and the bank pays you interest for it. In Armenia the deposits of individuals are guaranteed up to a limit, and the interest is taxed at 10%." },
  { id: "interest-rate", test: /(what is|what are|explain|define|meaning of).{0,15}interest rates?\b/i, text: "An interest rate is the price of money: what you pay to borrow it, or what you earn for keeping it in a bank, shown as a percentage per year." },
  { id: "investment", test: /(what is|explain|define|meaning of).{0,15}\b(an? )?investments?\b/i, text: "An investment is money you put into something, such as a share, hoping it grows over time. It is not guaranteed: it can also lose value." },
  { id: "portfolio", test: /(what is|explain|define|meaning of).{0,15}\b(a |an )?portfolio\b/i, text: "A portfolio is everything you have invested, for example the shares of several companies together." },
  { id: "risk", test: /(what is|explain|define|meaning of).{0,15}\b(investment )?risk\b/i, text: "Risk is the chance that you lose money or earn less than you hoped. It also depends on how long you can wait." },
];

/**
 * A worked example for each explanation, shown when the person asks for one ("can you give an example?") or when the question already
 * contains the words "example" / "for instance". All numbers are invented and say so; the Armenian figures are the verified ones.
 */
export const EXAMPLES: Record<string, string> = {
  "deposit-guarantee": "Example: with 10 million AMD in drams at one bank, all of it is covered. With 20 million AMD in drams at one bank, 16 million is covered. If the 20 million is split as 10 million at each of two banks, each part is covered separately.",
  "tax-interest": "Example: if a deposit earns 100,000 AMD of interest in a year, the 10% tax is 10,000 AMD and you keep 90,000 AMD.",
  "tax-dividend": "Example: on a dividend of 100,000 AMD taxed at 5%, the tax is 5,000 AMD. For dividends from foreign shares I'm not sure how the tax works, so I won't give an example for those.",
  "tax-both": "Example: 100,000 AMD of deposit interest is taxed at 10%, so the tax is 10,000 AMD. A dividend of 100,000 AMD taxed at 5% means 5,000 AMD of tax. (I'm not sure about dividends from foreign shares, so none here.)",
  "yield-better": "Example with made-up numbers: a share pays $3 a year. At $100 the yield is 3%. If bad news halves the price to $50, the yield jumps to 6%, but the company may cut the dividend if its profit is falling.",
  "dividend-yield": "Example with made-up numbers: a share costs $100 and pays $3 in dividends over a year, so the yield is 3 ÷ 100 = 3%. If the price falls to $60 and the dividend stays $3, the yield becomes 3 ÷ 60 = 5%: it looks higher only because the price fell.",
  pe: "Example with made-up numbers: a company earned $10 per share last year and its share costs $200. P/E = 200 ÷ 10 = 20, so you pay $20 for every $1 of yearly profit. Another company's share costs $100 and also earned $10 per share: its P/E is 10. It is cheaper per dollar of profit, but that alone doesn't make it a better company, because the market may expect its profit to fall.",
  eps: "Example with made-up numbers: a company earns $1,000,000 in a year and has 500,000 shares. EPS = 1,000,000 ÷ 500,000 = $2 per share. If one share costs $40, then P/E = 40 ÷ 2 = 20.",
  "market-cap": "Example with made-up numbers: 10 million shares at $50 each give a market cap of 10,000,000 × $50 = $500 million. A company with 20 million shares at the same $50 is worth $1 billion, so the price of one share alone doesn't tell you how big a company is.",
  "previous-close": "Example with made-up numbers: yesterday a share closed at $100 and today it trades at $102. The change is +$2, or +2%, measured against yesterday's close.",
  range52w: "Example with made-up numbers: a 52-week range of $80 to $120 means the price was never below $80 or above $120 in the past year. A price of $118 is near the top of that range and $85 is near the bottom.",
  dividend: "Example with made-up numbers: you own 100 shares and the company pays $0.50 per share, so you receive 100 × $0.50 = $50 (before any tax).",
  inflation: "Example with made-up numbers: if prices rise 5% a year, something that costs 10,000 AMD today costs 10,500 AMD next year. Money that earns less than 5% in that year buys less than before.",
  diversification: "Example with made-up numbers: if all your money is in one company and it falls 50%, you lose half. If the same money is split equally across 5 companies and only that one falls 50%, you lose 10% of the total (if the others stay unchanged).",
  compound: "Example: 100,000 AMD at 6% a year for 10 years. With simple interest (always 6% of the original) you would have 160,000 AMD. With compounding you would have about 179,085 AMD, because each year's interest earns interest too (an assumed rate, for illustration only).",
  "buy-sell": "Example with made-up rates: a buy rate of 380 and a sell rate of 384 AMD per dollar. If you sell $100 to the bank you receive 38,000 AMD; if you buy $100 from the bank you pay 38,400 AMD. Converting there and back loses 400 AMD.",
  "stock-bond": "Example with made-up numbers: you buy a share for $100. A year later it may be worth $120 or $80, and it may pay a dividend. A $100 bond paying 5% interest gives $5 a year and returns your $100 at the end, unless the issuer fails to pay.",
  etf: "Example: one ETF share can hold small pieces of 500 companies, so a single purchase spreads your money across all of them. It can still fall when the market falls.",
  "risk-vol": "Example with made-up numbers: a share that moves about 1% a day is less volatile than one that moves 5% a day, even if both end the year at the same price. Whether either is risky for you depends on when you need the money.",
  drawdown: "Example: a price rises to $100, falls to $70 and then recovers to $90. The drawdown was 30% (from $100 to $70), even though the price ended the period only 10% below its peak.",
  available: "Example: income of 700,000 AMD and expenses of 665,000 AMD give Available = 700,000 − 665,000 = 35,000 AMD.",
  deposit: "Example with made-up numbers: 1,000,000 AMD on deposit at 8% a year earns 80,000 AMD of interest in a year. The 10% tax on it is 8,000 AMD, so you keep 72,000 AMD.",
  "interest-rate": "Example: 100,000 AMD at 6% a year earns 6,000 AMD in a year.",
  investment: "Example with made-up numbers: a share bought for $100 may be worth $120 or $80 a year later.",
  portfolio: "Example: owning shares of 5 different companies is one portfolio with 5 holdings.",
  risk: "Example: if you need the money in one year, the price may be low at that moment. If you can wait 10 years, short falls matter much less.",
  plan: "Example: to have 1,200,000 AMD in 12 months you set aside 1,200,000 ÷ 12 = 100,000 AMD every month. To have the same amount in 24 months it is 50,000 AMD a month. With interest it would be a little less, because the interest does part of the work.",
};

const EXAMPLE_CHIP: Chip = { label: "Give an example", value: "Can you give an example?" };
const EXAMPLE_TERMS: Chip[] = [
  { label: "P/E", value: "What does P/E mean? Give an example." },
  { label: "EPS", value: "What is EPS? Give an example." },
  { label: "Market cap", value: "What is market cap? Give an example." },
  { label: "Dividend yield", value: "What is dividend yield? Give an example." },
  { label: "Compound interest", value: "What is compound interest? Give an example." },
];

function exampleDraft(topic: string | null): Draft {
  if (topic && EXAMPLES[topic]) return { text: EXAMPLES[topic], chips: STARTER_CHIPS };
  if (topic) return { text: "I don't have a worked example for that one. I can explain another term or plan a savings goal.", chips: STARTER_CHIPS };
  return { text: "Which term would you like an example of? Pick one, or ask about another term such as inflation, diversification or the deposit guarantee.", chips: EXAMPLE_TERMS };
}

/* ------------------------------------------------------------------ the savings-goal interview */
const GOAL_CHIPS: Chip[] = [
  { label: "A trip", value: "a trip" },
  { label: "A car", value: "a car" },
  { label: "A home deposit", value: "a home deposit" },
  { label: "An emergency fund", value: "an emergency fund" },
  { label: "Something else", value: "something else" },
];
const MONTH_CHIPS: Chip[] = [
  { label: "6 months", value: "6 months" },
  { label: "1 year", value: "1 year" },
  { label: "2 years", value: "2 years" },
  { label: "5 years", value: "5 years" },
];
const REFINE_CHIPS: Chip[] = [
  { label: "Add my income", value: "action:income" },
  { label: "I already saved some", value: "action:saved" },
  { label: "Add an interest rate", value: "action:rate" },
  { label: "Change the amount", value: "action:amount" },
  { label: "Change the time", value: "action:months" },
  { label: "Start over", value: "action:reset" },
];

function askFor(state: ConvState): Draft {
  switch (state.mode) {
    case "ask-goal":
      return { text: "Great, let's plan it together. What are you saving for?", chips: GOAL_CHIPS };
    case "ask-amount": {
      const homeOrCar = /home|apartment|flat|house|car/.test(state.goalName ?? "");
      return {
        text: `How much will ${state.goalName ? `${state.goalName} ` : "it "}cost, roughly, in AMD? I don't know current prices, so please give your own estimate, for example 3,000,000.${homeOrCar ? " If you're not sure, think of the full cost: for a home the deposit, fees and furniture; for a car the price, insurance and registration." : ""}`,
      };
    }
    case "ask-months":
      return { text: "By when would you like to have it? For example \"2 years\" or \"18 months\".", chips: MONTH_CHIPS };
    case "ask-income":
      return { text: "What is your monthly income in AMD? I use it only in this chat to show how much of it the plan takes. Nothing is saved." };
    case "ask-saved":
      return { text: "How much have you already saved for this goal, in AMD? Type 0 if nothing yet." };
    case "ask-rate":
      return { text: "What yearly interest rate do you expect, in percent? For example 8. It is your own assumption, and I take the 10% tax on deposit interest off it." };
    default:
      return { text: WELCOME, chips: STARTER_CHIPS };
  }
}

function planText(goalName: string | null, r: ReturnType<typeof planFor>): string {
  const what = goalName ? ` for ${goalName}` : "";
  if (r.alreadyReached) return `You already have the full ${formatAmd(r.goal)}${what}, so nothing more needs to be set aside.`;
  let t = `To have ${formatAmd(r.goal)}${what} in ${durationLabel(r.months)}, you would set aside about ${formatAmd(r.monthly)} a month.`;
  if (r.rate) t += ` This uses your assumed ${r.rate.grossPct}% a year (about ${Math.round(r.rate.netPct * 10) / 10}% after the 10% tax on deposit interest). It is your assumption, not a promise.`;
  if (r.realism === "unrealistic") t += " That is more than half of your income, which is usually very hard to keep up, so this plan is probably not realistic. A later date or a smaller goal would make it easier.";
  else if (r.realism === "stretch") t += " That is a stretch: a later date would make it easier if it feels too tight.";
  return t;
}

/** the plan for the numbers collected so far, or a message that says what to fix */
function planMessages(state: ConvState, intro?: string): { state: ConvState; drafts: Draft[] } {
  const input = { goal: state.amount!, months: state.months!, saved: state.saved, income: state.income, ratePct: state.ratePct };
  const problem = checkPlanInput(input);
  if (problem) {
    const mode = problem.field === "goal" ? "ask-amount" : problem.field === "months" ? "ask-months" : problem.field === "income" ? "ask-income" : problem.field === "saved" ? "ask-saved" : "ask-rate";
    const fix = { ...state, mode, ...(problem.field === "goal" ? { amount: null } : problem.field === "months" ? { months: null } : problem.field === "income" ? { income: null } : problem.field === "saved" ? { saved: 0 } : { ratePct: null }) } as ConvState;
    return { state: fix, drafts: [{ text: problem.message }, askFor(fix)] };
  }
  const result = planFor(input);
  const next: ConvState = { ...state, mode: "free", topic: "plan" };
  const first: Draft = { text: `${intro ? `${intro} ` : ""}${planText(state.goalName, result)}`, plan: { goalName: state.goalName, result } };
  const assumed = [state.saved > 0 ? "" : "nothing is saved yet", state.ratePct ? "" : "no interest"].filter(Boolean);
  const notes = [assumed.length ? `I assumed ${assumed.join(" and ")}` : "", state.income ? "" : "I don't know your income"].filter(Boolean);
  const more: Draft = { text: notes.length ? `${notes.join(", and ")}. Want to make it more precise?` : "Want to change anything?", chips: REFINE_CHIPS };
  return { state: next, drafts: [first, more] };
}

/** what the interview still needs, in order */
function nextMode(s: ConvState): ConvState["mode"] | null {
  if (s.amount === null) return s.goalName === null && s.months === null ? "ask-goal" : "ask-amount";
  if (s.months === null) return "ask-months";
  return null;
}

function startPlan(state: ConvState, text: string, slots: Slots): { state: ConvState; drafts: Draft[] } {
  let s: ConvState = { ...state, goalName: goalNameFrom(text) ?? state.goalName };
  if (slots.amount !== undefined) s = { ...s, amount: slots.amount };
  if (slots.months !== undefined) s = { ...s, months: slots.months };
  if (slots.income !== undefined) s = { ...s, income: slots.income };
  if (slots.saved !== undefined) s = { ...s, saved: slots.saved };
  if (slots.ratePct !== undefined) s = { ...s, ratePct: slots.ratePct };
  // "I can put aside 100,000 a month": how long will it take?
  if (slots.monthly !== undefined && s.amount !== null && s.months === null) {
    const net = netRatePct(s.ratePct ?? 0);
    const n = monthsNeeded(s.amount, slots.monthly, s.saved, net);
    if (n === null || n < LIMITS.minMonths) return { state: s, drafts: [{ text: "Please check the monthly amount: it has to be more than 0." }] };
    if (n > LIMITS.maxMonths) return { state: s, drafts: [{ text: `Putting aside ${formatAmd(slots.monthly)} a month, it would take more than 50 years. A larger monthly amount or a smaller goal would help.` }] };
    s = { ...s, months: n };
    return planMessages(s, `Putting aside ${formatAmd(slots.monthly)} a month, you would reach it in about ${durationLabel(n)}.`);
  }
  const mode = nextMode(s);
  if (mode) {
    const asking = { ...s, mode };
    return { state: asking, drafts: [askFor(asking)] };
  }
  return planMessages(s);
}

function interviewStep(state: ConvState, text: string): { state: ConvState; drafts: Draft[] } | null {
  const reask = (s: ConvState, hint: string) => ({ state: s, drafts: [{ text: hint }, askFor(s)] as Draft[] });
  switch (state.mode) {
    case "ask-goal": {
      const name = /^(something else|other|not sure|don't know)$/i.test(text.trim()) ? null : text.trim().replace(/^(for|to buy|to get|to save for)\s+/i, "").replace(/[.!?]+$/, "").slice(0, 40).toLowerCase();
      const s: ConvState = { ...state, goalName: name, mode: "ask-amount" };
      return { state: s, drafts: [askFor(s)] };
    }
    case "ask-amount": {
      const n = parseAmountOnly(text);
      if (n === null) return null;
      const s = { ...state, amount: n };
      const m = nextMode(s);
      return m ? { state: { ...s, mode: m }, drafts: [askFor({ ...s, mode: m })] } : planMessages(s);
    }
    case "ask-months": {
      const d = parseDuration(text);
      const bare = /^\s*(\d+)\s*$/.exec(text);
      const months = d ? d.months : bare ? Number(bare[1]) : null;
      if (months === null) return null;
      const s = { ...state, months };
      return planMessages(s, bare && !d ? `I took that as ${durationLabel(months)}.` : undefined);
    }
    case "ask-income": {
      const n = parseAmountOnly(text);
      return n === null ? null : planMessages({ ...state, income: n });
    }
    case "ask-saved": {
      const n = parseAmountOnly(text);
      return n === null ? null : planMessages({ ...state, saved: n });
    }
    case "ask-rate": {
      const m = /(\d+(?:[.,]\d+)?)/.exec(text);
      return m ? planMessages({ ...state, ratePct: Number(m[1].replace(",", ".")) }) : reask(state, "I didn't catch a number. Please type a yearly rate in percent, for example 8.");
    }
    default:
      return null;
  }
}

function action(state: ConvState, cmd: string): { state: ConvState; drafts: Draft[] } {
  if (cmd === "reset") return { state: { ...INITIAL, n: state.n }, drafts: [{ text: "No problem, starting fresh. What would you like to do?", chips: STARTER_CHIPS }] };
  const mode = ({ income: "ask-income", saved: "ask-saved", rate: "ask-rate", amount: "ask-amount", months: "ask-months" } as const)[cmd as "income"];
  if (!mode) return { state, drafts: [{ text: REPLIES.fallback, chips: STARTER_CHIPS }] };
  const s = { ...state, mode };
  return { state: s, drafts: [askFor(s)] };
}

/* ------------------------------------------------------------------ the general (non-interview) answers */
interface Answer {
  drafts: Draft[];
  /** what the answer is about, remembered for a follow-up like "give an example" */
  topic: string | null;
}

function general(text: string): Answer | null {
  const say = (drafts: Draft[]): Answer => ({ drafts, topic: null });
  if (RX.card.test(text.replace(/\s{2,}/g, " "))) return say([{ text: REPLIES.card, tone: "notice" }]);
  if (RX.injection.test(text)) return say([{ text: REPLIES.injection, chips: STARTER_CHIPS }]);
  if (RX.otherUsers.test(text)) return say([{ text: REPLIES.otherUsers }]);
  if (RX.offTopic.test(text)) return say([{ text: REPLIES.offTopic, chips: STARTER_CHIPS.slice(0, 3) }]);
  if (RX.keepSavings.test(text)) return say([{ text: REPLIES.keepSavings }]);
  if (RX.sure.test(text)) return say([{ text: REPLIES.sure }]);
  if (RX.timing.test(text)) return say(RX.currency.test(text) ? [{ text: REPLIES.timing }] : [{ text: REPLIES.advice, link: INVEST_LINK }]);
  if (RX.predict.test(text)) return say([{ text: REPLIES.predict, link: MARKET_LINK }]);
  if (RX.advice.test(text)) return say([{ text: REPLIES.advice, link: INVEST_LINK }]);
  for (const f of FAQS) {
    if (!f.test.test(text)) continue;
    const hasExample = f.id in EXAMPLES;
    const answer: Draft = { text: f.text, ...(f.link ? { link: f.link } : {}), ...(hasExample ? { chips: [EXAMPLE_CHIP] } : {}) };
    // the question already asks for an example: give the explanation and then the example
    if (RX.example.test(text)) return { drafts: [{ ...answer, chips: undefined }, exampleDraft(f.id)], topic: f.id };
    return { drafts: [answer], topic: f.id };
  }
  if (RX.live.test(text)) return say([{ text: REPLIES.live, link: MARKET_LINK }]);
  if (RX.greeting.test(text)) return say([{ text: WELCOME, chips: STARTER_CHIPS }]);
  return null;
}

/** one user message in, the bot's messages out. The state is handed back and forth; nothing is stored. */
/**
 * `ai` is set when nothing written in advance fits the question: the screen may then ask the AI layer (askAssistant in
 * src/ui/api/assistant.ts) and, if that fails, show `messages` (the written "I'm not sure" answer) instead.
 */
export type Reply = { state: ConvState; messages: BotMessage[]; ai?: { question: string } };

export function respond(state: ConvState, raw: string): Reply {
  const text = raw.trim().slice(0, 400);
  if (!text) return finish(state, [{ text: "Please type a question, or pick one of the suggestions.", chips: STARTER_CHIPS }]);

  if (text.startsWith("action:")) {
    const r = action(state, text.slice(7));
    return finish(r.state, r.drafts);
  }
  if (RX.reset.test(text)) {
    const r = action(state, "reset");
    return finish(r.state, r.drafts);
  }
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length > 0 && (text.match(RX.armenian) ?? []).length / letters.length > 0.15) {
    const hy = respondHy(text, state.topic);
    return { ...finish({ ...state, topic: hy.topic }, hy.drafts), ...(hy.ai ? { ai: { question: text } } : {}) };
  }

  // in the middle of the interview: take the answer, or answer a side question and ask again
  if (state.mode !== "free") {
    const step = interviewStep(state, text);
    if (step) return finish(step.state, step.drafts);
    const side = general(text);
    if (side) return finish(state, [...side.drafts.map((d) => ({ ...d, chips: undefined })), askFor(state)]);
    return finish(state, [{ text: state.mode === "ask-months" ? "I didn't catch the time. Please write it like \"2 years\" or \"18 months\"." : "I didn't catch a number. Please type an amount, for example 3,000,000." }, askFor(state)]);
  }

  const slots = extractSlots(text);
  const planExists = state.amount !== null && state.months !== null;
  // a plan is on screen and the person adds a detail ("my income is 400,000", "with 8% interest")
  if (planExists && !RX.plan.test(text) && (slots.income !== undefined || slots.saved !== undefined || slots.ratePct !== undefined)) {
    const r = startPlan(state, "", { income: slots.income, saved: slots.saved, ratePct: slots.ratePct });
    return finish(r.state, r.drafts);
  }
  if (!RX.card.test(text) && !RX.injection.test(text) && !RX.advice.test(text) && wantsPlan(text, slots)) {
    const fresh: ConvState = { ...state, goalName: null, amount: null, months: null, saved: 0, income: null, ratePct: null };
    const r = startPlan(fresh, text, slots);
    return finish(r.state, r.drafts);
  }
  const g = general(text);
  if (g) return finish({ ...state, topic: g.topic }, g.drafts);
  // "can you give an example?" with no new term in it: the example of what we were just talking about
  if (RX.example.test(text)) return finish(state, [exampleDraft(state.topic)]);
  return { ...finish(state, [{ text: REPLIES.fallback, chips: STARTER_CHIPS }]), ai: { question: text } };
}
