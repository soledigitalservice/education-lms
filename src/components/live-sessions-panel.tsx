'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { LiveSessionDto } from '@/lib/live-sessions/service';
import type { RecordingDto } from '@/lib/recordings/service';

interface Props {
  courseSlug: string;
  canManage: boolean;
}

export function LiveSessionsPanel({ courseSlug, canManage }: Props) {
  const router = useRouter();
  const [sessions, setSessions] = useState<LiveSessionDto[]>([]);
  const [recordings, setRecordings] = useState<RecordingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    setError(null);
    try {
      const [s, r] = await Promise.all([
        apiFetch<LiveSessionDto[]>(`/api/courses/${courseSlug}/live-sessions`),
        apiFetch<RecordingDto[]>(`/api/courses/${courseSlug}/recordings`),
      ]);
      setSessions(s);
      setRecordings(r);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseSlug]);

  const upcoming = sessions.filter(
    (s) => s.status === 'SCHEDULED' || s.status === 'LIVE',
  );
  const past = sessions.filter((s) => s.status === 'ENDED' || s.status === 'CANCELLED');

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Clases en vivo</CardTitle>
        {canManage && (
          <Button size="sm" onClick={() => setShowCreate(true)}>
            + Programar
          </Button>
        )}
      </div>

      {error && <Alert variant="error" className="mt-3">{error}</Alert>}

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Cargando…</p>
      ) : sessions.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          {canManage
            ? 'Aún no has programado clases en vivo. Pulsa "+ Programar" para crear la primera.'
            : 'El profesor aún no ha programado clases en vivo.'}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {upcoming.length > 0 && (
            <ul className="space-y-2">
              {upcoming.map((s) => (
                <li
                  key={s.id}
                  className="flex flex-col gap-2 rounded-md border border-slate-200 px-3 py-2 dark:border-slate-700 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <p className="text-sm font-medium">{s.title}</p>
                    <p className="flex items-center gap-2 text-xs text-slate-500">
                      <Badge variant={s.status === 'LIVE' ? 'brand' : 'warning'}>
                        {s.status === 'LIVE' ? 'EN VIVO' : 'Programada'}
                      </Badge>
                      <span>
                        {new Date(s.scheduledStart).toLocaleString('es', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </p>
                  </div>
                  <Link href={`/courses/${courseSlug}/live/${s.id}`}>
                    <Button size="sm" variant={s.status === 'LIVE' ? 'primary' : 'secondary'}>
                      {s.status === 'LIVE' ? 'Unirse ahora' : 'Ver sala'}
                    </Button>
                  </Link>
                </li>
              ))}
            </ul>
          )}

          {past.length > 0 && (
            <details>
              <summary className="cursor-pointer text-xs text-slate-500 hover:underline">
                Histórico ({past.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {past.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center justify-between gap-2 py-1 text-sm"
                  >
                    <span className="truncate">{s.title}</span>
                    <Badge variant={s.status === 'CANCELLED' ? 'danger' : 'default'}>
                      {s.status}
                    </Badge>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}

      {recordings.length > 0 && (
        <>
          <hr className="my-6 border-slate-200 dark:border-slate-800" />
          <CardTitle>Grabaciones</CardTitle>
          <ul className="mt-3 space-y-2">
            {recordings.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 rounded-md border border-slate-200 px-3 py-2 text-sm dark:border-slate-700"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">🎥 {r.sessionTitle}</p>
                  <p className="text-xs text-slate-500">
                    {new Date(r.startedAt).toLocaleDateString('es')}{' '}
                    {r.durationSec && `· ${Math.round(r.durationSec / 60)} min`}
                  </p>
                </div>
                {r.status === 'READY' && r.downloadUrl ? (
                  <a
                    href={r.downloadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm font-medium text-brand-600 hover:underline"
                  >
                    Ver →
                  </a>
                ) : (
                  <Badge variant={r.status === 'FAILED' ? 'danger' : 'warning'}>
                    {r.status}
                  </Badge>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      {showCreate && (
        <NewLiveSessionDialog
          courseSlug={courseSlug}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false);
            void reload();
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}

function NewLiveSessionDialog({
  courseSlug,
  onClose,
  onCreated,
}: {
  courseSlug: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [recordOnStart, setRecordOnStart] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/courses/${courseSlug}/live-sessions`, {
        method: 'POST',
        body: {
          title: title.trim(),
          scheduledStart: new Date(start).toISOString(),
          scheduledEnd: new Date(end).toISOString(),
          recordOnStart,
          allowChat: true,
          allowScreenShare: true,
        },
      });
      onCreated();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <h2 className="text-lg font-bold">Programar clase en vivo</h2>
        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="Título"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <Input
            label="Inicio"
            type="datetime-local"
            required
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
          <Input
            label="Fin"
            type="datetime-local"
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recordOnStart}
              onChange={(e) => setRecordOnStart(e.target.checked)}
              className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
            />
            Grabar automáticamente al iniciar
          </label>
          {error && <Alert variant="error">{error}</Alert>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Crear
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
