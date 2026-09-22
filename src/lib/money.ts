/**
 * Exact decimal helpers (no JS floats for money). Amounts in the API are decimal strings.
 * Personal-finance money is stored as numeric(14,2) and handled as BigInt cents in JS.
 */
const MONEY_RE = /^-?\d+(\.\d+)?$/;

export function parseCents(s: string): bigint {
  if (!MONEY_RE.test(s)) throw new Error(`Invalid decimal: ${s}`);
  const neg = s.startsWith("-");
  const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
  const frac = (f + "00").slice(0, 2);
  if (f.length > 2 && /[1-9]/.test(f.slice(2))) throw new Error(`More than 2 decimals: ${s}`);
  const v = BigInt(i) * 100n + BigInt(frac);
  return neg ? -v : v;
}

export function centsToString(c: bigint): string {
  const neg = c < 0n;
  const a = neg ? -c : c;
  const s = `${a / 100n}.${(a % 100n).toString().padStart(2, "0")}`;
  return neg ? `-${s}` : s;
}

/** round-half-up(num/den, 4 decimals) as a JS number; null when den = 0. Exact integer math. */
export function ratio4(num: bigint, den: bigint): number | null {
  if (den === 0n) return null;
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const scaled = (n * 10000n * 2n + d) / (d * 2n); // half-up
  const v = Number(scaled) / 10000;
  return neg ? -v : v;
}

/** Decimal string parsed as {int, scale} for exact arithmetic. */
export function parseScaled(s: string): { int: bigint; scale: number } {
  if (!MONEY_RE.test(s)) throw new Error(`Invalid decimal: ${s}`);
  const neg = s.startsWith("-");
  const [i, f = ""] = (neg ? s.slice(1) : s).split(".");
  const int = BigInt(i + f);
  return { int: neg ? -int : int, scale: f.length };
}

/** amount / rate rounded half-up to `dp` decimals, exact (BigInt). e.g. divideDecimal("500000","363.44",2) = "1375.74" */
export function divideDecimal(amount: string, rate: string, dp = 2): string {
  const a = parseScaled(amount);
  const r = parseScaled(rate);
  if (r.int === 0n) throw new Error("Division by zero");
  // (a.int/10^a.scale) / (r.int/10^r.scale) * 10^dp = a.int * 10^(r.scale + dp) / (r.int * 10^a.scale)
  const num = a.int * 10n ** BigInt(r.scale + dp);
  const den = r.int * 10n ** BigInt(a.scale);
  const neg = num < 0n !== den < 0n;
  const n = num < 0n ? -num : num;
  const d = den < 0n ? -den : den;
  const q = (n * 2n + d) / (d * 2n);
  const s = q.toString().padStart(dp + 1, "0");
  const out = dp > 0 ? `${s.slice(0, -dp)}.${s.slice(-dp)}` : s;
  return neg && q !== 0n ? `-${out}` : out;
}

/** Trim trailing zeros of a plain decimal string ("363.4400" -> "363.44"). Keeps at least `minDp` decimals. */
export function normaliseDecimal(s: string, minDp = 2): string {
  if (!s.includes(".")) return minDp > 0 ? `${s}.${"0".repeat(minDp)}` : s;
  const [i, fRaw] = s.split(".");
  let f = fRaw.replace(/0+$/, "");
  if (f.length < minDp) f = f.padEnd(minDp, "0");
  return f.length ? `${i}.${f}` : i;
}

/** Exact per-unit rate: rate / amount as a decimal string (trailing zeros trimmed down to >= minDp). */
export function perUnit(rate: string, amount: number, dp = 8, minDp = 2): string {
  if (amount === 1) return normaliseDecimal(rate, minDp);
  return normaliseDecimal(divideDecimal(rate, String(amount), dp), minDp);
}
