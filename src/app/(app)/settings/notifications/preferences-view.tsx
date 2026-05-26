'use client';

import { useMemo, useState } from 'react';
import { NotificationChannel, NotificationKind } from '@prisma/client';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';
import type { PreferenceMatrixCell } from '@/lib/notification-preferences/service';

const KIND_LABELS: Record<NotificationKind, string> = {
  TEACHER_APPROVED: 'Cuenta de profesor aprobada',
  TEACHER_REJECTED: 'Solicitud rechazada',
  ENROLLMENT_REQUESTED: 'Nueva solicitud de inscripción',
  ENROLLMENT_APPROVED: 'Inscripción aprobada',
  ENROLLMENT_REJECTED: 'Inscripción rechazada',
  ENROLLMENT_REMOVED: 'Baja de curso',
  ASSIGNMENT_PUBLISHED: 'Nueva tarea publicada',
  ASSIGNMENT_GRADED: 'Tarea calificada',
  ASSIGNMENT_DUE_SOON: 'Recordatorio: tarea por vencer',
  LIVE_SESSION_STARTING: 'Clase en vivo empezando',
  CHAT_MESSAGE: 'Mensajes de chat',
  PARENT_LINK_REQUESTED: 'Solicitud de vínculo padre',
  PARENT_LINK_APPROVED: 'Vínculo padre aprobado',
  FORUM_REPLY: 'Respuesta en foro',
};

const CHANNEL_LABELS: Record<NotificationChannel, string> = {
  INAPP: 'In-app',
  EMAIL: 'Email',
  PUSH: 'Push',
};

const ALL_KINDS = Object.values(NotificationKind);
const ALL_CHANNELS = Object.values(NotificationChannel);

export function PreferencesView({ initial }: { initial: PreferenceMatrixCell[] }) {
  const t = useT();
  // Local state: convert array to a lookup for fast toggling.
  const initialMap = useMemo(() => {
    const m = new Map<string, PreferenceMatrixCell>();
    for (const cell of initial) m.set(`${cell.kind}:${cell.channel}`, cell);
    return m;
  }, [initial]);

  const [cells, setCells] = useState<Map<string, PreferenceMatrixCell>>(initialMap);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function toggle(kind: NotificationKind, channel: NotificationChannel): void {
    const key = `${kind}:${channel}`;
    const current = cells.get(key);
    if (!current || current.locked) return;
    const next = new Map(cells);
    next.set(key, { ...current, enabled: !current.enabled, isDefault: false });
    setCells(next);
    setDirty(true);
    setSaved(false);
  }

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      // Send only non-default rows so the DB stays sparse and future
      // default changes propagate to users who never opted out.
      const preferences = Array.from(cells.values())
        .filter((c) => !c.locked && !c.isDefault)
        .map((c) => ({ kind: c.kind, channel: c.channel, enabled: c.enabled }));
      const fresh = await apiFetch<PreferenceMatrixCell[]>(
        '/api/me/notification-preferences',
        { method: 'PUT', body: { preferences } },
      );
      const next = new Map<string, PreferenceMatrixCell>();
      for (const cell of fresh) next.set(`${cell.kind}:${cell.channel}`, cell);
      setCells(next);
      setDirty(false);
      setSaved(true);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  function resetChannel(channel: NotificationChannel, enable: boolean): void {
    if (channel === NotificationChannel.INAPP) return; // locked
    const next = new Map(cells);
    for (const kind of ALL_KINDS) {
      const key = `${kind}:${channel}`;
      const cur = next.get(key);
      if (cur && !cur.locked) {
        next.set(key, { ...cur, enabled: enable, isDefault: false });
      }
    }
    setCells(next);
    setDirty(true);
    setSaved(false);
  }

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <h1 className="text-2xl font-bold">{t('Preferencias de notificación')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          {t('Elige cómo recibes cada tipo de aviso. Las notificaciones in-app no se pueden desactivar — la campana es tu registro permanente.')}
        </p>
      </header>

      <Card className="mt-6">
        <CardTitle>{t('Atajos por canal')}</CardTitle>
        <CardDescription className="mt-1">
          {t('Activa o desactiva todos los tipos para un canal de golpe. Luego puedes ajustar excepciones en la tabla de abajo.')}
        </CardDescription>
        <div className="mt-4 flex flex-wrap gap-2">
          {ALL_CHANNELS.filter((c) => c !== NotificationChannel.INAPP).map((channel) => (
            <div key={channel} className="flex items-center gap-1">
              <span className="text-xs text-slate-500">{CHANNEL_LABELS[channel]}:</span>
              <Button size="sm" variant="ghost" onClick={() => resetChannel(channel, true)}>
                {t('activar todo')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => resetChannel(channel, false)}>
                {t('desactivar todo')}
              </Button>
            </div>
          ))}
        </div>
      </Card>

      <Card className="mt-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800">
              <th className="py-2 pr-3 text-left font-medium">{t('Tipo de aviso')}</th>
              {ALL_CHANNELS.map((c) => (
                <th key={c} className="px-2 py-2 text-center font-medium">
                  {t(CHANNEL_LABELS[c])}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ALL_KINDS.map((kind) => (
              <tr
                key={kind}
                className="border-b border-slate-100 last:border-0 dark:border-slate-800/50"
              >
                <td className="py-2 pr-3">{t(KIND_LABELS[kind] ?? kind)}</td>
                {ALL_CHANNELS.map((channel) => {
                  const cell = cells.get(`${kind}:${channel}`);
                  if (!cell) return <td key={channel} />;
                  return (
                    <td key={channel} className="px-2 py-2 text-center">
                      <label
                        className={
                          'inline-flex cursor-pointer items-center justify-center ' +
                          (cell.locked ? 'cursor-not-allowed opacity-50' : '')
                        }
                        title={cell.locked ? t('In-app no puede desactivarse') : undefined}
                      >
                        <input
                          type="checkbox"
                          checked={cell.enabled}
                          disabled={cell.locked}
                          onChange={() => toggle(kind, channel)}
                          className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                        />
                      </label>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {error && <Alert variant="error" className="mt-4">{error}</Alert>}

      <div className="mt-6 flex items-center justify-end gap-3">
        {saved && <Badge variant="success">{t('Guardado')}</Badge>}
        <Button onClick={save} loading={busy} disabled={!dirty}>
          {t('Guardar cambios')}
        </Button>
      </div>
    </>
  );
}
