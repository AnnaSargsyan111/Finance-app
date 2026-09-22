import { route, envelope } from "@/lib/route";
import { getEnv, isFixtureMode } from "@/lib/env";
import { emailStatus } from "@/auth/email";
import { keyedProviderStatus } from "@/market/providers/keyed";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/market/providers -> which providers are live / fixture / notConfigured. Never returns key material.
 * (Session required, like every route except the public auth + health routes.)
 */
export const GET = route({ auth: true }, async () => {
  const env = getEnv();
  return envelope(
    {
      mode: isFixtureMode() ? "fixture" : "auto",
      providers: [
        ...keyedProviderStatus(),
        { provider: "cba", role: "FX (official, keyless)", mode: "live" },
        { provider: "frankfurter", role: "FX fallback (keyless)", mode: "live" },
        { provider: "fawazahmed0", role: "FX last-resort latest (keyless)", mode: "live" },
        { provider: "sec-edgar", role: "fundamentals (keyless, needs SEC_USER_AGENT)", mode: env.SEC_USER_AGENT ? "live" : "notConfigured" },
        { provider: "yahoo", role: "prototype-only price fallback (unofficial)", mode: env.ALLOW_YAHOO_PROTOTYPE ? "live" : "disabled" },
        { provider: "rss", role: "news feeds (keyless)", mode: "live" },
        { provider: "resend", role: "password-reset email", mode: emailStatus().configured ? "live" : "notConfigured (emails printed to server console in dev)" },
      ],
    },
    { asOf: new Date().toISOString(), stale: false, isFixture: isFixtureMode() },
  );
});
