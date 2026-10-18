import { getCurrentLocale } from "./locale";
import { hasText, tg, type Key, type Params } from "./translate";

/**
 * The server sends its messages in English. In another language the screen looks the message up in the dictionary (errors.server.<slug>)
 * and falls back to the server's own text when there is none. English always shows the server's text unchanged.
 */

/** A stable key for an English message: lowercase, letters and digits only, words joined with underscores, cut at 80 characters. */
export function messageSlug(message: string): string {
  return message
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 80)
    .replace(/_+$/, "");
}

const PASSWORD_PARTS: Record<string, string> = {
  "8+ characters": "minLength",
  uppercase: "uppercase",
  lowercase: "lowercase",
  number: "number",
  symbol: "symbol",
};

/** messages that contain numbers or a list, so they cannot be matched by their exact text */
function translatePattern(message: string): string | null {
  let m = /^Request failed \((\d+)\)\.$/.exec(message);
  if (m) return tg("errors.pattern.requestFailed", { n: m[1] });

  m = /^Password must include: (.+)\.$/.exec(message);
  if (m) {
    const parts = m[1].split(", ");
    if (parts.every((p) => p in PASSWORD_PARTS)) {
      const list = parts.map((p) => tg(`errors.passwordPart.${PASSWORD_PARTS[p]}` as Key)).join(", ");
      return tg("errors.pattern.passwordInclude", { list });
    }
    return null;
  }

  m = /^FX history for (\S+) is incomplete \((\d+)\/(\d+) days available\)\.$/.exec(message);
  if (m) return tg("errors.pattern.fxIncomplete", { pair: m[1], have: m[2], want: m[3] });

  m = /^The amount is smaller than the cheapest eligible share \(\$([\d.,]+)\)\.$/.exec(message);
  if (m) return tg("errors.pattern.cheapestShare", { price: m[1] });

  m = /^An amount of at least about ([\d,]+) AMD is needed for one share\.$/.exec(message);
  if (m) return tg("errors.pattern.needAtLeast", { amount: m[1] });

  return null;
}

/**
 * The dictionary text for a server message, or the server's own text when there is none (or the language is English).
 * Never throws and never returns an empty string for a non-empty message.
 */
export function translateServerMessage(message: string, params?: Params): string {
  if (!message || getCurrentLocale() === "en") return message;
  const key = `errors.server.${messageSlug(message)}`;
  if (hasText("en", key)) return tg(key as Key, params);
  return translatePattern(message) ?? message;
}

/** the same for the `fields` of a validation error: `{ password: "Required" }` */
export function translateFields(fields: Record<string, string>): Record<string, string> {
  if (getCurrentLocale() === "en") return fields;
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, translateServerMessage(v)]));
}
