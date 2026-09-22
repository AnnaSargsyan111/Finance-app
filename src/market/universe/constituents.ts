import { fetchText } from "../http";
import { UpstreamError } from "@/lib/errors";
import { universeConfig } from "@/lib/quant/config";

/**
 * S&P 500 constituents from github.com/datasets/s-and-p-500-companies (handover 5.4). Single-vendor, no declared licence:
 * prototype only. One line per ISSUER: duplicate share classes (same CIK, e.g. GOOG/GOOGL) are dropped.
 */
export interface Constituent {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  /** CIK without leading zeros, or null when the CSV has none */
  cik: string | null;
}

/** RFC-4180-ish CSV parser (quoted fields, doubled quotes, CRLF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((x) => x !== "")) rows.push(row);
  }
  return rows;
}

export function parseConstituents(csv: string): Constituent[] {
  const rows = parseCsv(csv);
  if (rows.length < 2) throw new UpstreamError("constituents", "constituents CSV is empty");
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);
  const iSym = idx("Symbol");
  const iName = idx("Security");
  const iSector = idx("GICS Sector");
  const iInd = idx("GICS Sub-Industry");
  const iCik = idx("CIK");
  if (iSym < 0 || iName < 0 || iCik < 0) throw new UpstreamError("constituents", "constituents CSV has an unexpected header (schema drift?)");
  const out: Constituent[] = [];
  for (const r of rows.slice(1)) {
    const symbol = (r[iSym] ?? "").trim();
    if (!symbol) continue;
    const cikRaw = (r[iCik] ?? "").trim().replace(/^0+/, "");
    out.push({
      symbol,
      name: (r[iName] ?? "").trim(),
      sector: (r[iSector] ?? "").trim() || null,
      industry: (r[iInd] ?? "").trim() || null,
      cik: /^\d+$/.test(cikRaw) ? cikRaw : null,
    });
  }
  return out;
}

/** one line per issuer: keep a preferred share class if listed, else the first row; others are reported as dropped */
export function dedupeIssuers(rows: Constituent[], preferred: string[]): { kept: Constituent[]; dropped: { symbol: string; keptSymbol: string }[] } {
  const byCik = new Map<string, Constituent[]>();
  const noCik: Constituent[] = [];
  for (const r of rows) {
    if (!r.cik) noCik.push(r);
    else (byCik.get(r.cik) ?? byCik.set(r.cik, []).get(r.cik)!).push(r);
  }
  const keptSet = new Set<string>();
  const dropped: { symbol: string; keptSymbol: string }[] = [];
  for (const group of byCik.values()) {
    const keep = group.find((g) => preferred.includes(g.symbol)) ?? group[0];
    keptSet.add(keep.symbol);
    for (const g of group) if (g !== keep) dropped.push({ symbol: g.symbol, keptSymbol: keep.symbol });
  }
  for (const r of noCik) keptSet.add(r.symbol);
  return { kept: rows.filter((r) => keptSet.has(r.symbol)), dropped };
}

export async function fetchConstituents(): Promise<Constituent[]> {
  const csv = await fetchText(universeConfig().constituentsUrl, { provider: "constituents", timeoutMs: 20_000, retries: 1 });
  return parseConstituents(csv);
}
