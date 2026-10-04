import fs from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import type { Enveloped, RecommendationResult } from "@/ui/api/types";
import { clearRecSession, clearResumeRequest, hasRecSession, markSaved, peekResume, rememberScroll, requestResume, startRecSession, updateRecSession } from "@/ui/invest/session-memory";

const prefs = { amountAmd: 800_000, risk: "medium", horizon: "long" } as const;
const env = (id: string) => ({ data: { score: 64, id } as unknown as RecommendationResult, meta: {} }) as Enveloped<RecommendationResult>;

afterEach(() => {
  clearRecSession();
  delete (globalThis as { window?: unknown }).window;
});

describe("the latest recommendation is remembered in memory so the history page can go back to it", () => {
  it("there is something to go back to only once a result has arrived, and only for the same user", () => {
    expect(hasRecSession("u1")).toBe(false);
    startRecSession("u1", prefs);
    expect(hasRecSession("u1")).toBe(false); // preferences entered, nothing computed yet
    updateRecSession({ single: env("s") });
    expect(hasRecSession("u1")).toBe(true);
    expect(hasRecSession("u2")).toBe(false); // another user in the same tab never sees it
    clearRecSession();
    expect(hasRecSession("u1")).toBe(false);
  });

  it("keeps the preferences, tab, both results, the saved flags, the benchmark timeframe and the scroll position", () => {
    (globalThis as { window?: unknown }).window = { scrollY: 2300 };
    startRecSession("u1", prefs);
    updateRecSession({ single: env("s"), portfolio: env("p"), tab: "portfolio", benchWindow: "3Y" });
    markSaved("portfolio");
    rememberScroll();
    requestResume("u1");
    const s = peekResume("u1")!;
    expect(s.prefs).toEqual(prefs);
    expect(s.tab).toBe("portfolio");
    expect(s.single!.data).toMatchObject({ id: "s" });
    expect(s.portfolio!.data).toMatchObject({ id: "p" });
    expect(s.saved).toEqual({ single: false, portfolio: true });
    expect(s.benchWindow).toBe("3Y");
    expect(s.scrollY).toBe(2300);
    expect(s.benchCache).toBeInstanceOf(Map);
  });

  it("it is restored only when asked for ('Back to my recommendation'), never by an ordinary visit, and only for its user", () => {
    startRecSession("u1", prefs);
    updateRecSession({ single: env("s") });
    expect(peekResume("u1")).toBeNull(); // not asked: the Investment page starts clean
    requestResume("u1");
    expect(peekResume("u1")).not.toBeNull();
    expect(peekResume("u2")).toBeNull();
    clearResumeRequest();
    expect(peekResume("u1")).toBeNull(); // the request is used up once the page has opened
  });

  it("asking to resume with nothing to go back to does nothing", () => {
    requestResume("u1");
    expect(peekResume("u1")).toBeNull();
    startRecSession("u1", prefs); // no result yet
    requestResume("u1");
    expect(peekResume("u1")).toBeNull();
  });

  it("starting a new recommendation replaces the old one", () => {
    startRecSession("u1", prefs);
    updateRecSession({ single: env("old"), tab: "portfolio" });
    startRecSession("u1", { ...prefs, amountAmd: 1_000_000 });
    updateRecSession({ single: env("new") });
    requestResume("u1");
    const s = peekResume("u1")!;
    expect(s.prefs.amountAmd).toBe(1_000_000);
    expect(s.tab).toBe("single");
    expect(s.single!.data).toMatchObject({ id: "new" });
  });
});

describe("the history page and the Investment page are wired to it", () => {
  const src = (p: string) => fs.readFileSync(p, "utf8");

  it("the history page offers 'Back to my recommendation' (only when there is one) next to the existing button", () => {
    const h = src("src/ui/invest/HistoryPage.tsx");
    expect(h).toContain("Back to my recommendation");
    expect(h).toContain("Back to Investment Recommendation");
    expect(h).toMatch(/canReturn \? \(/);
    expect(h).toContain("requestResume(user.id)");
    expect(h).toContain("hasRecSession(user.id)");
  });

  it("both ways into the history page remember the scroll position", () => {
    expect(src("src/ui/invest/InvestPage.tsx")).toMatch(/href="\/invest\/history"[^>]*onClick=\{rememberScroll\}/);
    expect(src("src/ui/invest/ResultPage.tsx")).toMatch(/href="\/invest\/history" onClick=\{rememberScroll\}/);
  });

  it("starting over or adjusting preferences discards the remembered recommendation; the restored page does not ask the server again", () => {
    expect(src("src/ui/invest/InvestPage.tsx")).toMatch(/const restart = \(\) => \{\s*clearRecSession\(\)/);
    const r = src("src/ui/invest/ResultPage.tsx");
    expect(r).toContain("initialData: restored?.single");
    expect(r).toContain("initialData: restored?.portfolio");
    expect(src("src/ui/hooks/useResource.ts")).toContain("if (hasInitial && nonce === 0) return;");
  });
});
