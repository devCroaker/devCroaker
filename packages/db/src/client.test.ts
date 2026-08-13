import { eq } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";

import { closeDb, getDb } from "./client.js";
import { resolveDbConfig } from "./config.js";
import { projects } from "./schema.js";

describe("resolveDbConfig", () => {
  it("uses the connection string when IAM auth is off", () => {
    const config = resolveDbConfig({
      DATABASE_URL: "postgresql://u:p@localhost:5432/d",
    });

    expect(config.mode).toBe("url");
    expect(config.connectionString).toBe("postgresql://u:p@localhost:5432/d");
  });

  it("switches to IAM mode and reads connection details from the environment", () => {
    const config = resolveDbConfig({
      DB_IAM_AUTH: "true",
      DB_HOST: "db.example.com",
      DB_NAME: "devcroaker",
      DB_USER: "api",
      AWS_REGION: "us-west-2",
    });

    expect(config).toMatchObject({
      mode: "iam",
      host: "db.example.com",
      port: 5432,
      database: "devcroaker",
      user: "api",
      region: "us-west-2",
    });
  });

  it("fails loudly when IAM mode is missing configuration", () => {
    expect(() =>
      resolveDbConfig({ DB_IAM_AUTH: "true", DB_NAME: "x", DB_USER: "y" }),
    ).toThrow(/DB_HOST/);
  });
});

// Integration coverage. Skipped unless a database is reachable, so `pnpm test`
// still passes without Docker running.
const hasDb = Boolean(process.env.DATABASE_URL);

describe.runIf(hasDb)("database round trip", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("inserts, reads back, and deletes a project", async () => {
    const db = getDb();
    const slug = `test-project-${Date.now()}`;

    const [inserted] = await db
      .insert(projects)
      .values({
        slug,
        title: "Test Project",
        summary: "Created by the test suite.",
      })
      .returning();

    expect(inserted?.slug).toBe(slug);
    expect(inserted?.status).toBe("draft");
    expect(inserted?.techStack).toEqual([]);

    const found = await db.query.projects.findFirst({
      where: eq(projects.slug, slug),
    });
    expect(found?.title).toBe("Test Project");

    await db.delete(projects).where(eq(projects.slug, slug));
    const gone = await db.query.projects.findFirst({
      where: eq(projects.slug, slug),
    });
    expect(gone).toBeUndefined();
  });
});
