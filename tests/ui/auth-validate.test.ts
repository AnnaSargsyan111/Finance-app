import { describe, expect, it } from "vitest";
import { DEFAULT_RULES } from "@/ui/auth/password-rules";
import {
  PASSWORD_MISMATCH_MESSAGE,
  REQUIRED_MESSAGE,
  passwordsMismatch,
  validateChangePasswordFields,
  validateForgotFields,
  validateLoginFields,
  validateResetPassword,
  validateSignUpFields,
} from "@/ui/auth/validate";

const STRONG = "Valid-Pass-1";
const WEAK = "weak";

describe("validateSignUpFields (Create account: buttons always clickable, click-time validation)", () => {
  it("flags every empty required field at once", () => {
    const r = validateSignUpFields({ firstName: "", lastName: "  ", email: "", password: "" }, DEFAULT_RULES);
    expect(r.fields).toEqual({ firstName: REQUIRED_MESSAGE, lastName: REQUIRED_MESSAGE, email: REQUIRED_MESSAGE, password: REQUIRED_MESSAGE });
    expect(r.canSubmit).toBe(false);
  });

  it("shows the email-shape message (not 'required') for a non-empty malformed email", () => {
    const r = validateSignUpFields({ firstName: "Anna", lastName: "T", email: "not-an-email", password: STRONG }, DEFAULT_RULES);
    expect(r.fields.email).toBe("Enter a valid email address");
    expect(r.fields.password).toBeUndefined();
    expect(r.canSubmit).toBe(false);
  });

  it("shows no message for a non-empty password that fails the checklist (the checklist itself is the feedback), but still blocks submit", () => {
    const r = validateSignUpFields({ firstName: "Anna", lastName: "T", email: "a@b.co", password: WEAK }, DEFAULT_RULES);
    expect(r.fields.password).toBeUndefined();
    expect(r.fields.email).toBeUndefined();
    expect(r.canSubmit).toBe(false);
  });

  it("allows submission once every field is present and valid", () => {
    const r = validateSignUpFields({ firstName: "Anna", lastName: "Tester", email: "a@b.co", password: STRONG }, DEFAULT_RULES);
    expect(r.fields).toEqual({});
    expect(r.canSubmit).toBe(true);
  });
});

describe("validateLoginFields (Log in)", () => {
  it("flags both empty fields at once", () => {
    const r = validateLoginFields("", "");
    expect(r.fields).toEqual({ email: REQUIRED_MESSAGE, password: REQUIRED_MESSAGE });
    expect(r.canSubmit).toBe(false);
  });

  it("flags only the empty one", () => {
    expect(validateLoginFields("a@b.co", "").fields).toEqual({ password: REQUIRED_MESSAGE });
    expect(validateLoginFields("", "something").fields).toEqual({ email: REQUIRED_MESSAGE });
  });

  it("submits once both are non-empty, even with a malformed email (server/401 handles that)", () => {
    const r = validateLoginFields("not-an-email", "whatever");
    expect(r.fields).toEqual({});
    expect(r.canSubmit).toBe(true);
  });
});

describe("validateForgotFields (Send reset link)", () => {
  it("requires a non-blank email only", () => {
    expect(validateForgotFields("").fields).toEqual({ email: REQUIRED_MESSAGE });
    expect(validateForgotFields("   ").fields).toEqual({ email: REQUIRED_MESSAGE });
    expect(validateForgotFields("anything").canSubmit).toBe(true);
  });
});

describe("validateResetPassword (emailed-link reset)", () => {
  it("an empty password is visibly 'required', distinct from a non-empty-but-weak one", () => {
    const empty = validateResetPassword("", DEFAULT_RULES);
    expect(empty.fields.newPassword).toBe(REQUIRED_MESSAGE);
    expect(empty.canSubmit).toBe(false);

    const weak = validateResetPassword(WEAK, DEFAULT_RULES);
    expect(weak.fields.newPassword).toBeUndefined(); // checklist alone communicates this case
    expect(weak.canSubmit).toBe(false);
  });

  it("submits once the password passes every rule", () => {
    const r = validateResetPassword(STRONG, DEFAULT_RULES);
    expect(r.fields).toEqual({});
    expect(r.canSubmit).toBe(true);
  });
});

describe("Settings Change Password modal: New Password + Confirm Password, no Current Password field", () => {
  it("passwordsMismatch is live feedback, only once BOTH fields have content", () => {
    expect(passwordsMismatch("", "")).toBe(false);
    expect(passwordsMismatch(STRONG, "")).toBe(false); // confirm not started yet: not naggy
    expect(passwordsMismatch("", STRONG)).toBe(false);
    expect(passwordsMismatch(STRONG, "different")).toBe(true);
    expect(passwordsMismatch(STRONG, STRONG)).toBe(false);
  });

  it("flags both empty fields as required, simultaneously, on click", () => {
    const r = validateChangePasswordFields("", "", DEFAULT_RULES);
    expect(r.fields).toEqual({ newPassword: REQUIRED_MESSAGE, confirmPassword: REQUIRED_MESSAGE });
    expect(r.canSubmit).toBe(false);
  });

  it("flags only the empty one", () => {
    expect(validateChangePasswordFields(STRONG, "", DEFAULT_RULES).fields).toEqual({ confirmPassword: REQUIRED_MESSAGE });
    expect(validateChangePasswordFields("", STRONG, DEFAULT_RULES).fields).toEqual({ newPassword: REQUIRED_MESSAGE });
  });

  it("a non-empty-but-weak new password blocks submit with no extra message (the checklist is the feedback)", () => {
    const r = validateChangePasswordFields(WEAK, WEAK, DEFAULT_RULES);
    expect(r.fields).toEqual({});
    expect(r.canSubmit).toBe(false);
  });

  it("a non-empty mismatch blocks submit with no extra message here (the live 'don't match' text is the feedback)", () => {
    const r = validateChangePasswordFields(STRONG, "Something-Else-1", DEFAULT_RULES);
    expect(r.fields).toEqual({});
    expect(r.canSubmit).toBe(false);
    expect(passwordsMismatch(STRONG, "Something-Else-1")).toBe(true);
  });

  it("submits once both are present, the new password passes every rule, and they match exactly", () => {
    const r = validateChangePasswordFields(STRONG, STRONG, DEFAULT_RULES);
    expect(r.fields).toEqual({});
    expect(r.canSubmit).toBe(true);
  });

  it("uses the exact copy the owner specified", () => {
    expect(PASSWORD_MISMATCH_MESSAGE).toBe("Passwords don't match.");
  });
});
