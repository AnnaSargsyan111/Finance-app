import { centsToString, parseScaled } from "@/lib/money";

/** Exact integer helpers for USD cents <-> AMD (BigInt inside, safe Numbers outside). */

/** floor(amountAmd * 100 / rate) USD cents: the budget can never exceed what the AMD amount buys at the rate */
export function amdToUsdCentsFloor(amountAmd: number, rate: string): number {
  const r = parseScaled(rate);
  return Number((BigInt(amountAmd) * 100n * 10n ** BigInt(r.scale)) / r.int);
}

/** floor(usdCents / 100 * rate) whole AMD */
export function usdCentsToAmdFloor(usdCents: number, rate: string): number {
  const r = parseScaled(rate);
  return Number((BigInt(usdCents) * r.int) / (100n * 10n ** BigInt(r.scale)));
}

export const centsStr = (cents: number): string => centsToString(BigInt(Math.round(cents)));
export const priceCents = (price: number): number => Math.round(price * 100);
