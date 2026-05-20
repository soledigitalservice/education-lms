'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';

interface Props {
  enrollmentId: string;
  kind: 'pending' | 'active';
}

export function EnrollmentRowActions({ enrollmentId, kind }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(action: 'approve' | 'reject' | 'remove'): Promise<void> {
    if (action === 'remove' && !confirm('¿Dar de baja a este alumno?')) return;
    setBusy(action);
    setError(null);
    try {
      if (action === 'remove') {
        await apiFetch(`/api/enrollments/${enrollmentId}`, { method: 'DELETE' });
      } else {
        await apiFetch(`/api/enrollments/${enrollmentId}/${action}`, {
          method: 'PATCH',
          body: {},
        });
      }
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
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        {kind === 'pending' ? (
          <>
            <Button size="sm" loading={busy === 'approve'} onClick={() => call('approve')}>
              Aprobar
            </Button>
            <Button
              size="sm"
              variant="danger"
              loading={busy === 'reject'}
              onClick={() => call('reject')}
            >
              Rechazar
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            variant="danger"
            loading={busy === 'remove'}
            onClick={() => call('remove')}
          >
            Dar de baja
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
