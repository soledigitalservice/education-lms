import { z } from 'zod';

export const createScheduleEventSchema = z
  .object({
    title: z.string().min(1).max(200),
    notes: z.string().max(2_000).optional(),
    startsAt: z.coerce.date(),
    endsAt: z.coerce.date(),
    allDay: z.boolean().default(false),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex code like #2563eb')
      .optional(),
    courseId: z.string().cuid().optional(),
    liveSessionId: z.string().cuid().optional(),
  })
  .refine((v) => v.endsAt >= v.startsAt, {
    message: 'endsAt must be after startsAt',
    path: ['endsAt'],
  });

export const updateScheduleEventSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    notes: z.string().max(2_000).nullable().optional(),
    startsAt: z.coerce.date().optional(),
    endsAt: z.coerce.date().optional(),
    allDay: z.boolean().optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex code like #2563eb')
      .nullable()
      .optional(),
  })
  .refine(
    (v) =>
      v.startsAt === undefined || v.endsAt === undefined || v.endsAt >= v.startsAt,
    { message: 'endsAt must be after startsAt', path: ['endsAt'] },
  );

export type CreateScheduleEventInput = z.infer<typeof createScheduleEventSchema>;
export type UpdateScheduleEventInput = z.infer<typeof updateScheduleEventSchema>;
