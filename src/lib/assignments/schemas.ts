import { z } from 'zod';

export const createAssignmentSchema = z.object({
  /// If provided, the assignment is bound to the lesson (1-1). Lesson type
  /// should be ASSIGNMENT (the service does NOT auto-flip it — the caller
  /// can change it through the lessons API if needed).
  lessonId: z.string().cuid().optional(),
  title: z.string().min(2).max(200),
  instructions: z.string().max(20_000).optional(),
  maxScore: z.number().positive().max(10_000).default(100),
  dueAt: z.coerce.date().optional().nullable(),
  allowLate: z.boolean().default(true),
  /// % penalty deducted from numericValue when SUBMITTED past dueAt.
  /// 0 means "no penalty, just flagged late"; 100 means "full credit lost".
  latePenaltyPct: z.number().min(0).max(100).default(0),
  /// Optional initial attachments (already uploaded via /api/uploads/sign).
  attachmentFileIds: z.array(z.string().cuid()).max(20).optional(),
});

export const updateAssignmentSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  instructions: z.string().max(20_000).optional().nullable(),
  maxScore: z.number().positive().max(10_000).optional(),
  dueAt: z.coerce.date().optional().nullable(),
  allowLate: z.boolean().optional(),
  latePenaltyPct: z.number().min(0).max(100).optional(),
  publishedAt: z.coerce.date().nullable().optional(),
});

export const addAttachmentSchema = z.object({
  fileId: z.string().cuid(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;
export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;
export type AddAttachmentInput = z.infer<typeof addAttachmentSchema>;
