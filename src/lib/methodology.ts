import { z } from "zod";
import raw from "@/config/methodology.v1.json";

/**
 * Config-driven methodology (handover 10.3.6). ONE json file; every module validates the section it uses with its own
 * Zod schema at first use, so a typo in the JSON fails loudly instead of silently changing behaviour.
 */
let current: Record<string, unknown> = raw as unknown as Record<string, unknown>;

/** tests may swap in a modified copy; pass null to restore */
export function setMethodologyForTests(m: Record<string, unknown> | null): void {
  current = m ?? (raw as unknown as Record<string, unknown>);
  cache.clear();
}

const cache = new Map<string, unknown>();

export function methodologyVersion(): string {
  return String(current.version ?? "v1");
}

export function methodologySection<S extends z.ZodType>(name: string, schema: S): z.infer<S> {
  const hit = cache.get(name);
  if (hit) return hit as z.infer<S>;
  const parsed = schema.safeParse(current[name]);
  if (!parsed.success) {
    throw new Error(
      `methodology.v1.json section "${name}" is invalid: ${parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")}`,
    );
  }
  cache.set(name, parsed.data);
  return parsed.data;
}

export function rawMethodology(): Record<string, unknown> {
  return current;
}
