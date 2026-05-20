import { z } from 'zod';

/**
 * Answer payload schemas mirror the autograder's reader expectations.
 * Keeping them strict here means callers get a 400 with a clear field path
 * if they send the wrong shape.
 */
export const submitAnswerSchema = z.object({
  questionId: z.string().cuid(),
  payload: z.union([
    z.object({ optionId: z.string().cuid() }),
    z.object({ optionIds: z.array(z.string().cuid()).min(1).max(20) }),
    z.object({ value: z.boolean() }),
    z.object({ text: z.string().min(1).max(20_000) }),
  ]),
});

export type SubmitAnswerInput = z.infer<typeof submitAnswerSchema>;
