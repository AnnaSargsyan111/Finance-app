import { defineConfig } from "vitest/config";
import path from "node:path";

// QA black-box suite: talks HTTP to the shared dev server (default http://localhost:3000).
// Run:  npx vitest run --config qa/vitest.qa.config.mts
// Not part of `npm test` (files are *.qa.ts, the default config only includes *.test.ts).
// The "@" alias exists only so a few QA tests can call the PURE maths functions (src/invest/benchmark.ts) on synthetic series.
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "../src") } },
  test: {
    environment: "node",
    include: ["tests/qa/**/*.qa.ts"],
    testTimeout: 180_000,
    hookTimeout: 90_000,
    // one file at a time: shared server, rate limits and cold-cache upstream fetches
    fileParallelism: false,
    sequence: { concurrent: false },
  },
});
