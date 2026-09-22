import { z } from "zod";
import { ApiError } from "./errors";

/** Convert Zod issues to `{ fieldName: message }` (first message per field wins). */
export function issuesToFields(error: z.ZodError): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) fields[key] = "Unknown field";
      continue;
    }
    const key = issue.path.length ? issue.path.map(String).join(".") : "_";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

/** Strict parse: throws ApiError(VALIDATION_ERROR, 400, fields). Schemas should use .strict() for request bodies. */
export function parseOrThrow<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) {
    throw new ApiError("VALIDATION_ERROR", 400, "Some fields are invalid.", issuesToFields(r.error));
  }
  return r.data;
}

/** URL search params -> plain object (last value wins; empty string treated as absent). */
export function queryObject(url: URL): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of url.searchParams.entries()) if (v !== "") out[k] = v;
  return out;
}
