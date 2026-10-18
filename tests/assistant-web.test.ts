import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { call } from "./helpers/api";
import { registerUser, type TestUser } from "./helpers/routes";
import { resetCache } from "./helpers/db";
import { jsonRes, mockFetch, text, type FetchMock } from "./helpers/fetch-mock";
import { useTestDb } from "@/lib/db";
import { clearRateEvents } from "@/auth/rate-limit";
import * as route from "@/app/api/assistant/route";
import { parseGrounded, webStatus } from "@/assistant/web";
import { NOT_FOUND_TEXT } from "@/assistant/texts";

/* ---------------------------------------------------------------- the web lookup (Gemini + Google Search), with the network mocked */
const ADGF = `<html><body><main><h1>Frequently asked questions</h1><div>The maximum amount of guarantee for dram deposits is AMD 16 mln, for FX deposits &ndash; AMD 7 mln.</div></main></body></html>`;
const TODAY = new Date().toISOString().slice(0, 10);
const QUOTE = "The maximum amount of guarantee for dram deposits is AMD 16 mln, for FX deposits - AMD 7 mln.";

const ANSWER = "Yerevan is the capital of Armenia.";
const bytes = (s: string) => Buffer.byteLength(s, "utf8");
const grounded = (answer: string, opts: { covered?: number; chunks?: { uri: string; title: string }[]; html?: string } = {}) => ({
  candidates: [
    {
      content: { parts: [{ text: "thinking...", thought: true }, { text: answer }], role: "model" },
      finishReason: "STOP",
      groundingMetadata: {
        webSearchQueries: ["capital of armenia"],
        groundingChunks: (opts.chunks ?? [{ uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "britannica.com" }]).map((web) => ({ web })),
        groundingSupports: [{ segment: { startIndex: 0, endIndex: opts.covered ?? bytes(answer) }, groundingChunkIndices: [0] }],
        searchEntryPoint: { renderedContent: opts.html ?? '<div class="container"><a class="chip" href="https://www.google.com/search?q=capital+of+armenia">capital of armenia</a></div>' },
      },
    },
  ],
});

let user: TestUser;
let mock: FetchMock | undefined;
let officialJson: unknown = { found: false, answer: "", citations: [] };
let webBody: unknown = grounded(ANSWER);
let webStatusCode = 200;
let tavilyStatus = 200;
let tavilyBody: unknown = { results: [] };
let freeModelJson: unknown = { answer: "", sure: false, citations: [] };

const handler = (url: string, init?: RequestInit) => {
  const u = new URL(url);
  if (u.host === "adgf.am") return text(ADGF, 200, "text/html");
  if (u.host === "www.cba.am" || u.host === "src.am") return text("<html><body><main>nothing useful here</main></body></html>", 200, "text/html");
  if (u.host === "api.tavily.com") return tavilyStatus === 200 ? jsonRes(tavilyBody) : text("limit", tavilyStatus);
  if (u.host === "generativelanguage.googleapis.com") {
    if (u.pathname.endsWith(":generateContent")) return webStatusCode === 200 ? jsonRes(webBody) : text("quota", webStatusCode);
    const sentBody = String(init?.body ?? "");
    return jsonRes({ choices: [{ message: { content: JSON.stringify(sentBody.includes("SEARCH RESULTS") ? freeModelJson : officialJson) } }] });
  }
  return undefined;
};
const ask = (question: string) => call(route.POST, "POST", "/api/assistant", { json: { question }, jar: user.jar, ip: user.ip });
const webCalls = () => mock!.calls.filter((c) => new URL(c.url).pathname.endsWith(":generateContent"));

beforeAll(async () => {
  await useTestDb();
  user = await registerUser("assistant-web");
});
beforeEach(async () => {
  await resetCache();
  await clearRateEvents();
  process.env.GEMINI_API_KEY = "test-key-not-real";
  process.env.ASSISTANT_WEB_SEARCH = "true";
  officialJson = { found: false, answer: "", citations: [] };
  webBody = grounded(ANSWER);
  webStatusCode = 200;
  tavilyStatus = 200;
  tavilyBody = { results: [] };
  freeModelJson = { answer: "", sure: false, citations: [] };
  delete process.env.TAVILY_API_KEY;
  mock = mockFetch(handler);
});
afterEach(() => {
  mock?.restore();
  delete process.env.GEMINI_API_KEY;
  delete process.env.ASSISTANT_WEB_SEARCH;
  delete process.env.TAVILY_API_KEY;
});

describe("reading Google's grounded answer", () => {
  it("takes the answer text (not the model's thoughts), the sources and the Search Suggestions", () => {
    const r = parseGrounded(grounded(ANSWER))!;
    expect(r.text).toBe(ANSWER);
    expect(r.sources).toEqual([{ title: "britannica.com", url: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc" }]);
    expect(r.coverage).toBe(1);
    expect(r.suggestionsHtml).toContain("capital of armenia");
  });

  it("counts the covered part in UTF-8 bytes, so Armenian text is measured correctly", () => {
    const hy = "Երևանը Հայաստանի մայրաքաղաքն է։";
    expect(parseGrounded(grounded(hy, { covered: bytes(hy) }))!.coverage).toBe(1);
    expect(parseGrounded(grounded(hy, { covered: Math.floor(bytes(hy) / 2) }))!.coverage).toBeCloseTo(0.5, 1);
  });

  it("ignores links that are not web links, repeats, and answers with no text", () => {
    const r = parseGrounded(grounded(ANSWER, { chunks: [{ uri: "javascript:alert(1)", title: "x" }, { uri: "https://a.example/x", title: "A" }, { uri: "https://a.example/x", title: "A again" }] }))!;
    expect(r.sources).toEqual([{ title: "A", url: "https://a.example/x" }]);
    expect(parseGrounded({ candidates: [{ content: { parts: [{ text: "  " }] } }] })).toBeNull();
    expect(parseGrounded({})).toBeNull();
    expect(parseGrounded(null)).toBeNull();
  });

  it("the server decides the label: backed by search results, or 'please verify'", () => {
    expect(webStatus({ text: "a", sources: [{ title: "t", url: "https://x.example" }], coverage: 0.9 })).toBe("confirmed");
    expect(webStatus({ text: "a", sources: [{ title: "t", url: "https://x.example" }], coverage: 0.2 })).toBe("partial");
    expect(webStatus({ text: "a", sources: [], coverage: 1 })).toBe("partial");
  });
});

describe("POST /api/assistant with the web lookup", () => {
  it("asks the web when the official pages do not have the answer, and labels it from the search results", async () => {
    const r = await ask("What is the capital of Armenia?");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "confirmed", text: ANSWER, lang: "en", origin: "web" });
    expect(r.body.sources).toHaveLength(1);
    expect(r.body.suggestionsHtml).toContain("google.com/search");
    const sent = webCalls()[0];
    const body = JSON.parse(sent.body!);
    expect(body.tools).toEqual([{ google_search: {} }]); // search switched on
    expect(body.contents[0].parts[0].text).toBe("What is the capital of Armenia?");
    expect(sent.body).not.toContain("test-key-not-real"); // the key travels in the header only
    expect(webCalls()).toHaveLength(1);
  });

  it("still answers when it is not sure, and says so in the label", async () => {
    webBody = grounded("It may be around 5 percent, but I am not certain.", { covered: 10 });
    const r = await ask("What will the dram rate be?");
    expect(r.body).toMatchObject({ status: "partial", origin: "web", text: "It may be around 5 percent, but I am not certain." });
  });

  it("an answer without any search result is still given, as 'not fully sure'", async () => {
    webBody = { candidates: [{ content: { parts: [{ text: "Probably yes." }] } }] };
    const r = await ask("Is it a good idea?");
    expect(r.body).toMatchObject({ status: "partial", origin: "web", text: "Probably yes.", sources: [] });
    expect(r.body.suggestionsHtml).toBeUndefined();
  });

  it("does not use the web when an official page already answers, and does not store the web answer anywhere", async () => {
    officialJson = { found: true, answer: "Dram deposits are guaranteed up to AMD 16 million.", citations: [{ source: "adgf-faq", quote: QUOTE }] };
    const r = await ask("How much of my deposit is guaranteed?");
    expect(r.body).toMatchObject({ status: "confirmed", origin: "official" });
    expect(webCalls()).toHaveLength(0);
    // a web answer is never cached: the same question asks again
    officialJson = { found: false, answer: "", citations: [] };
    await ask("What is the capital of Armenia?");
    await ask("What is the capital of Armenia?");
    expect(webCalls()).toHaveLength(2);
  });

  it("falls back to the 'could not find' text when the lookup fails (free-tier key, quota, outage)", async () => {
    webStatusCode = 429;
    const r = await ask("What is the capital of Armenia?");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "none", text: NOT_FOUND_TEXT.en, origin: "official" });
  });

  it("drops a whole answer that contains advice instead of editing it", async () => {
    webBody = grounded("You should buy ACME shares today.");
    const r = await ask("What should I buy?");
    expect(r.body).toMatchObject({ status: "none", text: NOT_FOUND_TEXT.en });
  });

  it("can be switched off", async () => {
    process.env.ASSISTANT_WEB_SEARCH = "false";
    const r = await ask("What is the capital of Armenia?");
    expect(r.body.status).toBe("none");
    expect(webCalls()).toHaveLength(0);
  });

  it("answers in the language of the question", async () => {
    webBody = grounded("Երևանը Հայաստանի մայրաքաղաքն է։");
    const r = await ask("Ո՞րն է Հայաստանի մայրաքաղաքը");
    expect(r.body).toMatchObject({ lang: "hy", origin: "web" });
  });
});

describe("the FREE web lookup: Tavily search + the same model writes the answer from the results", () => {
  const PAGE = "Yerevan has been the capital of Armenia since 1918 and is the largest city in the country.";
  const tavilyCalls = () => mock!.calls.filter((c) => new URL(c.url).host === "api.tavily.com");
  beforeEach(() => {
    process.env.TAVILY_API_KEY = "tvly-test-not-real";
    tavilyBody = { results: [{ title: "Armenia - Britannica", url: "https://www.britannica.com/place/Armenia", content: PAGE, score: 0.9 }] };
  });

  it("searches first, then answers from the results; 'confirmed' only when the quote really is in the result", async () => {
    freeModelJson = { answer: "Yerevan is the capital of Armenia.", sure: true, citations: [{ source: "w1", quote: "Yerevan has been the capital of Armenia since 1918" }] };
    const r = await ask("What is the capital of Armenia?");
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: "confirmed", text: "Yerevan is the capital of Armenia.", origin: "web", lang: "en" });
    expect(r.body.sources).toEqual([{ title: "Armenia - Britannica", url: "https://www.britannica.com/place/Armenia", date: TODAY }]);
    expect(r.body.suggestionsHtml).toBeUndefined();
    expect(tavilyCalls()).toHaveLength(1);
    expect(JSON.parse(tavilyCalls()[0].body!)).toMatchObject({ query: "What is the capital of Armenia?", max_results: 5 });
    expect(tavilyCalls()[0].body).not.toContain("tvly-test-not-real"); // the key travels in the header only
    expect(webCalls()).toHaveLength(0); // Google's paid grounding is not used when Tavily is set up
  });

  it("answers anyway, with 'not fully sure', when the model says it is unsure or the quote is not in the result", async () => {
    freeModelJson = { answer: "I am not sure, but it may be Yerevan.", sure: false, citations: [] };
    expect((await ask("Which city?")).body).toMatchObject({ status: "partial", text: "I am not sure, but it may be Yerevan.", origin: "web" });
    freeModelJson = { answer: "Yerevan is the capital.", sure: true, citations: [{ source: "w1", quote: "A sentence that is not in the result at all." }] };
    const bad = await ask("Which city again?");
    expect(bad.body).toMatchObject({ status: "partial", origin: "web" });
    expect(bad.body.sources).toHaveLength(1); // the cited result is still shown, so the person can check it
  });

  it("still answers (as 'not fully sure', with no sources) when the search has no results or fails", async () => {
    freeModelJson = { answer: "I am not sure about this one.", sure: false, citations: [] };
    tavilyBody = { results: [] };
    expect((await ask("Something obscure?")).body).toMatchObject({ status: "partial", sources: [], origin: "web" });
    tavilyStatus = 432; // plan limit reached
    const r = await ask("Another obscure one?");
    expect(r.body).toMatchObject({ status: "partial", sources: [], origin: "web" });
  });

  it("a result that tells the model to give advice cannot make the server show advice", async () => {
    webStatusCode = 429; // Google grounding (a paid feature) is not available either
    freeModelJson = { answer: "You should buy ACME shares today.", sure: true, citations: [{ source: "w1", quote: "Yerevan has been the capital of Armenia since 1918" }] };
    const r = await ask("What should I buy?");
    expect(r.body).toMatchObject({ status: "none", text: NOT_FOUND_TEXT.en });
  });

  it("does not search when an official page already answers", async () => {
    officialJson = { found: true, answer: "Dram deposits are guaranteed up to AMD 16 million.", citations: [{ source: "adgf-faq", quote: QUOTE }] };
    const r = await ask("How much of my deposit is guaranteed?");
    expect(r.body).toMatchObject({ status: "confirmed", origin: "official" });
    expect(tavilyCalls()).toHaveLength(0);
  });
});
