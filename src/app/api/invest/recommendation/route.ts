import { route, envelope } from "@/lib/route";
import { parseOrThrow } from "@/lib/validate";
import { recommend } from "@/invest/recommend";
import { recommendationRequestSchema } from "@/invest/schemas";
import { investConfig } from "@/invest/config";
import { hashResult, signSaveToken } from "@/invest/history/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * POST /api/invest/recommendation  { amountAmd, risk, horizon, mode, notNeededForEmergencies: true }  (STRICT: unknown fields -> 400)
 * -> { data: <single | portfolio result incl. score, allocations, warnings, saveToken>, meta }
 * Stateless: nothing is written. The result can be saved ONLY via POST /api/invest/history with the saveToken.
 */
export const POST = route({ auth: true }, async ({ user, body }) => {
  const input = parseOrThrow(recommendationRequestSchema, await body());
  const result = await recommend(input);
  const { token, expiresAt } = signSaveToken(user!.id, hashResult(result as unknown as Record<string, unknown>), investConfig().saveTokenMinutes);
  return envelope(
    { ...result, saveToken: token, saveTokenExpiresAt: expiresAt },
    { asOf: result.dataAsOf, stale: result.warnings.some((w) => w.code === "STALE_SNAPSHOT" || w.code === "FX_STALE"), isFixture: false, methodologyVersion: result.methodologyVersion, source: "Finova rules-based scoring on SEC EDGAR fundamentals and delayed prices" },
  );
});
