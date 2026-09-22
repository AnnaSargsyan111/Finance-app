/** Stable, machine-readable error codes (handover §1.5). Frontend maps these to copy. */
export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "NO_ELIGIBLE_STOCK"
  | "NO_SNAPSHOT"
  | "INVALID_CREDENTIALS"
  | "EMAIL_TAKEN"
  | "TOKEN_INVALID_OR_EXPIRED"
  | "DUPLICATE_CATEGORY"
  | "CSRF_ORIGIN_MISMATCH"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "METHOD_NOT_ALLOWED"
  | "NOT_CONFIGURED"
  | "INSUFFICIENT_HISTORY"
  | "INVALID_SAVE_TOKEN"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ErrorCode,
    public readonly status: number,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly extra?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export const validationError = (message: string, fields?: Record<string, string>) =>
  new ApiError("VALIDATION_ERROR", 400, message, fields);

export const notFound = (what = "Resource") => new ApiError("NOT_FOUND", 404, `${what} not found`);

export const upstreamUnavailable = (message: string, extra?: Record<string, unknown>) =>
  new ApiError("UPSTREAM_UNAVAILABLE", 503, message, undefined, extra);

/** Thrown by provider adapters that have no key / are disabled. Never leaks a key. */
export class NotConfiguredError extends Error {
  constructor(public readonly provider: string, message?: string) {
    super(message ?? `${provider} is not configured`);
    this.name = "NotConfiguredError";
  }
}

/** Upstream HTTP/parse failure inside a provider adapter. */
export class UpstreamError extends Error {
  constructor(
    public readonly provider: string,
    message: string,
    public readonly status?: number,
    public readonly retriable = true,
  ) {
    super(message);
    this.name = "UpstreamError";
  }
}
