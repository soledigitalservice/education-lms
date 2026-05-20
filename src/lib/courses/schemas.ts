import { z } from 'zod';

export const createCourseSchema = z.object({
  title: z.string().min(2).max(160),
  slug: z.string().min(2).max(80).optional(),
  summary: z.string().max(500).optional(),
  description: z.string().max(20_000).optional(),
  coverImageUrl: z.string().url().optional(),
  language: z.string().min(2).max(10).default('es'),
  categoryId: z.string().cuid().nullable().optional(),
  requiresApproval: z.boolean().default(true),
  maxStudents: z.number().int().positive().max(100_000).optional(),
  startsAt: z.coerce.date().optional(),
  endsAt: z.coerce.date().optional(),
});

export const updateCourseSchema = createCourseSchema.partial();

export const listCoursesQuerySchema = z.object({
  q: z.string().max(120).optional(),
  categoryId: z.string().cuid().optional(),
  teacherId: z.string().cuid().optional(),
  /** "published" (default for non-owners), "draft", "archived", "all" (admin only). */
  status: z.enum(['published', 'draft', 'archived', 'all']).default('published'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(12),
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
export type UpdateCourseInput = z.infer<typeof updateCourseSchema>;
export type ListCoursesQuery = z.infer<typeof listCoursesQuerySchema>;
