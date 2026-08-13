import {
  CreatePostSchema,
  ErrorSchema,
  PostListQuerySchema,
  PostListSchema,
  PostSchema,
  SlugParamSchema,
} from "@devcroaker/api-contract";
import { getDb, postTags, posts, tags as tagsTable } from "@devcroaker/db";
import { OpenAPIHono, createRoute } from "@hono/zod-openapi";
import { and, count, desc, eq, inArray } from "drizzle-orm";

import { requireAuth } from "../lib/auth.js";
import { ApiError, errorBody } from "../lib/errors.js";
import { toPostDto } from "../lib/serialize.js";

const jsonError = (description: string) => ({
  content: { "application/json": { schema: ErrorSchema } },
  description,
});

const listPosts = createRoute({
  method: "get",
  path: "/posts",
  tags: ["Posts"],
  summary: "List posts (summaries, without the body)",
  request: { query: PostListQuerySchema },
  responses: {
    200: {
      content: { "application/json": { schema: PostListSchema } },
      description: "A page of post summaries.",
    },
  },
});

const getPost = createRoute({
  method: "get",
  path: "/posts/{slug}",
  tags: ["Posts"],
  summary: "Fetch a single post by slug, including its Markdown body",
  request: { params: SlugParamSchema },
  responses: {
    200: {
      content: { "application/json": { schema: PostSchema } },
      description: "The requested post.",
    },
    404: jsonError("No post with that slug."),
  },
});

const createPost = createRoute({
  method: "post",
  path: "/posts",
  tags: ["Posts"],
  summary: "Create a post",
  security: [{ bearerAuth: [] }],
  middleware: [requireAuth] as const,
  request: {
    body: {
      content: { "application/json": { schema: CreatePostSchema } },
      required: true,
    },
  },
  responses: {
    201: {
      content: { "application/json": { schema: PostSchema } },
      description: "The created post.",
    },
    401: jsonError("Authentication required."),
    409: jsonError("A post with that slug already exists."),
  },
});

export const postsRouter = new OpenAPIHono()
  .openapi(listPosts, async (c) => {
    const { limit, offset, status, tag } = c.req.valid("query");
    const db = getDb();

    // Filtering by tag needs the join table, so resolve matching post ids first.
    let idsForTag: string[] | undefined;
    if (tag) {
      const rows = await db
        .select({ postId: postTags.postId })
        .from(postTags)
        .innerJoin(tagsTable, eq(postTags.tagId, tagsTable.id))
        .where(eq(tagsTable.slug, tag));
      idsForTag = rows.map((row) => row.postId);

      if (idsForTag.length === 0) {
        return c.json({ items: [], total: 0, limit, offset }, 200);
      }
    }

    const filters = [
      status ? eq(posts.status, status) : undefined,
      idsForTag ? inArray(posts.id, idsForTag) : undefined,
    ].filter((value) => value !== undefined);
    const where = filters.length > 0 ? and(...filters) : undefined;

    const [rows, [totals]] = await Promise.all([
      db.query.posts.findMany({
        where,
        with: { postTags: { with: { tag: true } } },
        orderBy: [desc(posts.publishedAt), desc(posts.createdAt)],
        limit,
        offset,
      }),
      db.select({ value: count() }).from(posts).where(where),
    ]);

    const items = rows.map((row) => {
      const { body: _body, ...summary } = toPostDto(
        row,
        row.postTags.map((link) => link.tag),
      );
      return summary;
    });

    return c.json({ items, total: totals?.value ?? 0, limit, offset }, 200);
  })
  .openapi(getPost, async (c) => {
    const { slug } = c.req.valid("param");
    const row = await getDb().query.posts.findFirst({
      where: eq(posts.slug, slug),
      with: { postTags: { with: { tag: true } } },
    });

    if (!row) {
      return c.json(
        errorBody("not_found", `No post with slug "${slug}".`),
        404,
      );
    }

    return c.json(
      toPostDto(
        row,
        row.postTags.map((link) => link.tag),
      ),
      200,
    );
  })
  .openapi(createPost, async (c) => {
    const { tagSlugs, ...body } = c.req.valid("json");
    const db = getDb();

    const existing = await db.query.posts.findFirst({
      where: eq(posts.slug, body.slug),
    });
    if (existing) {
      return c.json(
        errorBody("conflict", `Post "${body.slug}" already exists.`),
        409,
      );
    }

    const [created] = await db
      .insert(posts)
      .values({
        ...body,
        publishedAt: body.publishedAt ? new Date(body.publishedAt) : null,
      })
      .returning();

    if (!created) {
      throw new ApiError("internal_error", "Insert returned no row.");
    }

    let linked: { id: string; slug: string; name: string }[] = [];
    if (tagSlugs && tagSlugs.length > 0) {
      linked = await db
        .select()
        .from(tagsTable)
        .where(inArray(tagsTable.slug, tagSlugs));
      if (linked.length > 0) {
        await db
          .insert(postTags)
          .values(linked.map((t) => ({ postId: created.id, tagId: t.id })));
      }
    }

    return c.json(toPostDto(created, linked), 201);
  });
