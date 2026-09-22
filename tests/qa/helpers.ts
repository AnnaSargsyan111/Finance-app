// QA helpers: tiny black-box HTTP client with cookie jar. No imports from src/** on purpose.
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
export let socketRetries = 0;
export const PASSWORD = "Qa!Test-Pass1";
const ACCOUNT_LOG = resolve(import.meta.dirname, "../../qa/created-accounts.log");

let ipN = Math.floor(Math.random() * 60000);
/** Unique fake client IP (rate limits key on X-Forwarded-For; the dev server trusts it). */
export function fakeIp(): string {
  ipN++;
  return `198.18.${(ipN >> 8) & 255}.${ipN & 255}`;
}
export const uid = () => Math.random().toString(36).slice(2, 9);

export interface Res {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
  text: string;
  headers: Headers;
  setCookies: string[];
}

export class Client {
  jar = new Map<string, string>();
  constructor(public ip: string = fakeIp()) {}

  cookieHeader(): string | undefined {
    if (!this.jar.size) return undefined;
    return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }
  hasCookie(): boolean {
    return this.jar.size > 0;
  }

  async req(
    method: string,
    path: string,
    o: {
      json?: unknown;
      raw?: string;
      headers?: Record<string, string>;
      noOrigin?: boolean;
      noCookie?: boolean;
      origin?: string;
      contentType?: string | null;
      keepCookies?: boolean;
    } = {},
  ): Promise<Res> {
    const headers: Record<string, string> = { "x-forwarded-for": this.ip, ...(o.headers ?? {}) };
    const state = ["POST", "PUT", "PATCH", "DELETE"].includes(method);
    if (state && !o.noOrigin) headers.origin = o.origin ?? BASE;
    const ck = o.noCookie ? undefined : this.cookieHeader();
    if (ck) headers.cookie = ck;
    let body: string | undefined;
    if (o.json !== undefined) body = JSON.stringify(o.json);
    else if (o.raw !== undefined) body = o.raw;
    if (body !== undefined && o.contentType !== null) headers["content-type"] = o.contentType ?? "application/json";
    let res: Response | undefined;
    for (let attempt = 0; attempt < 3 && !res; attempt++) {
      try {
        res = await fetch(BASE + path, { method, headers, body, redirect: "manual" });
      } catch (e) {
        // Node's fetch can reuse a keep-alive socket the dev server already closed (ECONNRESET before any response).
        const code = (e as { cause?: { code?: string } })?.cause?.code;
        if (attempt === 2 || (code !== "ECONNRESET" && code !== "UND_ERR_SOCKET")) throw e;
        socketRetries++;
        await new Promise((r) => setTimeout(r, 200));
      }
    }
    if (!res) throw new Error("no response");
    const setCookies = res.headers.getSetCookie();
    if (!o.keepCookies) this.absorb(setCookies);
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    return { status: res.status, body: parsed, text, headers: res.headers, setCookies };
  }
  get = (p: string, o: Parameters<Client["req"]>[2] = {}) => this.req("GET", p, o);
  post = (p: string, json?: unknown, o: Parameters<Client["req"]>[2] = {}) => this.req("POST", p, { json, ...o });
  put = (p: string, json?: unknown, o: Parameters<Client["req"]>[2] = {}) => this.req("PUT", p, { json, ...o });
  del = (p: string, o: Parameters<Client["req"]>[2] = {}) => this.req("DELETE", p, o);

  absorb(setCookies: string[]) {
    for (const sc of setCookies) {
      const [pair, ...attrs] = sc.split(";").map((s) => s.trim());
      const eq = pair.indexOf("=");
      const name = pair.slice(0, eq);
      const value = pair.slice(eq + 1);
      const maxAge = attrs.find((a) => /^max-age=/i.test(a));
      const exp = attrs.find((a) => /^expires=/i.test(a));
      const expired = exp ? Date.parse(exp.split("=").slice(1).join("=")) < Date.now() : false;
      if ((maxAge && Number(maxAge.split("=")[1]) <= 0) || value === "" || expired) this.jar.delete(name);
      else this.jar.set(name, value);
    }
  }
}

export function logAccount(email: string, note: string) {
  try {
    mkdirSync(dirname(ACCOUNT_LOG), { recursive: true });
    appendFileSync(ACCOUNT_LOG, `${new Date().toISOString()}\t${email}\t${note}\n`);
  } catch {
    /* ignore */
  }
}

/** Create a fresh fake account (qa.*@example.test) and return a logged-in client. */
export async function newUser(tag = "u", opts: { first?: string; last?: string; password?: string } = {}) {
  const c = new Client();
  const email = `qa.${tag}.${uid()}@example.test`;
  const password = opts.password ?? PASSWORD;
  const firstName = opts.first ?? "Qa";
  const lastName = opts.last ?? "Tester";
  const r = await c.post("/api/auth/sign-up", { firstName, lastName, email, password });
  if (r.status !== 201) throw new Error(`sign-up failed ${r.status} ${r.text}`);
  logAccount(email, tag);
  return { c, email, password, firstName, lastName, id: r.body.user.id as string, res: r };
}

export const anon = () => new Client();

/** decimal-safe cents from string like "1234.50" */
export const cents = (s: string | null | undefined) => (s == null ? null : Math.round(Number(s) * 100));

export function yerevanToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Yerevan", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(s: string, n: number): string {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}
