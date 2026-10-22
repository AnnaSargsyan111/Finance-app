/**
 * Writes an HTML preview of the "parameters changed" email with SAMPLE numbers (not real market data): one for a single stock and
 * one for a portfolio. Run: npx tsx scripts/preview-watch-email.ts [output-folder]
 */
import fs from "node:fs";
import path from "node:path";
import { compareViews } from "../src/watch/diff";
import { renderWatchEmail } from "../src/watch/template";
import type { StockView, WatchView } from "../src/watch/view";

const d = (label: string, value: string, rawValue: number, topPercent: number) => ({ label, value, rawValue, topPercent });
const base = { risk: "medium", horizon: "long", amountAmd: 4_000_000, budgetUsd: 10_340, usdRate: "386.9" } as const;

const nvda = (o: Partial<StockView> = {}): StockView => ({
  symbol: "NVDA", name: "NVIDIA Corporation", price: 181.4, shares: 56, costUsd: 10158.4, costAmd: 3_930_000, cashUsd: 181.6, cashAmd: 70_000, positionUsd: null,
  score: 78.4, fits: true, vol1y: 0.338, maxDD1y: -0.221,
  drivers: [d("Return on equity", "91.9%", 0.919, 3), d("Profit margin", "55.8%", 0.558, 2), d("Price momentum (12 months)", "+38.2%", 0.382, 9), d("Debt to equity", "0.4", 0.4, 21)],
  ...o,
});
const msft = (o: Partial<StockView> = {}): StockView => ({
  symbol: "MSFT", name: "Microsoft Corporation", price: 421.7, shares: 8, costUsd: null, costAmd: null, cashUsd: null, cashAmd: null, positionUsd: 3373.6,
  score: 74.9, fits: true, vol1y: 0.196, maxDD1y: -0.142,
  drivers: [d("Return on equity", "32.4%", 0.324, 12), d("Profit margin", "35.7%", 0.357, 6)],
  ...o,
});
const jnj = (o: Partial<StockView> = {}): StockView => ({
  symbol: "JNJ", name: "Johnson & Johnson", price: 158.2, shares: 12, costUsd: null, costAmd: null, cashUsd: null, cashAmd: null, positionUsd: 1898.4,
  score: 69.1, fits: true, vol1y: 0.141, maxDD1y: -0.118,
  drivers: [d("Dividend yield", "3.1%", 0.031, 18), d("Return on equity", "21.0%", 0.21, 30)],
  ...o,
});

const single0: WatchView = { ...base, mode: "single", asOf: "2026-10-12", stocks: [nvda()], totalUsd: null };
const single1: WatchView = {
  ...single0, asOf: "2026-10-19",
  stocks: [nvda({ price: 191.85, shares: 53, costUsd: 10168.05, costAmd: 3_934_000, cashUsd: 171.95, cashAmd: 66_000, score: 79.6, vol1y: 0.352, maxDD1y: -0.221, drivers: [d("Return on equity", "93.4%", 0.934, 3), d("Profit margin", "56.9%", 0.569, 2), d("Price momentum (12 months)", "+44.0%", 0.44, 6), d("Debt to equity", "0.4", 0.4, 21)] })],
};
const port0: WatchView = { ...base, mode: "portfolio", asOf: "2026-10-12", stocks: [msft(), jnj()], totalUsd: 5272 };
const port1: WatchView = { ...port0, asOf: "2026-10-19", stocks: [msft({ price: 409.3, positionUsd: 3274.4, score: 73.2, vol1y: 0.211 }), jnj({ price: 160.1, positionUsd: 1921.2 })], totalUsd: 5195.6 };

const mail = (prev: WatchView, next: WatchView) =>
  renderWatchEmail({ firstName: "Anna", prev, next, comparison: compareViews(prev, next), test: false, manageUrl: "http://localhost:3000/invest/history", unsubscribeUrl: "http://localhost:3000/api/watch/unsubscribe?t=sample" });

const out = path.resolve(process.argv[2] ?? ".");
fs.mkdirSync(out, { recursive: true });
const a = mail(single0, single1);
const b = mail(port0, port1);
fs.writeFileSync(path.join(out, "email-single.html"), a.html, "utf8");
fs.writeFileSync(path.join(out, "email-portfolio.html"), b.html, "utf8");
fs.writeFileSync(path.join(out, "email-single.txt"), `Subject: ${a.subject}\n\n${a.text}`, "utf8");
console.log(`written to ${out}\n${a.subject}\n${b.subject}`);
