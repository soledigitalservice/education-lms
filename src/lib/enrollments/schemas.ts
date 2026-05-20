import { z } from 'zod';
import { EnrollmentStatus } from '@prisma/client';

export const listEnrollmentsQuerySchema = z.object({
  status: z.nativeEnum(EnrollmentStatus).optional(),
});

export const decideEnrollmentSchema = z.object({
  reason: z.string().max(500).optional(),
});

export type DecideEnrollmentInput = z.infer<typeof decideEnrollmentSchema>;
export type ListEnrollmentsQuery = z.infer<typeof listEnrollmentsQuerySchema>;
