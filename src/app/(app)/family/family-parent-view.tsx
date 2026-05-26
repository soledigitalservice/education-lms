'use client';

import { useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';
import type { ParentLinkDto } from '@/lib/parent-links/service';

interface Props {
  initialLinks: ParentLinkDto[];
  currentUserId: string;
}

export function FamilyParentView({ initialLinks, currentUserId }: Props) {
  const router = useRouter();
  const t = useT();
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Show only links where I'm the parent (the listMine endpoint also includes
  // ones where I might be a student, but parents normally aren't students).
  const myLinks = initialLinks.filter((l) => l.parent.id === currentUserId);
  const approved = myLinks.filter((l) => l.status === 'APPROVED');
  const pending = myLinks.filter((l) => l.status === 'PENDING');
  const other = myLinks.filter((l) => l.status === 'REJECTED' || l.status === 'REVOKED');

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await apiFetch('/api/parent-links', {
        method: 'POST',
        body: { childEmail: email.trim(), notes: notes.trim() || undefined },
      });
      setSuccess(t('Solicitud enviada. Tu hijo/a la verá en su sección "Familia" y podrá aprobarla.'));
      setEmail('');
      setNotes('');
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError(t('Error inesperado'));
      }
    } finally {
      setBusy(false);
    }
  }

  async function revoke(id: string): Promise<void> {
    if (!confirm(t('¿Revocar este vínculo? Perderás el acceso a las notas y cursos del estudiante.'))) {
      return;
    }
    await apiFetch(`/api/parent-links/${id}`, { method: 'DELETE' });
    router.refresh();
  }

  return (
    <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="space-y-6">
        <Card>
          <CardTitle>{t('Hijos vinculados ({n})', { n: approved.length })}</CardTitle>
          {approved.length === 0 ? (
            <CardDescription className="mt-3">
              {t('Aún no tienes vínculos aprobados. Solicita uno usando el formulario a la derecha.')}
            </CardDescription>
          ) : (
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {approved.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{l.child.fullName}</p>
                    <p className="text-xs text-slate-500">{l.child.email}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/family/${l.child.id}`}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      {t('Ver →')}
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => revoke(l.id)}>
                      {t('Revocar')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {pending.length > 0 && (
          <Card>
            <CardTitle>{t('Solicitudes pendientes ({n})', { n: pending.length })}</CardTitle>
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {pending.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="text-sm font-medium">{l.child.fullName}</p>
                    <p className="text-xs text-slate-500">
                      {l.child.email} · solicitada {new Date(l.requestedAt).toLocaleDateString('es')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="warning">{t('Esperando aprobación')}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => revoke(l.id)}>
                      {t('Cancelar')}
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {other.length > 0 && (
          <Card>
            <CardTitle>{t('Histórico')}</CardTitle>
            <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
              {other.map((l) => (
                <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                  <span>{l.child.fullName}</span>
                  <Badge variant={l.status === 'REJECTED' ? 'danger' : 'default'}>
                    {l.status}
                  </Badge>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </div>

      <Card>
        <CardTitle>{t('Solicitar nuevo vínculo')}</CardTitle>
        <CardDescription className="mt-2">
          {t('Tu hijo/a debe tener ya una cuenta de estudiante en la plataforma. Verá tu solicitud al iniciar sesión y deberá aprobarla.')}
        </CardDescription>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
          <Input
            label={t('Email del estudiante')}
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">{t('Nota para tu hijo/a (opcional)')}</label>
            <textarea
              className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          {error && <Alert variant="error">{error}</Alert>}
          {success && <Alert variant="success">{success}</Alert>}
          <Button type="submit" loading={busy} className="self-start">
            {t('Enviar solicitud')}
          </Button>
        </form>
      </Card>
    </div>
  );
}
