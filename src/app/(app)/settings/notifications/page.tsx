import { redirect } from 'next/navigation';

import { requireSession } from '@/lib/auth/session';
import { Roles } from '@/lib/rbac/roles';
import { prisma } from '@/lib/prisma';
import { NotificationPreferencesService } from '@/lib/notification-preferences/service';
import { PreferencesView } from './preferences-view';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage() {
  const user = await requireSession();
  // Settings are admin-only by client request.
  if (user.role !== Roles.ADMIN) redirect('/dashboard');
  const matrix = await new NotificationPreferencesService(prisma).listForUser(user.id);
  return <PreferencesView initial={matrix} />;
}
