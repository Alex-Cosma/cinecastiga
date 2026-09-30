import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  // Load each export once; scanning the directory also loads the barrel and
  // registers materialized views twice.
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgres://seap:seap_dev@localhost:5432/seap",
  },
});
