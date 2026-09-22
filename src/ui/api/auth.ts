import { getJson, sendJson } from "./client";
import type { PasswordPolicy, SignUpBody, User } from "./types";

/** Auth endpoints answer bare JSON. Sign-up auto-logs the user in (session cookie set by the server). */
export const signUp = (body: SignUpBody): Promise<{ user: User }> => sendJson("POST", "/api/auth/sign-up", { body, noAuthRedirect: true });

export const signIn = (body: { email: string; password: string }): Promise<{ user: User }> =>
  sendJson("POST", "/api/auth/sign-in", { body, noAuthRedirect: true });

export const signOut = (): Promise<void> => sendJson("POST", "/api/auth/sign-out", { noAuthRedirect: true });

export const forgotPassword = (email: string): Promise<{ message?: string }> =>
  sendJson("POST", "/api/auth/forgot-password", { body: { email }, noAuthRedirect: true });

export const resetPassword = (token: string, newPassword: string): Promise<{ ok: boolean }> =>
  sendJson("POST", "/api/auth/reset-password", { body: { token, newPassword }, noAuthRedirect: true });

/** Session probe: 401 is an expected answer here, so it must not redirect by itself. */
export const getSession = (signal?: AbortSignal): Promise<{ user: User }> => getJson("/api/auth/session", { signal, noAuthRedirect: true });

export const getPasswordRules = (signal?: AbortSignal): Promise<PasswordPolicy> => getJson("/api/auth/password-rules", { signal, noAuthRedirect: true });

/**
 * POST /api/auth/change-password { currentPassword, newPassword } -> 200 { ok:true }. The current session stays
 * valid: the browser stores the refreshed Set-Cookie from this response automatically (same-origin fetch); other
 * sessions are revoked server-side. Wrong current password -> 401 INVALID_CREDENTIALS with fields.currentPassword —
 * `noAuthRedirect` is required here (like sign-in) so that business-logic 401 doesn't trip the "session expired"
 * redirect and rip the user out of the modal instead of showing the field error.
 */
export const changePassword = (body: { currentPassword: string; newPassword: string }): Promise<{ ok: boolean }> =>
  sendJson("POST", "/api/auth/change-password", { body, noAuthRedirect: true });

/** PATCH /api/auth/profile { firstName, lastName } -> { user } (same shape as GET /api/auth/session's user). */
export const updateProfile = (body: { firstName: string; lastName: string }): Promise<{ user: User }> =>
  sendJson("PATCH", "/api/auth/profile", { body });
