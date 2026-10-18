import { afterEach, describe, expect, it } from "vitest";
import { ApiError, errorMessage, fieldError } from "@/ui/api/client";
import { EN } from "@/ui/i18n/dict/en";
import { setCurrentLocale } from "@/ui/i18n/locale";
import { messageSlug, translateFields, translateServerMessage } from "@/ui/i18n/server-messages";

afterEach(() => setCurrentLocale("en"));

describe("server messages", () => {
  it("every errors.server key is the slug of its own English text", () => {
    const bad = Object.entries(EN.errors.server).filter(([key, text]) => messageSlug(text) !== key);
    expect(bad).toEqual([]);
  });

  it("the slug is lowercase letters and digits joined with underscores, cut at 80 characters", () => {
    expect(messageSlug("We couldn't create the account.")).toBe("we_couldn_t_create_the_account");
    expect(messageSlug("x".repeat(100)).length).toBe(80);
    expect(messageSlug("Email or password is incorrect.")).toBe("email_or_password_is_incorrect");
  });

  it("English shows the server text exactly as sent", () => {
    expect(translateServerMessage("Email or password is incorrect.")).toBe("Email or password is incorrect.");
    expect(translateServerMessage("Something the dictionary has never seen")).toBe("Something the dictionary has never seen");
    expect(translateFields({ password: "Required" })).toEqual({ password: "Required" });
  });

  it("another language falls back to the server text when there is no dictionary text, and handles messages with numbers", () => {
    setCurrentLocale("hy");
    expect(translateServerMessage("Something the dictionary has never seen")).toBe("Something the dictionary has never seen");
    // no Armenian text yet (or already there): either way the message is never lost or turned into a key
    expect(translateServerMessage("Request failed (503).")).not.toMatch(/^errors\./);
    expect(translateServerMessage("Password must include: uppercase, symbol.")).not.toMatch(/^errors\./);
    expect(translateServerMessage("FX history for USD/AMD is incomplete (20/30 days available).")).toContain("USD/AMD");
  });
});

describe("errorMessage", () => {
  it("English behaviour is unchanged", () => {
    expect(errorMessage(new ApiError("NETWORK", 0, "anything"))).toBe("Can't reach Finova. Check your connection and try again.");
    expect(errorMessage(new ApiError("RATE_LIMITED", 429, "Too many attempts. Please try again later."))).toBe("Too many attempts. Please try again later.");
    expect(errorMessage(new ApiError("VALIDATION_ERROR", 400, ""))).toBe("Something went wrong. Please try again.");
    expect(errorMessage(new Error("x"), "Custom fallback")).toBe("Custom fallback");
    expect(errorMessage(null)).toBe("Something went wrong. Please try again.");
  });

  it("another language looks at the server message, then the error code, then the server text", () => {
    setCurrentLocale("hy");
    const out = errorMessage(new ApiError("UNKNOWN_CODE", 400, "A brand new server message"));
    expect(out).toBe("A brand new server message");
    expect(errorMessage(new ApiError("NETWORK", 0, "x"))).not.toMatch(/^errors\./);
    expect(fieldError(new ApiError("VALIDATION_ERROR", 400, "m", { a: "Required" }), "a")).toBeTruthy();
    expect(fieldError(new ApiError("VALIDATION_ERROR", 400, "m"), "a")).toBeUndefined();
  });
});
