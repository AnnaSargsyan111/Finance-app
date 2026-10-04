/* Bank buy/sell rates: a SYNTHETIC page with invented numbers, in the shape of the Rate.am banks page (Next.js flight payload:
   `<hex id>:<json>` lines whose values point at each other as "$<hex id>"). */
export function flightPage(banks: Record<string, unknown>, opts: { omitRates?: boolean } = {}): string {
  const lines: string[] = [];
  let next = 1;
  const emit = (v: unknown): string => {
    const id = (next++).toString(16);
    lines.push(`${id}:${JSON.stringify(v)}`);
    return `$${id}`;
  };
  // organisation details use the same bank keys but have no `rates` - the parser must skip that chunk
  emit(Object.fromEntries(Object.keys(banks).map((k) => [k, emit({ name: k, slug: k })])));
  const root: Record<string, string> = {};
  for (const [code, b] of Object.entries(banks)) {
    const { lastUpdated, rates } = b as { lastUpdated: number; rates: Record<string, Record<string, unknown>> };
    const rateRefs = Object.fromEntries(Object.entries(rates).map(([iso, boards]) => [iso, emit(Object.fromEntries(Object.entries(boards).map(([k, v]) => [k, emit(v)])))]));
    root[code] = emit({ lastUpdated, ...(opts.omitRates ? {} : { rates: emit(rateRefs) }) });
  }
  emit(root);
  const pushes = lines.map((l) => `<script>self.__next_f.push([1,${JSON.stringify(l + "\n")}])</script>`);
  return `<html><body>${pushes.join("")}</body></html>`;
}
export const T = 1791045913000; // 2026-10-03T16:45:13Z
export const board = (buy: string, sell: string) => ({ buy, sell });
export const bankPage = (opts: { omitRates?: boolean } = {}) =>
  flightPage(
    {
      ameriabank: {
        lastUpdated: T,
        rates: {
          USD: { CASH: board("360.00", "365.00"), CLEARING: board("360.00", "365.00") },
          EUR: { CASH: board("401.00", "415.00"), CLEARING: board("401.00", "415.50") },
          RUR: { CASH: board("4.07", "4.40"), CLEARING: board("4.20", "4.45") },
          GEL: { CASH: board("134.00", "144.50"), CLEARING: board("", "") }, // not quoted non-cash
          JPY: { CASH: board("2.18", "2.43"), CLEARING: board("2.18", "2.43") }, // not one of our currencies
        },
      },
      "acba-bank": {
        lastUpdated: T,
        rates: {
          USD: { CASH: board("360", "364"), CARD: board("1", "2"), CLEARING: board("360", "365") },
          GEL: { CASH: board("137", "147"), CARD: board("137", "147"), CLEARING: board("137", "147") },
        },
      },
      "aydi-bank": { lastUpdated: T, rates: { USD: { CASH: board("0", "364"), CLEARING: board("360", "x") } } }, // invalid numbers
      "some-other-bank": { lastUpdated: T, rates: { USD: { CASH: board("350", "370") } } }, // not one of our banks
    },
    opts,
  );
export const rateAmHost = (res: () => Response) => (url: string) => (new URL(url).host === "www.rate.am" ? res() : undefined);
export const htmlRes = (body: string, status = 200) => new Response(body, { status, headers: { "content-type": "text/html" } });

