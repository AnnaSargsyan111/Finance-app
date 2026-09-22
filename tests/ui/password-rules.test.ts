import { describe, expect, it } from "vitest";
import { checkPassword, DEFAULT_RULES } from "@/ui/auth/password-rules";
import { checkPassword as serverCheck, PASSWORD_POLICY } from "@/auth/password-rules";

describe("password checklist (AC-F1)", () => {
  it("has exactly the five reference rules in order", () => {
    expect(DEFAULT_RULES.map((r) => r.label)).toEqual(["8+ characters", "Uppercase", "Lowercase", "Number", "Symbol"]);
    expect(PASSWORD_POLICY.rules.map((r) => r.label)).toEqual(DEFAULT_RULES.map((r) => r.label));
  });

  it("turns each rule on as it is satisfied", () => {
    const ok = (p: string) => checkPassword(p).results.filter((r) => r.ok).map((r) => r.id);
    expect(ok("")).toEqual([]);
    expect(ok("abc")).toEqual(["lowercase"]);
    expect(ok("abcdefgh")).toEqual(["minLength", "lowercase"]);
    expect(ok("Abcdefg1")).toEqual(["minLength", "uppercase", "lowercase", "number"]);
    expect(checkPassword("Abcdefg1!").valid).toBe(true);
    expect(checkPassword("Abcdef1!").valid).toBe(true);
    expect(checkPassword("Abcde1!").valid).toBe(false);
  });

  it("agrees with the server rule module on a spread of inputs", () => {
    for (const p of ["", "short1!", "alllowercase1!", "ALLUPPER1!", "NoNumber!!", "NoSymbol123A", "Valid-Pass-1", "Пароль-1a", "   Aa1!    ", "x".repeat(129) + "Aa1!"]) {
      expect(checkPassword(p).valid, p).toBe(serverCheck(p).valid);
    }
  });
});
