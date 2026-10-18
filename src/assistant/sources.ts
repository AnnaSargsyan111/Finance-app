/**
 * The official pages the AI layer may use: an ALLOW-LIST (research/ai-assistant-plan.md, 3.0). Each source knows how to turn its page
 * into plain text. Nothing else is ever fetched or quoted; web text is untrusted and is only ever used as quotable evidence.
 * To add a page: add it here, add its host to ALLOWED_HOSTS, and check in tests/assistant.test.ts that the text comes out right.
 */
export interface Source {
  id: string;
  title: string;
  url: string;
  /** page HTML -> the plain text that may be quoted */
  extract: (html: string) => string;
}

export const ALLOWED_HOSTS: ReadonlySet<string> = new Set(["adgf.am", "www.cba.am", "src.am"]);

const ENTITIES: Record<string, string> = { "&ndash;": "-", "&mdash;": "-", "&nbsp;": " ", "&amp;": "&", "&quot;": '"', "&#039;": "'", "&#39;": "'", "&rsquo;": "'", "&lsquo;": "'", "&ldquo;": '"', "&rdquo;": '"', "&lt;": "<", "&gt;": ">" };
const decode = (s: string) => s.replace(/&(?:ndash|mdash|nbsp|amp|quot|#0?39|rsquo|lsquo|ldquo|rdquo|lt|gt);/g, (m) => ENTITIES[m] ?? m).replace(/&#(\d{2,5});/g, (_m, n: string) => String.fromCharCode(Number(n)));

/** the readable text of an HTML page: no scripts, styles or tags, one line per block */
export function readableText(html: string): string {
  return decode(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{2,}/g, "\n")
    .trim();
}

/** the text after the LAST occurrence of `marker` (a page puts its menu first and its content after it) */
const afterLast = (text: string, marker: string) => {
  const i = text.lastIndexOf(marker);
  return i < 0 ? text : text.slice(i + marker.length).trim();
};

const meta = (html: string, name: string) => {
  const m = new RegExp(`<meta[^>]+(?:property|name)="${name}"[^>]+content="([^"]*)"`, "i").exec(html) ?? new RegExp(`<meta[^>]+content="([^"]*)"[^>]+(?:property|name)="${name}"`, "i").exec(html);
  return m ? decode(m[1]).trim() : "";
};

/** the CBA register: one short line per bank (name, form, licence number and date) instead of the page's addresses and phone numbers */
export function cbaBanks(html: string): string {
  const main = /<main[\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  const lines = readableText(main).split("\n");
  const banks: { name: string; form: string; licence: string; issued: string }[] = [];
  let cur: (typeof banks)[number] | null = null;
  for (const raw of lines) {
    const line = raw.trim();
    const head = /^"([^"]+)"\s*([A-Za-z]*)$/.exec(line);
    if (head) {
      cur = { name: head[1], form: head[2], licence: "", issued: "" };
      banks.push(cur);
      continue;
    }
    if (!cur) continue;
    const lic = /license number:\s*(\d+)/i.exec(line);
    if (lic) cur.licence = lic[1];
    const date = /Date of issuance of the license:\s*([\d/]+)/i.exec(line);
    if (date) cur.issued = date[1];
  }
  const done = banks.filter((x) => x.licence);
  if (!done.length) return "";
  const list = done.map((x) => `${x.name}${x.form ? ` (${x.form})` : ""}, licence no. ${x.licence}${x.issued ? `, issued ${x.issued}` : ""}`).join("; ");
  return `Banks licensed by the Central Bank of Armenia (official register, ${done.length} banks): ${list}.`;
}

export const SOURCES: Source[] = [
  {
    id: "adgf-faq",
    title: "Armenian Deposit Guarantee Fund: frequently asked questions",
    url: "https://adgf.am/en/faq",
    extract: (html) => afterLast(readableText(html), "Frequently asked questions"),
  },
  {
    id: "cba-banks",
    title: "Central Bank of Armenia: list of licensed banks",
    url: "https://www.cba.am/en/licensed-banks/",
    extract: cbaBanks,
  },
  {
    id: "src-tax-types",
    title: "State Revenue Committee: what are the tax types applied in Armenia?",
    url: "https://src.am/en/getNews/478",
    extract: (html) => [meta(html, "og:title"), meta(html, "og:description")].filter(Boolean).join(". "),
  },
];
