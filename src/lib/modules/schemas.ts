import { z } from 'zod';

export const createModuleSchema = z.object({
  title: z.string().min(2).max(160),
  description: z.string().max(2_000).optional(),
});

export const updateModuleSchema = z.object({
  title: z.string().min(2).max(160).optional(),
  description: z.string().max(2_000).optional().nullable(),
  publishedAt: z.coerce.date().nullable().optional(),
});

/** Body for module reorder: just the direction. */
export const reorderSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type CreateModuleInput = z.infer<typeof createModuleSchema>;
export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
