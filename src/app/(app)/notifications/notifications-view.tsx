'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { NotificationDto } from '@/lib/notifications/service';
import { EnablePushButton } from './enable-push-button';

const KIND_LABELS: Record<string, string> = {
  TEACHER_APPROVED: 'Cuenta aprobada',
  TEACHER_REJECTED: 'Solicitud rechazada',
  ENROLLMENT_REQUESTED: 'Nueva inscripción',
  ENROLLMENT_APPROVED: 'Inscripción aprobada',
  ENROLLMENT_REJECTED: 'Inscripción rechazada',
  ENROLLMENT_REMOVED: 'Baja de curso',
  ASSIGNMENT_PUBLISHED: 'Nueva tarea',
  ASSIGNMENT_GRADED: 'Tarea calificada',
  ASSIGNMENT_DUE_SOON: 'Tarea por vencer',
  LIVE_SESSION_STARTING: 'Clase empieza',
  CHAT_MESSAGE: 'Mensaje',
  PARENT_LINK_REQUESTED: 'Solicitud padre',
  PARENT_LINK_APPROVED: 'Vínculo aprobado',
  FORUM_REPLY: 'Respuesta foro',
};

interface Props {
  initial: NotificationDto[];
  initialUnread: number;
}

export function NotificationsView({ initial, initialUnread }: Props) {
  const router = useRouter();
  const [items, setItems] = useState<NotificationDto[]>(initial);
  const [unread, setUnread] = useState(initialUnread);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function markRead(id: string): Promise<void> {
    setBusy(id);
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PATCH' });
      setItems(items.map((n) => (n.id === id ? { ...n, readAt: new Date().toISOString() } : n)));
      setUnread((c) => Math.max(0, c - 1));
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(null);
    }
  }

  async function markAllRead(): Promise<void> {
    setBusy('all');
    try {
      await apiFetch('/api/me/notifications/read-all', { method: 'POST' });
      const now = new Date().toISOString();
      setItems(items.map((n) => (n.readAt ? n : { ...n, readAt: now })));
      setUnread(0);
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-6 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Notificaciones</h1>
          <p className="mt-1 text-sm text-slate-500">
            {unread} sin leer · {items.length} total ·{' '}
            <Link
              href="/settings/notifications"
              className="font-medium text-brand-600 hover:underline"
            >
              gestionar preferencias
            </Link>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <EnablePushButton />
          <Button
            variant="secondary"
            size="sm"
            onClick={markAllRead}
            disabled={unread === 0}
            loading={busy === 'all'}
          >
            Marcar todas como leídas
          </Button>
        </div>
      </header>

      {error && <Alert variant="error" className="mt-4">{error}</Alert>}

      {items.length === 0 ? (
        <Card className="mt-8">
          <CardTitle>Sin notificaciones</CardTitle>
          <CardDescription className="mt-2">
            Aquí aparecerán los avisos: tareas por vencer, calificaciones, mensajes, clases que
            empiezan, etc.
          </CardDescription>
        </Card>
      ) : (
        <ul className="mt-6 space-y-2">
          {items.map((n) => {
            const unreadStyle = !n.readAt
              ? 'border-l-4 border-l-brand-500 bg-brand-50/40 dark:bg-brand-950/20'
              : 'opacity-70';
            const body = (
              <div
                className={
                  'flex items-start gap-3 rounded-lg border border-slate-200 bg-white p-3 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 ' +
                  unreadStyle
                }
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Badge variant="default">{KIND_LABELS[n.kind] ?? n.kind}</Badge>
                    <span className="text-xs text-slate-500">
                      {new Date(n.createdAt).toLocaleString('es', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                  </div>
                  <p className="mt-1 font-medium">{n.title}</p>
                  <p className="text-sm text-slate-600 dark:text-slate-300">{n.body}</p>
                </div>
                {!n.readAt && (
                  <Button
                    size="sm"
                    variant="ghost"
                    loading={busy === n.id}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void markRead(n.id);
                    }}
                  >
                    Marcar leída
                  </Button>
                )}
              </div>
            );
            return (
              <li key={n.id}>
                {n.link ? (
                  <Link
                    href={n.link}
                    onClick={() => {
                      if (!n.readAt) void markRead(n.id);
                    }}
                  >
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
