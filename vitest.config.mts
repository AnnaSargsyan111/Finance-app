import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Several suites compute hundreds of real portfolios in-process on a shared CPU (Windows laptops, 2-vCPU CI runners):
    // the same test can take 25 s or 3 min depending on the machine. A hung test still fails - just later - so a generous
    // budget removes false failures without hiding real ones.
    testTimeout: 180_000,
    hookTimeout: 180_000,
    setupFiles: ["tests/setup.ts"],
  },
});
