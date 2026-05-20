import { requireSession } from '@/lib/auth/session';
import { prisma } from '@/lib/prisma';
import { NotificationPreferencesService } from '@/lib/notification-preferences/service';
import { PreferencesView } from './preferences-view';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage() {
  const user = await requireSession();
  const matrix = await new NotificationPreferencesService(prisma).listForUser(user.id);
  return <PreferencesView initial={matrix} />;
}
