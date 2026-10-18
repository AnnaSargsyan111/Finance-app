/**
 * Client-side "required field" + shape validation for the four auth forms (AuthPage.tsx). Submit buttons are always
 * clickable; a click runs these pure checks first. Any blocking issue is shown inline (never a disabled button) and
 * the API is never called while `canSubmit` is false. Pure and DOM-free so it's testable without a browser.
 */
import { auth } from "../i18n/dict/auth.en";
import { tg } from "../i18n/translate";
import { checkPassword, EMAIL_RE } from "./password-rules";

/**
 * The messages are read from the dictionary at the moment a check runs (so they come out in the chosen language). The constants are
 * the English texts, kept as a stable reference (tests, and code that has no language to follow); use the functions to show a message.
 */
export const REQUIRED_MESSAGE: string = auth.validation.required;
export const INVALID_EMAIL_MESSAGE: string = auth.validation.invalidEmail;
export const PASSWORD_MISMATCH_MESSAGE: string = auth.validation.passwordMismatch;

export const requiredMessage = (): string => tg("auth.validation.required");
export const invalidEmailMessage = (): string => tg("auth.validation.invalidEmail");
export const passwordMismatchMessage = (): string => tg("auth.validation.passwordMismatch");

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

  if (!firstName) fields.firstName = requiredMessage();
  if (!lastName) fields.lastName = requiredMessage();

  let emailOk = false;
  if (!email) fields.email = requiredMessage();
  else if (!EMAIL_RE.test(email)) fields.email = invalidEmailMessage();
  else emailOk = true;

  let passwordOk = false;
  if (!values.password) fields.password = requiredMessage();
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
  if (!email.trim()) fields.email = requiredMessage();
  if (!password) fields.password = requiredMessage();
  return { fields, canSubmit: Object.keys(fields).length === 0 };
}

export interface ForgotFields {
  email?: string;
}

export function validateForgotFields(email: string): { fields: ForgotFields; canSubmit: boolean } {
  const fields: ForgotFields = !email.trim() ? { email: requiredMessage() } : {};
  return { fields, canSubmit: Object.keys(fields).length === 0 };
}

/**
 * Reset (emailed-link) password: empty -> "This field is required." (shown alongside the checklist, which is what
 * makes "empty" visibly different from "typed something that fails the rules" — the checklist alone shows all-unmet
 * for both cases). Non-empty but failing the checklist blocks submission with no extra message.
 */
export function validateResetPassword(password: string, rules: Rules): { fields: { newPassword?: string }; canSubmit: boolean } {
  if (!password) return { fields: { newPassword: requiredMessage() }, canSubmit: false };
  return { fields: {}, canSubmit: checkPassword(password, rules).valid };
}

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
  if (!newPassword) fields.newPassword = requiredMessage();
  if (!confirmPassword) fields.confirmPassword = requiredMessage();
  if (Object.keys(fields).length) return { fields, canSubmit: false };

  const passwordOk = checkPassword(newPassword, rules).valid;
  const matchOk = newPassword === confirmPassword;
  return { fields: {}, canSubmit: passwordOk && matchOk };
}

/** Live "don't match" feedback, independent of any submit attempt: shown only once both fields have content. */
export function passwordsMismatch(newPassword: string, confirmPassword: string): boolean {
  return newPassword.length > 0 && confirmPassword.length > 0 && newPassword !== confirmPassword;
}
