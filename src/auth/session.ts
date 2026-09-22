import { getAuth } from "./auth";

export interface SessionUser {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export function toSessionUser(u: unknown): SessionUser {
  const x = u as { id: string; email: string; firstName?: string; lastName?: string };
  return { id: x.id, firstName: x.firstName ?? "", lastName: x.lastName ?? "", email: x.email };
}

/**
 * Resolve the session from request headers (cookie). Returns null when absent/expired/revoked.
 * `setCookies` carries a refreshed cookie when Better Auth slides the expiry.
 */
export async function getSessionUser(headers: Headers): Promise<{ user: SessionUser; setCookies: string[] } | null> {
  if (!headers.get("cookie")) return null;
  const auth = await getAuth();
  const res = await auth.api.getSession({ headers, returnHeaders: true });
  const data = res.response;
  if (!data?.user) return null;
  return { user: toSessionUser(data.user), setCookies: res.headers.getSetCookie() };
}
