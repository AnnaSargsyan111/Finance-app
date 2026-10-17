import { APP } from "@/config/app";
import { log } from "@/lib/log";
import { cached } from "@/market/cache";
import { fetchText } from "@/market/http";
import { ALLOWED_HOSTS, SOURCES, type Source } from "./sources";

/** a readable official page, read on `date` (YYYY-MM-DD) */
export interface CorpusDoc {
  id: string;
  title: string;
  url: string;
  text: string;
  date: string;
}

async function readSource(s: Source, date: string): Promise<CorpusDoc | null> {
  // the allow-list is enforced here too, so a typo in sources.ts can never reach another site
  if (!ALLOWED_HOSTS.has(new URL(s.url).host)) return null;
  try {
    const html = await fetchText(s.url, { provider: `assistant:${s.id}`, timeoutMs: 15_000, retries: 1 });
    const text = s.extract(html).slice(0, APP.assistant.maxSourceChars);
    if (text.length < 40) return null;
    return { id: s.id, title: s.title, url: s.url, text, date };
  } catch (e) {
    log.warn("assistant source unavailable", { source: s.id, message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

/** the official pages as plain text, cached for a day (one fetch per page per day, whatever the number of questions) */
export async function loadCorpus(opts: { forceRefresh?: boolean } = {}): Promise<CorpusDoc[]> {
  try {
    const r = await cached<CorpusDoc[]>("assistant:corpus:v1", {
      ttlMs: APP.cacheTtl.assistantSourcesMs,
      forceRefresh: opts.forceRefresh,
      fetch: async () => {
        const date = new Date().toISOString().slice(0, 10);
        const docs: CorpusDoc[] = [];
        for (const s of SOURCES) {
          const d = await readSource(s, date);
          if (d) docs.push(d);
        }
        if (docs.length === 0) throw new Error("no official page could be read");
        return docs;
      },
    });
    return r.value;
  } catch (e) {
    log.warn("assistant corpus unavailable", { message: e instanceof Error ? e.message : String(e) });
    return [];
  }
}
