'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import { ChatUnreadBadge } from '@/components/chat-unread-badge';
import { NotificationBell } from '@/components/notification-bell';
import { LanguageToggle } from '@/components/language-toggle';
import { useT } from '@/lib/i18n/client';
import { apiFetch } from '@/lib/api/client';
import { cn } from '@/lib/cn';
import { Roles, ROLE_LABELS, type Role } from '@/lib/rbac/roles';
import type { SessionUser } from '@/lib/auth/session';

interface NavItem {
  href: string;
  label: string;
  roles?: Role[]; // if omitted, available to all roles
}

const NAV: NavItem[] = [
  { href: '/dashboard', label: 'Inicio' },
  { href: '/courses', label: 'Catálogo' },
  { href: '/my/courses', label: 'Mis cursos' },
  { href: '/my/grades', label: 'Mis notas', roles: [Roles.STUDENT] },
  { href: '/family', label: 'Familia', roles: [Roles.PARENT, Roles.STUDENT] },
  { href: '/messages', label: 'Mensajes' },
  { href: '/calendar', label: 'Calendario' },
  { href: '/settings/notifications', label: 'Ajustes' },
  { href: '/admin/users', label: 'Usuarios', roles: [Roles.ADMIN] },
  { href: '/admin/categories', label: 'Categorías', roles: [Roles.ADMIN] },
  { href: '/admin/stats', label: 'Estadísticas', roles: [Roles.ADMIN] },
];

interface Props {
  user: SessionUser;
  children: React.ReactNode;
}

export function AppShell({ user, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const items = NAV.filter((i) => !i.roles || i.roles.includes(user.role));

  async function logout(): Promise<void> {
    setLoggingOut(true);
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } finally {
      router.push('/login');
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <Link
            href="/dashboard"
            className="text-base font-semibold tracking-tight text-brand-700 dark:text-brand-300"
          >
            Education LMS
          </Link>

          <nav className="hidden md:flex md:items-center md:gap-1">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center rounded-md px-3 py-1.5 text-sm font-medium transition',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  {t(item.label)}
                  {item.href === '/messages' && <ChatUnreadBadge />}
                </Link>
              );
            })}
          </nav>

          <div className="ml-auto flex items-center gap-2">
            <LanguageToggle className="hidden sm:inline-flex" />
            <NotificationBell />
            <div className="hidden text-right sm:block">
              <p className="text-sm font-medium leading-tight">{user.fullName}</p>
              <p className="text-xs text-slate-500">{t(ROLE_LABELS[user.role])}</p>
            </div>
            <Button variant="secondary" size="sm" onClick={logout} loading={loggingOut}>
              {t('Salir')}
            </Button>
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label="Toggle navigation"
              className="md:hidden rounded-md p-2 text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <line x1="3" y1="6" x2="21" y2="6" />
                <line x1="3" y1="12" x2="21" y2="12" />
                <line x1="3" y1="18" x2="21" y2="18" />
              </svg>
            </button>
          </div>
        </div>
        {mobileOpen ? (
          <nav className="border-t border-slate-200 px-2 py-2 md:hidden dark:border-slate-800">
            {items.map((item) => {
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={cn(
                    'block rounded-md px-3 py-2 text-sm font-medium transition',
                    active
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200'
                      : 'text-slate-700 hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800',
                  )}
                >
                  {t(item.label)}
                </Link>
              );
            })}
            <div className="px-3 py-2">
              <LanguageToggle />
            </div>
          </nav>
        ) : null}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
