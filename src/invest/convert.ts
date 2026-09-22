import { z } from "zod";
import { APP } from "@/config/app";
import { divideDecimal } from "@/lib/money";
import { readUsdAmdRate } from "@/market/read";

export const convertQuerySchema = z
  .object({
    amountAmd: z
      .string({ error: "Required" })
      .regex(/^\d{1,10}$/, "Enter a whole number of AMD, digits only")
      .refine(
        (s) => !/^\d{1,10}$/.test(s) || (Number(s) >= APP.invest.minAmountAmd && Number(s) <= APP.invest.maxAmountAmd),
        `Amount must be between ${APP.invest.minAmountAmd.toLocaleString("en-US")} and ${APP.invest.maxAmountAmd.toLocaleString("en-US")} AMD`,
      ),
  })
  .strict();

/** AMD -> USD at the latest CBA USD rate. Exact decimal arithmetic (500000 / 363.44 = 1375.74). */
export async function convertAmdToUsd(amountAmd: string) {
  const r = await readUsdAmdRate();
  return {
    data: { amountAmd, usd: divideDecimal(amountAmd, r.rate, 2), rate: r.rate, rateDate: r.rateDate, source: r.source },
    meta: { asOf: r.asOf, source: r.source, stale: r.stale },
  };
}
