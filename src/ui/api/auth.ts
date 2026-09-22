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
