/**
 * SHARED password rules (prototype policy = mirror of the reference sign-up flow, handover 2.2/2.4).
 * Pure module with no server imports: Frontend can import/copy it to drive the live checklist.
 * The server validates with the SAME function on sign-up and reset-password.
 *
 * Production note (NIST 800-63B rev.4): drop composition rules, require >= 15 chars (or 8 with MFA),
 * screen against breached passwords. Change ONLY this file (and the labels) when moving to that policy.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export type PasswordRuleId = "minLength" | "uppercase" | "lowercase" | "number" | "symbol";

export interface PasswordRule {
  id: PasswordRuleId;
  /** checklist label as shown in the reference flow */
  label: string;
  test: (password: string) => boolean;
}

export const PASSWORD_RULES: readonly PasswordRule[] = [
  { id: "minLength", label: "8+ characters", test: (p) => p.length >= PASSWORD_MIN_LENGTH },
  { id: "uppercase", label: "Uppercase", test: (p) => /\p{Lu}/u.test(p) },
  { id: "lowercase", label: "Lowercase", test: (p) => /\p{Ll}/u.test(p) },
  { id: "number", label: "Number", test: (p) => /\p{N}/u.test(p) },
  // symbol = any character that is not a letter, number or whitespace
  { id: "symbol", label: "Symbol", test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
];

export interface PasswordCheck {
  valid: boolean;
  tooLong: boolean;
  results: { id: PasswordRuleId; label: string; ok: boolean }[];
  failed: PasswordRuleId[];
}

export function checkPassword(password: string): PasswordCheck {
  const results = PASSWORD_RULES.map((r) => ({ id: r.id, label: r.label, ok: r.test(password) }));
  const failed = results.filter((r) => !r.ok).map((r) => r.id);
  const tooLong = password.length > PASSWORD_MAX_LENGTH;
  return { valid: failed.length === 0 && !tooLong, tooLong, results, failed };
}

/** Human-readable single message for API `fields.password` (Frontend may replace with UI-spec copy). */
export function passwordErrorMessage(check: PasswordCheck): string | null {
  if (check.valid) return null;
  if (check.tooLong) return `Password must be at most ${PASSWORD_MAX_LENGTH} characters.`;
  const names = check.results.filter((r) => !r.ok).map((r) => r.label.toLowerCase());
  return `Password must include: ${names.join(", ")}.`;
}

/** Serializable description for GET /api/auth/password-rules */
export const PASSWORD_POLICY = {
  minLength: PASSWORD_MIN_LENGTH,
  maxLength: PASSWORD_MAX_LENGTH,
  rules: PASSWORD_RULES.map(({ id, label }) => ({ id, label })),
} as const;
