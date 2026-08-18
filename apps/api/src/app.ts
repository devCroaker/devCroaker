import { Scalar } from "@scalar/hono-api-reference";
import { OpenAPIHono } from "@hono/zod-openapi";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { requestId } from "hono/request-id";

import { ApiError, errorBody, respondWithError } from "./lib/errors.js";
import { healthRouter } from "./routes/health.js";
import { postsRouter } from "./routes/posts.js";
import { projectsRouter } from "./routes/projects.js";

export const OPENAPI_INFO = {
  openapi: "3.1.0",
  info: {
    title: "devCroaker API",
    version: "0.1.0",
    description:
      "REST API backing dev.croaker.me. The OpenAPI document is generated from the same Zod " +
      "schemas used for runtime validation, so the two cannot drift apart.",
  },
} as const;

export function createApp() {
  const app = new OpenAPIHono({
    // Surface validation failures in the same error envelope as everything else.
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json(
          errorBody(
            "bad_request",
            result.error.issues[0]?.message ?? "Invalid request.",
          ),
          400,
        );
      }
      return undefined;
    },
  });

  app.use("*", requestId());
  app.use("*", logger());

  // In AWS the browser only ever calls the same origin via CloudFront, so CORS
  // exists purely for local development against the Next.js dev server.
  if (process.env.NODE_ENV !== "production") {
    app.use(
      "*",
      cors({ origin: ["http://localhost:3000"], credentials: true }),
    );
  }

  app.onError((err, c) => {
    if (err instanceof ApiError) {
      return respondWithError(c, err);
    }
    console.error("Unhandled error:", err);
    return c.json(errorBody("internal_error", "Something went wrong."), 500);
  });

  app.notFound((c) => c.json(errorBody("not_found", "No such route."), 404));

  app.route("/", healthRouter);
  app.route("/", projectsRouter);
  app.route("/", postsRouter);

  app.openAPIRegistry.registerComponent("securitySchemes", "bearerAuth", {
    type: "http",
    scheme: "bearer",
    bearerFormat: "JWT",
    description: "Cognito-issued JWT, validated by the API Gateway authorizer.",
  });

  app.doc31("/doc", OPENAPI_INFO);
  app.get(
    "/reference",
    Scalar({ url: "/api/doc", pageTitle: "devCroaker API" }),
  );

  return app;
}

/**
 * Mounts the API under /api.
 *
 * Note: OpenAPIHono#basePath() returns a fresh instance with an empty OpenAPI
 * registry, which silently produces an empty document. Mounting with route()
 * is what preserves the registered paths and schemas.
 */
export function createRootApp() {
  const root = new OpenAPIHono();
  root.route("/api", createApp());
  return root;
}

export type AppType = ReturnType<typeof createApp>;
