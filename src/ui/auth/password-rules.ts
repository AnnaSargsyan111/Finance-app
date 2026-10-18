/**
 * Client mirror of the server's shared password rules (src/auth/password-rules.ts is the source of truth; the server
 * validates the same rules on sign-up and reset-password). Labels are read from GET /api/auth/password-rules when it
 * answers, otherwise these defaults are used. The password is never stored client-side.
 */
import { tg, type Key } from "../i18n/translate";

export type RuleId = "minLength" | "uppercase" | "lowercase" | "number" | "symbol";

export const MIN_LENGTH = 8;
export const MAX_LENGTH = 128;

export const RULE_TESTS: Record<RuleId, (p: string) => boolean> = {
  minLength: (p) => p.length >= MIN_LENGTH,
  uppercase: (p) => /\p{Lu}/u.test(p),
  lowercase: (p) => /\p{Ll}/u.test(p),
  number: (p) => /\p{N}/u.test(p),
  symbol: (p) => /[^\p{L}\p{N}\s]/u.test(p),
};

/** the checklist labels come from the dictionary (auth.passwordRules), so they follow the chosen language */
export const RULE_LABEL_KEYS = {
  minLength: "auth.passwordRules.minLength",
  uppercase: "auth.passwordRules.uppercase",
  lowercase: "auth.passwordRules.lowercase",
  number: "auth.passwordRules.number",
  symbol: "auth.passwordRules.symbol",
} as const satisfies Record<RuleId, Key>;

export const DEFAULT_RULES: { id: RuleId; label: string }[] = [
  {
    id: "minLength",
    get label() {
      return tg(RULE_LABEL_KEYS.minLength);
    },
  },
  {
    id: "uppercase",
    get label() {
      return tg(RULE_LABEL_KEYS.uppercase);
    },
  },
  {
    id: "lowercase",
    get label() {
      return tg(RULE_LABEL_KEYS.lowercase);
    },
  },
  {
    id: "number",
    get label() {
      return tg(RULE_LABEL_KEYS.number);
    },
  },
  {
    id: "symbol",
    get label() {
      return tg(RULE_LABEL_KEYS.symbol);
    },
  },
];

export function checkPassword(password: string, rules: { id: string; label: string }[] = DEFAULT_RULES) {
  const results = rules
    .filter((r): r is { id: RuleId; label: string } => r.id in RULE_TESTS)
    // the server sends English labels: a known rule is labelled from the dictionary (same English wording, other languages follow)
    .map((r) => ({ id: r.id, label: tg(RULE_LABEL_KEYS[r.id]), ok: RULE_TESTS[r.id](password) }));
  const tooLong = password.length > MAX_LENGTH;
  return { valid: results.every((r) => r.ok) && !tooLong, tooLong, results };
}

/** Pragmatic email shape check (the server does the authoritative validation). */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
