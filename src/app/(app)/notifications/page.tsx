import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { NotificationsService } from '@/lib/notifications/service';
import { NotificationsView } from './notifications-view';

export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const user = await requireSession();
  const svc = new NotificationsService(prisma);
  const initial = await svc.listForUser(user.id, { limit: 50 });
  const unread = await svc.unreadCountForUser(user.id);
  return <NotificationsView initial={initial} initialUnread={unread} />;
}
