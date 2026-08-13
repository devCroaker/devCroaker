import { OpenAPIHono, createRoute, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";

import { getDb } from "@devcroaker/db";

const HealthSchema = z
  .object({
    status: z.enum(["ok", "degraded"]),
    database: z.enum(["up", "down"]),
    uptimeSeconds: z.number(),
  })
  .openapi("Health");

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  tags: ["System"],
  summary: "Liveness and database connectivity check",
  responses: {
    200: {
      content: { "application/json": { schema: HealthSchema } },
      description: "Service is reachable.",
    },
  },
});

export const healthRouter = new OpenAPIHono().openapi(
  healthRoute,
  async (c) => {
    let database: "up" | "down" = "up";
    try {
      await getDb().execute(sql`select 1`);
    } catch {
      database = "down";
    }

    return c.json(
      {
        status: database === "up" ? ("ok" as const) : ("degraded" as const),
        database,
        uptimeSeconds: Math.round(process.uptime()),
      },
      200,
    );
  },
);
