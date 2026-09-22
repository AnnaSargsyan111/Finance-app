import { z } from "zod";
import { methodologySection } from "@/lib/methodology";

export const investConfigSchema = z.object({
  budget: z.object({
    tooSmallUsd: z.number(),
    holdingsByBudget: z.array(z.object({ maxUsd: z.number().nullable(), n: z.number().int().positive() })),
    maxHoldings: z.number().int().positive(),
    minPositionUsd: z.number().positive(),
  }),
  portfolio: z.object({
    maxPerSector: z.number().int().positive(),
    correlationMax: z.number(),
    correlationYears: z.number(),
    minWeight: z.number(),
    maxWeightByRisk: z.object({ low: z.number(), medium: z.number(), high: z.number() }),
    maxVolByRisk: z.object({ low: z.number(), medium: z.number(), high: z.number() }),
    volRepairIterations: z.number().int(),
  }),
  single: z.object({ runnersUp: z.number().int().nonnegative() }),
  benchmark: z.object({
    symbol: z.string(),
    label: z.string(),
    windows: z.record(z.string(), z.number()),
    defaultWindow: z.string(),
    tradingDaysPerYear: z.number().int(),
  }),
  saveTokenMinutes: z.number().int().positive().max(60),
});

export type InvestConfig = z.infer<typeof investConfigSchema>;
export const investConfig = (): InvestConfig => methodologySection("invest", investConfigSchema);
