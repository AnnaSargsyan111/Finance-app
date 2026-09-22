import { NextRequest } from "next/server";

type RouteFn = (req: NextRequest, ctx?: { params: Promise<never> }) => Promise<Response>;

export interface CallResult {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  headers: Headers;
  setCookies: string[];
}

/** Very small cookie jar: keeps name=value pairs, honours Max-Age=0 / expires in the past as deletion. */
export class Jar {
  private cookies = new Map<string, string>();
  absorb(setCookies: string[]) {
    for (const sc of setCookies) {
      const [pair, ...attrs] = sc.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find((a) => /^max-age=/i.test(a));
      if ((maxAge && Number(maxAge.split("=")[1]) <= 0) || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header(): string | undefined {
    if (!this.cookies.size) return undefined;
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  clear() {
    this.cookies.clear();
  }
  get size() {
    return this.cookies.size;
  }
}

let ipCounter = 0;
export const freshIp = () => `10.0.${Math.floor(++ipCounter / 250)}.${(ipCounter % 250) + 1}`;

export async function call(
  handler: unknown,
  method: string,
  path: string,
  opts: {
    json?: unknown;
    rawBody?: string;
    jar?: Jar;
    ip?: string;
    headers?: Record<string, string>;
    params?: Record<string, string>;
  } = {},
): Promise<CallResult> {
  const headers = new Headers({ "x-forwarded-for": opts.ip ?? "203.0.113.9", ...(opts.headers ?? {}) });
  const cookie = opts.jar?.header();
  if (cookie) headers.set("cookie", cookie);
  let body: string | undefined;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  } else if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    if (!headers.has("content-type")) headers.set("content-type", "application/json");
  }
  const req = new NextRequest(new URL(path, "http://localhost:3000"), { method, headers, body });
  const res = await (handler as RouteFn)(req, opts.params ? { params: Promise.resolve(opts.params as never) } : undefined);
  const setCookies = res.headers.getSetCookie();
  opts.jar?.absorb(setCookies);
  const text = await res.text();
  let parsed: unknown = undefined;
  try {
    parsed = text ? JSON.parse(text) : undefined;
  } catch {
    parsed = text;
  }
  return { status: res.status, body: parsed, headers: res.headers, setCookies };
}
