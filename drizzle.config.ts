import { defineConfig } from "drizzle-kit";

// Migration generation only reads the schema files; no DB connection is needed for `db:generate`.
export default defineConfig({
  dialect: "postgresql",
  schema: ["./src/auth/schema.ts", "./src/pf/schema.ts", "./src/market/schema.ts", "./src/invest/schema.ts"],
  out: "./drizzle",
  schemaFilter: ["auth", "pf", "market", "invest"],
});
