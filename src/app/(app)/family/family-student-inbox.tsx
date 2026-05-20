'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { ParentLinkDto } from '@/lib/parent-links/service';

interface Props {
  initialLinks: ParentLinkDto[];
  currentUserId: string;
}

export function FamilyStudentInbox({ initialLinks, currentUserId }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mine = initialLinks.filter((l) => l.child.id === currentUserId);
  const pending = mine.filter((l) => l.status === 'PENDING');
  const approved = mine.filter((l) => l.status === 'APPROVED');
  const past = mine.filter((l) => l.status === 'REJECTED' || l.status === 'REVOKED');

  async function decide(linkId: string, action: 'approve' | 'reject'): Promise<void> {
    setBusy(linkId + action);
    setError(null);
    try {
      await apiFetch(`/api/parent-links/${linkId}/${action}`, {
        method: 'PATCH',
        body: {},
      });
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error inesperado');
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-8 space-y-6">
      <Card>
        <CardTitle>Solicitudes pendientes ({pending.length})</CardTitle>
        {pending.length === 0 ? (
          <CardDescription className="mt-3">
            No tienes solicitudes pendientes. Cuando tu padre/madre/tutor pida vincularse a tu cuenta,
            aparecerá aquí.
          </CardDescription>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {pending.map((l) => (
              <li
                key={l.id}
                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{l.parent.fullName}</p>
                  <p className="text-xs text-slate-500">{l.parent.email}</p>
                  {l.notes && (
                    <p className="mt-1 text-xs italic text-slate-600">&quot;{l.notes}&quot;</p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => decide(l.id, 'approve')}
                    loading={busy === l.id + 'approve'}
                  >
                    Aprobar
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => decide(l.id, 'reject')}
                    loading={busy === l.id + 'reject'}
                  >
                    Rechazar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {error && <Alert variant="error" className="mt-3">{error}</Alert>}
      </Card>

      {approved.length > 0 && (
        <Card>
          <CardTitle>Vínculos aprobados ({approved.length})</CardTitle>
          <p className="mt-2 text-xs text-slate-500">
            Las personas siguientes pueden ver tus cursos, notas y materiales.
          </p>
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {approved.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span>
                  <span className="font-medium">{l.parent.fullName}</span>{' '}
                  <span className="text-slate-500">· {l.parent.email}</span>
                </span>
                <Badge variant="success">APROBADO</Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {past.length > 0 && (
        <Card>
          <CardTitle>Histórico</CardTitle>
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {past.map((l) => (
              <li key={l.id} className="flex items-center justify-between py-2 text-sm">
                <span>{l.parent.fullName}</span>
                <Badge variant={l.status === 'REJECTED' ? 'danger' : 'default'}>
                  {l.status}
                </Badge>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
