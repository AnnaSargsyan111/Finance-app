import { XMLParser } from "fast-xml-parser";
import { UpstreamError } from "@/lib/errors";
import { perUnit } from "@/lib/money";
import { isValidDate } from "@/lib/time";
import { fetchText } from "../http";
import type { FxLatestResult, FxObservation, FxProvider } from "./types";

/**
 * Central Bank of Armenia SOAP adapter (official reference rates, keyless).
 * https://api.cba.am/exchangerates.asmx  - SOAP 1.1, SOAPAction "http://www.cba.am/<Operation>".
 *  - ExchangeRatesLatest              -> <Rates><ExchangeRate>{ISO,Amount,Rate,Difference}</ExchangeRate>..., CurrentDate
 *  - ExchangeRatesByDateRangeByISO    -> ADO.NET DiffGram: diffgram/DocumentElement/ExchangeRatesByRange{Rate,Amount,ISO,Diff,RateDate}
 * Numbers are parsed as STRINGS (parseTagValue:false) so no float ever touches a rate.
 * Every rate is divided by its published `Amount` (e.g. IRR is quoted per 100, JPY per 10).
 */
const ENDPOINT = "https://api.cba.am/exchangerates.asmx";
const NS = "http://www.cba.am/";

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
});

const ENV_OPEN = '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body>';
const ENV_CLOSE = "</soap:Body></soap:Envelope>";

const arr = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);
const DEC = /^-?\d+(\.\d+)?$/;

function dateOnly(s: unknown): string {
  const d = String(s ?? "").slice(0, 10);
  if (!isValidDate(d)) throw new UpstreamError("CBA", `CBA returned an invalid date: ${String(s)}`);
  return d;
}

function decimal(s: unknown, what: string): string {
  const v = String(s ?? "").trim();
  if (!DEC.test(v)) throw new UpstreamError("CBA", `CBA returned an invalid ${what}: ${v || "(empty)"}`);
  return v;
}

function assertNoFault(root: Record<string, unknown>) {
  const body = (root?.Envelope as Record<string, unknown> | undefined)?.Body as Record<string, unknown> | undefined;
  if (!body) throw new UpstreamError("CBA", "CBA response is not a SOAP envelope");
  if (body.Fault) {
    const f = body.Fault as Record<string, unknown>;
    throw new UpstreamError("CBA", `CBA SOAP fault: ${String(f.faultstring ?? "unknown")}`);
  }
  return body;
}

/** Exported for tests with recorded XML. */
export function parseLatest(xml: string, isos?: readonly string[]): FxLatestResult {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml);
  } catch {
    throw new UpstreamError("CBA", "CBA returned malformed XML");
  }
  const body = assertNoFault(root);
  const result = (body.ExchangeRatesLatestResponse as Record<string, unknown> | undefined)?.ExchangeRatesLatestResult as
    | Record<string, unknown>
    | undefined;
  if (!result) throw new UpstreamError("CBA", "CBA latest response has an unexpected shape (schema drift?)");
  const date = dateOnly(result.CurrentDate);
  const rates = arr((result.Rates as Record<string, unknown> | undefined)?.ExchangeRate as Record<string, unknown>[] | Record<string, unknown> | undefined);
  if (rates.length === 0) throw new UpstreamError("CBA", "CBA latest response contains no rates");
  const want = isos ? new Set(isos) : null;
  const observations: FxObservation[] = [];
  for (const r of rates) {
    const iso = String(r.ISO ?? "").trim();
    if (!iso || (want && !want.has(iso))) continue;
    const amount = Number(decimal(r.Amount, "Amount"));
    if (!Number.isInteger(amount) || amount <= 0) throw new UpstreamError("CBA", `CBA returned invalid Amount for ${iso}`);
    observations.push({
      iso,
      date,
      rate: perUnit(decimal(r.Rate, "Rate"), amount),
      diff: r.Difference != null && r.Difference !== "" ? perUnit(decimal(r.Difference, "Difference"), amount, 8, 2) : null,
    });
  }
  if (want) {
    for (const iso of want) {
      if (!observations.some((o) => o.iso === iso)) throw new UpstreamError("CBA", `CBA latest response is missing ${iso}`);
    }
  }
  return { currentDate: date, observations };
}

export function parseRange(xml: string): FxObservation[] {
  let root: Record<string, unknown>;
  try {
    root = parser.parse(xml);
  } catch {
    throw new UpstreamError("CBA", "CBA returned malformed XML");
  }
  const body = assertNoFault(root);
  const result = (body.ExchangeRatesByDateRangeByISOResponse as Record<string, unknown> | undefined)?.ExchangeRatesByDateRangeByISOResult as
    | Record<string, unknown>
    | undefined;
  if (!result) throw new UpstreamError("CBA", "CBA range response has an unexpected shape (schema drift?)");
  // An empty range yields a DiffGram without DocumentElement: that is a valid "no working days" answer.
  const diffgram = result.diffgram as Record<string, unknown> | undefined;
  const doc = diffgram?.DocumentElement as Record<string, unknown> | undefined;
  const rows = arr(doc?.ExchangeRatesByRange as Record<string, unknown>[] | Record<string, unknown> | undefined);
  if (!diffgram && !("schema" in result)) throw new UpstreamError("CBA", "CBA range response has no DiffGram (schema drift?)");
  const out: FxObservation[] = [];
  for (const r of rows) {
    const amount = Number(decimal(r.Amount, "Amount"));
    if (!Number.isInteger(amount) || amount <= 0) throw new UpstreamError("CBA", "CBA returned invalid Amount");
    out.push({
      iso: String(r.ISO ?? "").trim(),
      date: dateOnly(r.RateDate),
      rate: perUnit(decimal(r.Rate, "Rate"), amount),
      diff: r.Diff != null && r.Diff !== "" ? perUnit(decimal(r.Diff, "Diff"), amount, 8, 2) : null,
    });
  }
  return out;
}

async function soap(op: string, inner: string): Promise<string> {
  const xml = `${ENV_OPEN}<${op} xmlns="${NS}">${inner}</${op}>${ENV_CLOSE}`;
  return fetchText(ENDPOINT, {
    provider: "CBA",
    method: "POST",
    headers: { "content-type": "text/xml; charset=utf-8", soapaction: `"${NS}${op}"` },
    body: xml,
    timeoutMs: 15_000,
  });
}

export const cbaProvider: FxProvider = {
  name: "CBA",
  async latest(isos) {
    return parseLatest(await soap("ExchangeRatesLatest", ""), isos);
  },
  async range(from, to, isos) {
    const xml = await soap(
      "ExchangeRatesByDateRangeByISO",
      `<DateFrom>${from}</DateFrom><DateTo>${to}</DateTo><ISOCodes>${isos.join(",")}</ISOCodes>`,
    );
    return parseRange(xml);
  },
};
