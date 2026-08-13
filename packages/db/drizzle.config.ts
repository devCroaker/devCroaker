import "dotenv/config";
import { defineConfig } from "drizzle-kit";

/**
 * drizzle-kit only runs locally and in CI against the local Postgres
 * container. Deployed migrations are applied by the migration Lambda, which
 * uses the compiled SQL files in ./migrations.
 */
export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  strict: true,
  verbose: true,
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://devcroaker:localdev@localhost:5432/devcroaker",
  },
});
