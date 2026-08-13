import {
  CreateProjectSchema,
  ErrorSchema,
  ProjectListQuerySchema,
  ProjectListSchema,
  ProjectSchema,
  SlugParamSchema,
} from "@devcroaker/api-contract";
import { getDb, projects } from "@devcroaker/db";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { and, asc, count, desc, eq } from "drizzle-orm";

import { requireAuth } from "../lib/auth.js";
import { ApiError, errorBody } from "../lib/errors.js";
import { toProjectDto } from "../lib/serialize.js";

const jsonError = (description: string) => ({
  content: { "application/json": { schema: ErrorSchema } },
  description,
});

const listProjects = createRoute({
  method: "get",
  path: "/projects",
  tags: ["Projects"],
  summary: "List projects",
  request: { query: ProjectListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectListSchema } },
      description: "A page of projects.",
    },
  },
});

const getProject = createRoute({
  method: "get",
  path: "/projects/{slug}",
  tags: ["Projects"],
  summary: "Fetch a single project by slug",
  request: { params: SlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "The requested project.",
    },
    404: jsonError("No project with that slug."),
  },
});

const createProject = createRoute({
  method: "post",
  path: "/projects",
  tags: ["Projects"],
  summary: "Create a project",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { "application/json": { schema: CreateProjectSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: ProjectSchema } },
      description: "The created project.",
    },
    401: jsonError("Authentication required."),
    409: jsonError("A project with that slug already exists."),
  },
});

export const projectsRouter = new OpenAPIHono()
  .openapi(listProjects, async (c) => {
    const { limit, offset, status, featured } = c.req.valid("query");
    const db = getDb();

    const filters = [
      status ? eq(projects.status, status) : undefined,
      featured === undefined ? undefined : eq(projects.featured, featured),
    ].filter((value) => value !== undefined);

    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totals]] = await Promise.all([
      db
        .select()
        .from(projects)
        .where(where)
        .orderBy(
          desc(projects.featured),
          asc(projects.sortOrder),
          desc(projects.createdAt),
        )
        .limit(limit)
        .offset(offset),
      db.select({ value: count() }).from(projects).where(where),
    ]);

    return c.json(
      {
        items: rows.map(toProjectDto),
        total: totals?.value ?? 0,
        limit,
        offset,
      },
      200,
    );
  })
  .openapi(getProject, async (c) => {
    const { slug } = c.req.valid("param");
    const row = await getDb().query.projects.findFirst({
      where: eq(projects.slug, slug),
    });

    if (!row) {
      return c.json(
        errorBody("not_found", `No project with slug "${slug}".`),
        404,
      );
    }
    return c.json(toProjectDto(row), 200);
  })
  .openapi(createProject, async (c) => {
    const body = c.req.valid("json");
    const db = getDb();

    const existing = await db.query.projects.findFirst({
      where: eq(projects.slug, body.slug),
    });
    if (existing) {
      return c.json(
        errorBody("conflict", `Project "${body.slug}" already exists.`),
        409,
      );
    }

    const [created] = await db
      .insert(projects)
      .values({
        ...body,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
      })
      .returning();

    if (!created) {
      throw new ApiError("internal_error", "Insert returned no row.");
    }
    return c.json(toProjectDto(created), 201);
  });
