import { z } from "@hono/zod-openapi";

import {
  PaginationQuerySchema,
  PublishStatusSchema,
  paginated,
} from "./common.js";

export const ProjectSchema = z
  .object({
    id: z.uuid(),
    slug: z.string().openapi({ example: "devcroaker" }),
    title: z.string().openapi({ example: "devCroaker" }),
    summary: z
      .string()
      .openapi({ example: "Personal site and reference implementation." }),
    description: z.string().nullable(),
    repoUrl: z.url().nullable(),
    liveUrl: z.url().nullable(),
    techStack: z
      .array(z.string())
      .openapi({ example: ["TypeScript", "AWS CDK"] }),
    status: PublishStatusSchema,
    featured: z.boolean(),
    sortOrder: z.number().int(),
    publishedAt: z.iso.datetime().nullable(),
    createdAt: z.iso.datetime(),
    updatedAt: z.iso.datetime(),
  })
  .openapi("Project");

export const ProjectListQuerySchema = PaginationQuerySchema.extend({
  status: PublishStatusSchema.optional(),
  featured: z
    .enum(["true", "false"])
    .optional()
    .transform((value) => (value === undefined ? undefined : value === "true")),
});

export const ProjectListSchema =
  paginated(ProjectSchema).openapi("ProjectList");

export const CreateProjectSchema = ProjectSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
})
  .partial({
    description: true,
    repoUrl: true,
    liveUrl: true,
    techStack: true,
    status: true,
    featured: true,
    sortOrder: true,
    publishedAt: true,
  })
  .openapi("CreateProject");

export const UpdateProjectSchema =
  CreateProjectSchema.partial().openapi("UpdateProject");

export type Project = z.infer<typeof ProjectSchema>;
export type CreateProject = z.infer<typeof CreateProjectSchema>;
export type UpdateProject = z.infer<typeof UpdateProjectSchema>;
