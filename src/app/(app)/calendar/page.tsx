import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { CalendarService } from '@/lib/calendar/service';
import { CalendarView } from './calendar-view';

export const dynamic = 'force-dynamic';

export default async function CalendarPage() {
  const user = await requireSession();
  // Server-side pre-load: this month + next 2.
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 3, 0, 23, 59, 59);
  const events = await new CalendarService(prisma).eventsForUser(user.id, user.role, {
    from,
    to,
  });
  return <CalendarView initialEvents={events} initialMonth={`${now.getFullYear()}-${now.getMonth() + 1}`} />;
}
