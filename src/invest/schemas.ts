import { z } from "zod";
import { APP } from "@/config/app";

/**
 * Strict request schemas. `.strict()` rejects ANY unknown field - this is also what keeps Personal Finance data out of
 * the Investment module (no field of the request can carry it).
 */
const amountAmd = z
  .union([z.number(), z.string()], { error: "Enter the amount as a whole number of AMD" })
  .transform((v, ctx): number => {
    const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "x") : v.trim();
    if (!/^\d{1,10}$/.test(s)) {
      ctx.addIssue({ code: "custom", message: "Amount must be a whole number of AMD (digits only)" });
      return z.NEVER;
    }
    const n = Number(s);
    if (n < APP.invest.minAmountAmd || n > APP.invest.maxAmountAmd) {
      ctx.addIssue({
        code: "custom",
        message: `Amount must be between ${APP.invest.minAmountAmd.toLocaleString("en-US")} and ${APP.invest.maxAmountAmd.toLocaleString("en-US")} AMD`,
      });
      return z.NEVER;
    }
    return n;
  });

export const recommendationRequestSchema = z
  .object({
    amountAmd,
    risk: z.enum(["low", "medium", "high"], { error: "risk must be low, medium or high" }),
    horizon: z.enum(["short", "medium", "long"], { error: "horizon must be short, medium or long" }),
    mode: z.enum(["single", "portfolio"], { error: "mode must be single or portfolio" }),
    notNeededForEmergencies: z.literal(true, { error: "Confirm that this money isn't needed for emergencies." }),
  })
  .strict();

export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export const COMPARISON_WINDOWS = ["1M", "3M", "6M", "1Y", "3Y", "5Y"] as const;

export const comparisonRequestSchema = z
  .object({
    holdings: z
      .array(
        z
          .object({
            symbol: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9.\-]{0,9}$/, "Enter a ticker symbol"),
            shares: z.number({ error: "shares must be a number" }).int("shares must be a whole number").positive("shares must be at least 1").max(1_000_000_000),
          })
          .strict(),
        { error: "holdings must be a list" },
      )
      .min(1, "Provide at least one holding")
      .max(15, "At most 15 holdings")
      .refine((h) => new Set(h.map((x) => x.symbol)).size === h.length, "Each symbol may appear only once"),
    window: z.enum(COMPARISON_WINDOWS, { error: `window must be one of ${COMPARISON_WINDOWS.join(", ")}` }).default("1Y"),
  })
  .strict();

export type ComparisonRequest = z.infer<typeof comparisonRequestSchema>;

export const saveRequestSchema = z
  .object({
    saveToken: z.string().min(20).max(2000),
    result: z.record(z.string(), z.unknown()),
  })
  .strict();

export const historyListQuerySchema = z
  .object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    pageSize: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
