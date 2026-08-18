import { z } from "@hono/zod-openapi";

/** Shape returned by every non-2xx response. */
export const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().openapi({ example: "not_found" }),
      message: z.string().openapi({ example: "Project not found" }),
    }),
  })
  .openapi("Error");

export const PublishStatusSchema = z
  .enum(["draft", "published", "archived"])
  .openapi("PublishStatus");

/** Cursor-free pagination. Offsets are fine at this data volume. */
export const PaginationQuerySchema = z.object({
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .openapi({ example: 20 }),
  offset: z.coerce.number().int().min(0).default(0).openapi({ example: 0 }),
});

export const SlugParamSchema = z.object({
  slug: z
    .string()
    .min(1)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Must be a lowercase hyphenated slug")
    .openapi({
      param: { name: "slug", in: "path" },
      example: "my-first-project",
    }),
});

export function paginated<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    items: z.array(item),
    total: z.number().int().openapi({ example: 42 }),
    limit: z.number().int().openapi({ example: 20 }),
    offset: z.number().int().openapi({ example: 0 }),
  });
}

export type ErrorResponse = z.infer<typeof ErrorSchema>;
export type PublishStatus = z.infer<typeof PublishStatusSchema>;
