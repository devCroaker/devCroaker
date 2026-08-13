import type {
  Post as PostDto,
  Project as ProjectDto,
  Tag as TagDto,
} from "@devcroaker/api-contract";
import type { Post, Project, Tag } from "@devcroaker/db";

/** Postgres returns Date objects; the API contract speaks ISO 8601 strings. */
function iso(value: Date): string {
  return value.toISOString();
}

function isoOrNull(value: Date | null): string | null {
  return value === null ? null : value.toISOString();
}

export function toProjectDto(row: Project): ProjectDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    description: row.description,
    repoUrl: row.repoUrl,
    liveUrl: row.liveUrl,
    techStack: row.techStack,
    status: row.status,
    featured: row.featured,
    sortOrder: row.sortOrder,
    publishedAt: isoOrNull(row.publishedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}

export function toTagDto(row: Tag): TagDto {
  return { id: row.id, slug: row.slug, name: row.name };
}

export function toPostDto(row: Post, tags: Tag[]): PostDto {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt,
    body: row.body,
    status: row.status,
    authorId: row.authorId,
    tags: tags.map(toTagDto),
    publishedAt: isoOrNull(row.publishedAt),
    createdAt: iso(row.createdAt),
    updatedAt: iso(row.updatedAt),
  };
}
