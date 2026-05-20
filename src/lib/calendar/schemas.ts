import { z } from 'zod';

/** Range defaults: today → today + 60d when not specified. */
export const calendarQuerySchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type CalendarQuery = z.infer<typeof calendarQuerySchema>;

/** Discriminator used by the UI to pick the right icon/style/link. */
export type CalendarEventKind =
  | 'LIVE_SESSION'
  | 'ASSIGNMENT_DUE'
  | 'COURSE_START'
  | 'COURSE_END'
  | 'MANUAL';
