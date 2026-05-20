import { z } from 'zod';
import { QuestionType } from '@prisma/client';

export const createQuizSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(5_000).optional(),
  timeLimitMin: z.number().int().positive().max(24 * 60).optional(),
  maxAttempts: z.number().int().positive().max(20).default(1),
  shuffle: z.boolean().default(false),
});

export const updateQuizSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5_000).nullable().optional(),
  timeLimitMin: z.number().int().positive().max(24 * 60).nullable().optional(),
  maxAttempts: z.number().int().positive().max(20).optional(),
  shuffle: z.boolean().optional(),
  publishedAt: z.coerce.date().nullable().optional(),
});

/**
 * Question payload. We use discriminated union on `type` so each variant
 * carries exactly the fields it needs:
 *   - SINGLE_CHOICE / MULTIPLE_CHOICE: 2-10 options, at least one isCorrect
 *   - TRUE_FALSE: server creates two options "True"/"False" — caller picks `correct`
 *   - SHORT_ANSWER: `expectedAnswer` for auto-grading
 *   - LONG_ANSWER: graded manually, no options
 */
const baseQuestion = {
  prompt: z.string().min(1).max(2_000),
  points: z.number().positive().max(100).default(1),
};

export const createQuestionSchema = z.discriminatedUnion('type', [
  z.object({
    ...baseQuestion,
    type: z.literal(QuestionType.SINGLE_CHOICE),
    options: z
      .array(z.object({ text: z.string().min(1).max(500), isCorrect: z.boolean() }))
      .min(2)
      .max(10),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal(QuestionType.MULTIPLE_CHOICE),
    options: z
      .array(z.object({ text: z.string().min(1).max(500), isCorrect: z.boolean() }))
      .min(2)
      .max(10),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal(QuestionType.TRUE_FALSE),
    correct: z.boolean(),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal(QuestionType.SHORT_ANSWER),
    expectedAnswer: z.string().min(1).max(500),
  }),
  z.object({
    ...baseQuestion,
    type: z.literal(QuestionType.LONG_ANSWER),
  }),
]);

export const updateQuestionSchema = z.object({
  prompt: z.string().min(1).max(2_000).optional(),
  points: z.number().positive().max(100).optional(),
  expectedAnswer: z.string().min(1).max(500).nullable().optional(),
});

export const reorderQuestionSchema = z.object({
  direction: z.enum(['up', 'down']),
});

export type CreateQuizInput = z.infer<typeof createQuizSchema>;
export type UpdateQuizInput = z.infer<typeof updateQuizSchema>;
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;
export type ReorderQuestionInput = z.infer<typeof reorderQuestionSchema>;
