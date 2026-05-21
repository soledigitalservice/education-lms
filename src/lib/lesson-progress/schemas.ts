import { z } from 'zod';

/** Body for PUT /api/lessons/[id]/complete — toggle completion. */
export const setCompletedSchema = z.object({
  completed: z.boolean(),
});

export type SetCompletedInput = z.infer<typeof setCompletedSchema>;
