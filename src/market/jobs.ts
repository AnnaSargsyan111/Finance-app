import { getFxHistory, getFxLatest } from "./fx/service";
import { getNews } from "./news/service";
import { getStocks } from "./stocks/service";
import { runUniverseBatch, type BatchOptions } from "./universe/batch";
import { APP } from "@/config/app";

/**
 * Scheduled / manual jobs. Vercel Hobby cron runs once a day, so every job is also refreshed on demand; jobs just warm
 * caches and persist history. The heavy one (`universe`) is meant for GitHub Actions or a shell: `npm run job:universe`.
 */
export const JOB_NAMES = ["fx", "news", "stocks", "universe"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export async function runJob(name: JobName, opts: { limit?: number | null; onProgress?: BatchOptions["onProgress"] } = {}): Promise<Record<string, unknown>> {
  switch (name) {
    case "fx": {
      const latest = await getFxLatest({ forceRefresh: true });
      const hist = await getFxHistory({ pair: "USD/AMD", days: APP.fx.maxDays, forceRefresh: true });
      return { latestSourceDate: latest.data.rates[0].sourceDate, source: latest.meta.source, historyPoints: hist.data.series.length };
    }
    case "news": {
      const n = await getNews({ forceRefresh: true });
      return { items: n.data.items.length, stale: n.meta.stale, feeds: n.meta.feeds };
    }
    case "stocks": {
      const s = await getStocks();
      return { symbols: s.data.items.map((i) => i.symbol), source: s.meta.source, stale: s.meta.stale, notConfigured: s.meta.notConfigured };
    }
    case "universe": {
      const stats = await runUniverseBatch({ limit: opts.limit, onProgress: opts.onProgress });
      return stats as unknown as Record<string, unknown>;
    }
  }
}
