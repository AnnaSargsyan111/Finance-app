import { z } from "zod";
import { methodologySection } from "@/lib/methodology";

const feed = z.object({
  id: z.string(),
  name: z.string(),
  url: z.string().url(),
  region: z.enum(["global", "armenia"]),
  enabled: z.boolean().default(true),
  requireCategory: z.array(z.string()).optional(),
  keywordRescue: z.boolean().optional(),
  requireEntity: z.boolean().optional(),
  useItemSource: z.boolean().optional(),
  stripTitleSourceSuffix: z.boolean().optional(),
  note: z.string().optional(),
});

const keywordList = z.array(z.tuple([z.string(), z.number()]));

export const newsConfigSchema = z.object({
  targetCount: z.number().int().positive(),
  armenia: z.object({
    target: z.number().int().nonnegative(),
    max: z.number().int().nonnegative(),
    thirdMinScore: z.number(),
    minRelevance: z.number(),
    economyCategoryRelevance: z.number(),
  }),
  windowsHours: z.object({ global: z.number(), armenia: z.number(), relaxedGlobal: z.number() }),
  scoreWeights: z.object({ recency: z.number(), relevance: z.number(), significance: z.number(), sourceTrust: z.number() }),
  recencyScaleHours: z.object({ global: z.number(), armenia: z.number() }),
  relevanceSaturation: z.number().positive(),
  significance: z.object({ perExtraSource: z.number(), maxExtraSources: z.number(), highImpactBonus: z.number() }),
  dedupe: z.object({
    jaccard: z.number(),
    minTokens: z.number().int(),
    /** multi-word phrases collapsed to one token before comparing titles */
    phrases: z.record(z.string(), z.string()),
    /** token synonyms (armenian -> armenia) applied before the crude stemmer */
    synonyms: z.record(z.string(), z.string()),
  }),
  diversity: z.object({ perTopic: z.number().int().positive(), perSource: z.number().int().positive() }),
  poolMaxItemsPerFeed: z.number().int().positive(),
  feedTimeoutMs: z.number().int().positive(),
  feeds: z.array(feed),
  sourceTrust: z.object({ default: z.number(), feeds: z.record(z.string(), z.number()), outlets: z.record(z.string(), z.number()) }),
  topics: z.object({
    order: z.array(z.string()),
    labels: z.record(z.string(), z.string()),
    /** topic bucket -> display category shown on cards (Change Order 1, 17.2) */
    categoryLabels: z.record(z.string(), z.string()),
    keywords: z.object({
      macro: keywordList,
      equities: keywordList,
      currencies_commodities: keywordList,
      tech_ai: keywordList,
      armenia_economy: keywordList,
    }),
    highImpact: z.array(z.string()),
  }),
  exclude: z.object({ categories: z.array(z.string()), urlPatterns: z.array(z.string()), titlePatterns: z.array(z.string()) }),
  armeniaEntityTerms: z.array(z.string()),
  stopwords: z.array(z.string()),
  trackedEntities: z.array(z.string()),
});

export type NewsConfig = z.infer<typeof newsConfigSchema>;
export type FeedConfig = z.infer<typeof feed>;

export const newsConfig = (): NewsConfig => methodologySection("news", newsConfigSchema);
