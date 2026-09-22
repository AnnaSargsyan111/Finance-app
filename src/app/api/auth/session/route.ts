import { route, json } from "@/lib/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/auth/session -> { user } | 401 UNAUTHENTICATED */
export const GET = route({ auth: true }, async ({ user }) => json({ user }));
