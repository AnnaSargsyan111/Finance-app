import { route, json } from "@/lib/route";
import { PASSWORD_POLICY } from "@/auth/password-rules";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/password-rules (public) -> the rule list so Frontend can render the live checklist. */
export const GET = route({ auth: false }, async () => json(PASSWORD_POLICY));
