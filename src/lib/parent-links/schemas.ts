import { z } from 'zod';

/** Parent → "I want to link to this student email". */
export const requestLinkSchema = z.object({
  childEmail: z.string().email().max(254),
  notes: z.string().max(500).optional(),
});

/** Decision body when the child approves / rejects. */
export const decideLinkSchema = z.object({
  notes: z.string().max(500).optional(),
});

export type RequestLinkInput = z.infer<typeof requestLinkSchema>;
export type DecideLinkInput = z.infer<typeof decideLinkSchema>;
