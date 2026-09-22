/** Small numeric helpers (pure). Daily simple returns, sample statistics. */
export const mean = (a: number[]): number => a.reduce((s, x) => s + x, 0) / a.length;

/** sample standard deviation (n-1); 0 for fewer than 2 points */
export function stdev(a: number[]): number {
  if (a.length < 2) return 0;
  const m = mean(a);
  let ss = 0;
  for (const x of a) ss += (x - m) ** 2;
  return Math.sqrt(ss / (a.length - 1));
}

export function covariance(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 2) return 0;
  const ma = mean(a.slice(0, n));
  const mb = mean(b.slice(0, n));
  let s = 0;
  for (let i = 0; i < n; i++) s += (a[i] - ma) * (b[i] - mb);
  return s / (n - 1);
}

export function correlation(a: number[], b: number[]): number {
  const sa = stdev(a);
  const sb = stdev(b);
  if (sa === 0 || sb === 0) return 0;
  return covariance(a, b) / (sa * sb);
}

export const dailyReturns = (prices: number[]): number[] => {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) r.push(prices[i] / prices[i - 1] - 1);
  return r;
};

/** linear-interpolated quantile of a SORTED ascending array, q in [0,1] */
export function quantileSorted(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function winsorize(values: number[], lo: number, hi: number): number[] {
  if (values.length < 3) return [...values];
  const sorted = [...values].sort((a, b) => a - b);
  const a = quantileSorted(sorted, lo);
  const b = quantileSorted(sorted, hi);
  return values.map((v) => Math.min(b, Math.max(a, v)));
}

/**
 * Percentile rank 0-100 of each value within the array: (count below + 0.5 * count equal) / n * 100.
 * Ties share the same rank; deterministic.
 */
export function percentileRanks(values: number[]): number[] {
  const n = values.length;
  const sorted = [...values].sort((a, b) => a - b);
  const first = new Map<number, number>();
  const last = new Map<number, number>();
  sorted.forEach((v, i) => {
    if (!first.has(v)) first.set(v, i);
    last.set(v, i);
  });
  return values.map((v) => {
    const below = first.get(v)!;
    const equal = last.get(v)! - below + 1;
    return ((below + equal / 2) / n) * 100;
  });
}

export const round = (n: number, dp: number) => Math.round(n * 10 ** dp) / 10 ** dp;
