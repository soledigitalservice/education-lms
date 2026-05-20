import { z } from 'zod';

export const createThreadSchema = z.object({
  title: z.string().min(2).max(200),
  /** Body of the opening post; required so the thread doesn't appear empty. */
  body: z.string().min(1).max(20_000),
});

export const createPostSchema = z.object({
  body: z.string().min(1).max(20_000),
  /** Optional parent post id to thread a reply (single level — UI flattens deeper nesting). */
  parentId: z.string().cuid().optional(),
});

export const updatePostSchema = z.object({
  body: z.string().min(1).max(20_000),
});

export const moderateThreadSchema = z.object({
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
});

export type CreateThreadInput = z.infer<typeof createThreadSchema>;
export type CreatePostInput = z.infer<typeof createPostSchema>;
export type UpdatePostInput = z.infer<typeof updatePostSchema>;
export type ModerateThreadInput = z.infer<typeof moderateThreadSchema>;
