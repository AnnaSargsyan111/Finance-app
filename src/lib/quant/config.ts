import { z } from "zod";
import { methodologySection } from "@/lib/methodology";

const riskCaps = z.object({
  minMarketCap: z.number(),
  maxVol1y: z.number(),
  maxBeta: z.number().nullable(),
  profitability: z.enum(["netIncomePositive", "revenueGrowthPositive"]),
  minMaxDD1y: z.number().nullable(),
});

const factorInput = z.object({
  name: z.string(),
  dir: z.enum(["high", "low", "binary"]),
  skipFinancial: z.boolean().optional(),
  onlyFinancial: z.boolean().optional(),
  sectorRelative: z.boolean().optional(),
});

const weights = z.object({ quality: z.number(), lowRisk: z.number(), income: z.number(), value: z.number(), growth: z.number(), momentum: z.number() });
const adjust = weights.partial();

export const universeConfigSchema = z.object({
  constituentsUrl: z.string().url(),
  preferredShareClasses: z.array(z.string()),
  financialSectors: z.array(z.string()),
  fundamentals: z.object({
    minFrameCoverage: z.number(),
    metrics: z.array(
      z.object({
        key: z.string(),
        unit: z.string(),
        kind: z.enum(["duration", "instant"]),
        offsets: z.array(z.number().int()),
        chain: z.array(z.string()),
      }),
    ),
    shares: z.object({
      instantQuarters: z.number().int(),
      instantTaxonomy: z.string(),
      instantConcept: z.string(),
      fallbackConcept: z.string(),
      fallbackKind: z.enum(["duration", "instant"]),
    }),
  }),
  priceHistory: z.object({
    years: z.number(),
    benchmark: z.string(),
    riskFreeSymbol: z.string(),
    providers: z.array(z.enum(["twelvedata", "yahoo"])),
    maxAdjustedJump: z.number(),
    minHistoryYears: z.number(),
    historyToleranceDays: z.number(),
    tradingDaysPerYear: z.number().int(),
    betaMinObservations: z.number().int(),
    betaYears: z.number(),
    incrementalMaxGapDays: z.number(),
  }),
  eligibility: z.object({
    minCompleteness: z.number(),
    shortHorizonVolMultiplier: z.number(),
    caps: z.object({ low: riskCaps, medium: riskCaps, high: riskCaps }),
  }),
  applicableMetrics: z.object({ default: z.array(z.string()), financial: z.array(z.string()) }),
  factors: z.object({
    quality: z.array(factorInput),
    value: z.array(factorInput),
    growth: z.array(factorInput),
    momentum: z.array(factorInput),
    lowRisk: z.array(factorInput),
    income: z.array(factorInput),
  }),
  scoring: z.object({
    winsorize: z.tuple([z.number(), z.number()]),
    sectorMinGroupSize: z.number().int(),
    payoutMax: z.number(),
    weights: z.object({ low: weights, medium: weights, high: weights }),
    horizonAdjust: z.object({ short: adjust, medium: adjust, long: adjust }),
    stabilityPoints: z.number(),
  }),
});

export type UniverseConfig = z.infer<typeof universeConfigSchema>;
export type FactorInputDef = z.infer<typeof factorInput>;
export const universeConfig = (): UniverseConfig => methodologySection("universe", universeConfigSchema);
