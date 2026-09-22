import { afterEach, describe, expect, it } from "vitest";
import { getEnv } from "@/lib/env";

/**
 * Deployment readiness: APP_BASE_URL drives both Better Auth's own base URL and the CSRF allow-list
 * (src/auth/csrf.ts). Leaving it at the dev default in production does not fail loudly on its own - it makes
 * assertSameOrigin() reject the Origin header of every real request, so every sign-up/sign-in/PUT/POST on the
 * deployed site would 403 with no other symptom. getEnv() must refuse to start in that state.
 */
const mutableEnv = process.env as Record<string, string | undefined>;
const original = { NODE_ENV: mutableEnv.NODE_ENV, APP_BASE_URL: mutableEnv.APP_BASE_URL, BETTER_AUTH_SECRET: mutableEnv.BETTER_AUTH_SECRET, DATABASE_URL: mutableEnv.DATABASE_URL };

afterEach(() => {
  mutableEnv.NODE_ENV = original.NODE_ENV;
  mutableEnv.APP_BASE_URL = original.APP_BASE_URL;
  mutableEnv.BETTER_AUTH_SECRET = original.BETTER_AUTH_SECRET;
  mutableEnv.DATABASE_URL = original.DATABASE_URL;
});

describe("getEnv(): production must not run with a loopback APP_BASE_URL", () => {
  it("throws for localhost / 127.0.0.1 / [::1] when NODE_ENV=production", () => {
    mutableEnv.NODE_ENV = "production";
    for (const url of ["http://localhost:3000", "http://127.0.0.1:3000", "http://[::1]:3000", "http://localhost"]) {
      mutableEnv.APP_BASE_URL = url;
      expect(() => getEnv(), url).toThrow(/APP_BASE_URL/);
    }
  });

  it("does not throw once APP_BASE_URL is a real deployed origin", () => {
    mutableEnv.NODE_ENV = "production";
    mutableEnv.APP_BASE_URL = "https://finova.example.vercel.app";
    expect(() => getEnv()).not.toThrow();
    expect(getEnv().APP_BASE_URL).toBe("https://finova.example.vercel.app");
  });

  it("never fires outside production: dev and test keep working with the documented localhost default", () => {
    mutableEnv.NODE_ENV = "test";
    mutableEnv.APP_BASE_URL = "http://localhost:3000";
    expect(() => getEnv()).not.toThrow();

    mutableEnv.NODE_ENV = "development";
    delete mutableEnv.APP_BASE_URL;
    expect(getEnv().APP_BASE_URL).toBe("http://localhost:3000"); // falls back to the documented dev default
  });
});
