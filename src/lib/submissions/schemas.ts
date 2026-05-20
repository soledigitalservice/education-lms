import { z } from 'zod';

/** Save draft = add/replace files + notes without "submitting" yet. */
export const draftSubmissionSchema = z.object({
  notes: z.string().max(10_000).optional(),
  /// Files to add to the draft (additive). Use DELETE
  /// /api/submission-files/:id to remove a previously-attached file.
  addFileIds: z.array(z.string().cuid()).max(20).optional(),
});

/** Submit = freeze + timestamp. Server computes late vs assignment.dueAt. */
export const submitSubmissionSchema = z.object({
  notes: z.string().max(10_000).optional(),
});

export type DraftSubmissionInput = z.infer<typeof draftSubmissionSchema>;
export type SubmitSubmissionInput = z.infer<typeof submitSubmissionSchema>;
