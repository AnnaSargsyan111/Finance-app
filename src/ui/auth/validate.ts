/**
 * Client-side "required field" + shape validation for the four auth forms (AuthPage.tsx). Submit buttons are always
 * clickable; a click runs these pure checks first. Any blocking issue is shown inline (never a disabled button) and
 * the API is never called while `canSubmit` is false. Pure and DOM-free so it's testable without a browser.
 */
import { checkPassword, EMAIL_RE } from "./password-rules";

export const REQUIRED_MESSAGE = "This field is required.";
export const INVALID_EMAIL_MESSAGE = "Enter a valid email address";

type Rules = { id: string; label: string }[];

export interface SignUpFields {
  firstName?: string;
  lastName?: string;
  email?: string;
  password?: string;
}

/**
 * Every empty field gets "This field is required." simultaneously. A non-empty email that doesn't look like an
 * email gets the existing shape message. A non-empty password that fails the rule checklist gets NO separate
 * message here — the live checklist next to it is the feedback — but it still blocks submission.
 */
export function validateSignUpFields(
  values: { firstName: string; lastName: string; email: string; password: string },
  rules: Rules,
): { fields: SignUpFields; canSubmit: boolean } {
  const fields: SignUpFields = {};
  const firstName = values.firstName.trim();
  const lastName = values.lastName.trim();
  const email = values.email.trim();

  if (!firstName) fields.firstName = REQUIRED_MESSAGE;
  if (!lastName) fields.lastName = REQUIRED_MESSAGE;

  let emailOk = false;
  if (!email) fields.email = REQUIRED_MESSAGE;
  else if (!EMAIL_RE.test(email)) fields.email = INVALID_EMAIL_MESSAGE;
  else emailOk = true;

  let passwordOk = false;
  if (!values.password) fields.password = REQUIRED_MESSAGE;
  else passwordOk = checkPassword(values.password, rules).valid;

  return { fields, canSubmit: !!firstName && !!lastName && emailOk && passwordOk };
}

export interface LoginFields {
  email?: string;
  password?: string;
}

/** Login only checks emptiness on click; a non-empty, wrongly-shaped email still submits (the server/401 handles it). */
export function validateLoginFields(email: string, password: string): { fields: LoginFields; canSubmit: boolean } {
  const fields: LoginFields = {};
  if (!email.trim()) fields.email = REQUIRED_MESSAGE;
  if (!password) fields.password = REQUIRED_MESSAGE;
  return { fields, canSubmit: Object.keys(fields).length === 0 };
}

export interface ForgotFields {
  email?: string;
}

export function validateForgotFields(email: string): { fields: ForgotFields; canSubmit: boolean } {
  const fields: ForgotFields = !email.trim() ? { email: REQUIRED_MESSAGE } : {};
  return { fields, canSubmit: Object.keys(fields).length === 0 };
}

/**
 * Reset (emailed-link) password: empty -> "This field is required." (shown alongside the checklist, which is what
 * makes "empty" visibly different from "typed something that fails the rules" — the checklist alone shows all-unmet
 * for both cases). Non-empty but failing the checklist blocks submission with no extra message.
 */
export function validateResetPassword(password: string, rules: Rules): { fields: { newPassword?: string }; canSubmit: boolean } {
  if (!password) return { fields: { newPassword: REQUIRED_MESSAGE }, canSubmit: false };
  return { fields: {}, canSubmit: checkPassword(password, rules).valid };
}

export const PASSWORD_MISMATCH_MESSAGE = "Passwords don't match.";

export interface ChangePasswordFields {
  newPassword?: string;
  confirmPassword?: string;
}

/**
 * Settings' Change Password modal (New Password + Confirm Password, no Current Password field). Click-time only
 * adds "required" messages for empty fields, simultaneously. The mismatch message is meant to be shown live (as the
 * caller re-derives it on every render from the two field values, independent of this function) rather than only on
 * submit — this function just decides whether a click may proceed to the API: both non-empty, the new password
 * passes every rule, and the two values match exactly.
 */
export function validateChangePasswordFields(newPassword: string, confirmPassword: string, rules: Rules): { fields: ChangePasswordFields; canSubmit: boolean } {
  const fields: ChangePasswordFields = {};
  if (!newPassword) fields.newPassword = REQUIRED_MESSAGE;
  if (!confirmPassword) fields.confirmPassword = REQUIRED_MESSAGE;
  if (Object.keys(fields).length) return { fields, canSubmit: false };

  const passwordOk = checkPassword(newPassword, rules).valid;
  const matchOk = newPassword === confirmPassword;
  return { fields: {}, canSubmit: passwordOk && matchOk };
}

/** Live "don't match" feedback, independent of any submit attempt: shown only once both fields have content. */
export function passwordsMismatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
}
