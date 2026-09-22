/** Tiny structured logger with redaction. Never log passwords, tokens, cookies or financial amounts. */
const SENSITIVE = /pass(word)?|token|secret|authorization|cookie|api[-_]?key|amount|balance|income|expense/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value == null) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE.test(k) ? "[redacted]" : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

function emit(level: "debug" | "info" | "warn" | "error", msg: string, ctx?: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test" && !process.env.LOG_IN_TESTS) return;
  const line = { t: new Date().toISOString(), level, msg, ...(ctx ? { ctx: redact(ctx) } : {}) };
  (level === "error" ? console.error : level === "warn" ? console.warn : console.log)(JSON.stringify(line));
}

export const log = {
  debug: (m: string, c?: Record<string, unknown>) => emit("debug", m, c),
  info: (m: string, c?: Record<string, unknown>) => emit("info", m, c),
  warn: (m: string, c?: Record<string, unknown>) => emit("warn", m, c),
  error: (m: string, c?: Record<string, unknown>) => emit("error", m, c),
};
