import { z } from 'zod';
import { GradeScale } from '@prisma/client';

/**
 * Discriminated union per scale — keeps the rules tight:
 *   - NUMERIC: numericValue is required, in [0, assignment.maxScore]
 *   - CONCEPT: conceptValue is required (free text, e.g. "Excellent")
 *   - LETTER : letterValue is required, must be one of A/B/C/D/F (± allowed)
 */
export const upsertGradeSchema = z.discriminatedUnion('scale', [
  z.object({
    scale: z.literal(GradeScale.NUMERIC),
    numericValue: z.number().min(0),
    feedback: z.string().max(20_000).optional(),
  }),
  z.object({
    scale: z.literal(GradeScale.CONCEPT),
    conceptValue: z.string().min(1).max(80),
    feedback: z.string().max(20_000).optional(),
  }),
  z.object({
    scale: z.literal(GradeScale.LETTER),
    letterValue: z
      .string()
      .min(1)
      .max(2)
      .regex(/^[A-F][+-]?$/, 'Letter grade must be A/B/C/D/F optionally followed by + or -'),
    feedback: z.string().max(20_000).optional(),
  }),
]);

export type UpsertGradeInput = z.infer<typeof upsertGradeSchema>;
