import { z } from "@hono/zod-openapi";

import {
  PaginationQuerySchema,
  PublishStatusSchema,
  paginated,
} from "./common.js";

export const TagSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().openapi({ example: "aws" }),
    name: z.string().openapi({ example: "AWS" }),
  })
  .openapi("Tag");

export const PostSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().openapi({ example: "building-a-cheap-aws-stack" }),
    title: z.string(),
    excerpt: z.string().nullable(),
    body: z.string().openapi({ description: "Markdown source." }),
    status: PublishStatusSchema,
    authorId: z.uuid().nullable(),
    tags: z.array(TagSchema),
    publishedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Post");

export const PostListQuerySchema = PaginationQuerySchema.extend({
  status: PublishStatusSchema.optional(),
  tag: z.string().optional().openapi({ example: "aws" }),
});

/** List responses omit the full body to keep payloads small. */
export const PostSummarySchema = PostSchema.omit({ body: true }).openapi(
  "PostSummary",
);

export const PostListSchema = paginated(PostSummarySchema).openapi("PostList");

export const CreatePostSchema = PostSchema.omit({
  id: true,
  tags: true,
  createdAt: true,
  updatedAt: true,
})
  .partial({
    excerpt: true,
    status: true,
    authorId: true,
    publishedAt: true,
  })
  .extend({ tagSlugs: z.array(z.string()).optional() })
  .openapi("CreatePost");

export const UpdatePostSchema =
  CreatePostSchema.partial().openapi("UpdatePost");

export type Tag = z.infer<typeof TagSchema>;
export type Post = z.infer<typeof PostSchema>;
export type PostSummary = z.infer<typeof PostSummarySchema>;
export type CreatePost = z.infer<typeof CreatePostSchema>;
export type UpdatePost = z.infer<typeof UpdatePostSchema>;
