import type { PrismaClient } from '@prisma/client';

import { ApiError } from '../api/errors';
import { ensureUniqueSlug, slugify } from '../slug';
import type { CreateCategoryInput, UpdateCategoryInput } from './schemas';

export interface CategoryDto {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export interface CategoryTreeNode extends CategoryDto {
  children: CategoryTreeNode[];
}

export class CategoriesService {
  constructor(private readonly prisma: PrismaClient) {}

  async listFlat(): Promise<CategoryDto[]> {
    const rows = await this.prisma.courseCategory.findMany({ orderBy: { name: 'asc' } });
    return rows.map(this.toDto);
  }

  /**
   * Hierarchical view of categories (one-shot N+1-free).
   * Categories are loaded in one query and assembled in memory.
   */
  async listTree(): Promise<CategoryTreeNode[]> {
    const rows = await this.prisma.courseCategory.findMany({ orderBy: { name: 'asc' } });
    const byId = new Map<string, CategoryTreeNode>();
    rows.forEach((r) => byId.set(r.id, { ...this.toDto(r), children: [] }));
    const roots: CategoryTreeNode[] = [];
    byId.forEach((node) => {
      if (node.parentId && byId.has(node.parentId)) {
        byId.get(node.parentId)!.children.push(node);
      } else {
        roots.push(node);
      }
    });
    return roots;
  }

  async create(input: CreateCategoryInput): Promise<CategoryDto> {
    const baseSlug = slugify(input.slug ?? input.name);
    const slug = await ensureUniqueSlug(
      baseSlug,
      async (s) => (await this.prisma.courseCategory.count({ where: { slug: s } })) === 0,
    );

    if (input.parentId) {
      const parent = await this.prisma.courseCategory.findUnique({ where: { id: input.parentId } });
      if (!parent) throw ApiError.badRequest('Parent category does not exist');
    }

    const created = await this.prisma.courseCategory.create({
      data: {
        name: input.name.trim(),
        slug,
        parentId: input.parentId ?? null,
      },
    });
    return this.toDto(created);
  }

  async update(id: string, input: UpdateCategoryInput): Promise<CategoryDto> {
    const existing = await this.prisma.courseCategory.findUnique({ where: { id } });
    if (!existing) throw ApiError.notFound('Category not found');

    // If the parent changes, prevent cycles (a category can't be an ancestor of itself).
    if (input.parentId !== undefined && input.parentId !== null) {
      if (input.parentId === id) throw ApiError.badRequest('A category cannot be its own parent');
      const ancestorIds = await this.collectAncestorIds(input.parentId);
      if (ancestorIds.has(id)) throw ApiError.badRequest('Cannot create a cycle in the category tree');
    }

    // Recompute slug only when name or slug changed.
    let nextSlug = existing.slug;
    if (input.slug !== undefined && input.slug !== existing.slug) {
      nextSlug = await ensureUniqueSlug(
        slugify(input.slug),
        async (s) =>
          s === existing.slug ||
          (await this.prisma.courseCategory.count({ where: { slug: s } })) === 0,
      );
    } else if (input.name !== undefined && !input.slug && slugify(input.name) !== existing.slug) {
      // If only the name changed, do NOT auto-rename the slug — that would break links.
      // Slug rename must be explicit.
    }

    const updated = await this.prisma.courseCategory.update({
      where: { id },
      data: {
        name: input.name?.trim() ?? existing.name,
        slug: nextSlug,
        parentId: input.parentId === undefined ? existing.parentId : input.parentId,
      },
    });
    return this.toDto(updated);
  }

  async remove(id: string): Promise<void> {
    const existing = await this.prisma.courseCategory.findUnique({
      where: { id },
      include: { _count: { select: { courses: true, children: true } } },
    });
    if (!existing) throw ApiError.notFound('Category not found');
    if (existing._count.courses > 0) {
      throw ApiError.badRequest(
        `Cannot delete: ${existing._count.courses} course(s) reference this category. Reassign them first.`,
      );
    }
    if (existing._count.children > 0) {
      throw ApiError.badRequest(
        `Cannot delete: ${existing._count.children} subcategor(y/ies) exist. Delete them first.`,
      );
    }
    await this.prisma.courseCategory.delete({ where: { id } });
  }

  // ---- helpers ---------------------------------------------------------

  private async collectAncestorIds(startId: string): Promise<Set<string>> {
    const ids = new Set<string>();
    let cursor: string | null = startId;
    // Bound the loop to a sensible depth to avoid infinite walks on broken data.
    for (let i = 0; i < 32 && cursor; i++) {
      if (ids.has(cursor)) break;
      ids.add(cursor);
      const row: { parentId: string | null } | null = await this.prisma.courseCategory.findUnique({
        where: { id: cursor },
        select: { parentId: true },
      });
      cursor = row?.parentId ?? null;
    }
    return ids;
  }

  private toDto(row: {
    id: string;
    name: string;
    slug: string;
    parentId: string | null;
  }): CategoryDto {
    return { id: row.id, name: row.name, slug: row.slug, parentId: row.parentId };
  }
}
