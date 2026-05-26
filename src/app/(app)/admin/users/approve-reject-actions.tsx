'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';

interface Props {
  teacherId: string;
}

export function ApproveRejectActions({ teacherId }: Props) {
  const router = useRouter();
  const t = useT();
  const [busy, setBusy] = useState<null | 'approve' | 'reject'>(null);
  const [error, setError] = useState<string | null>(null);

  async function act(kind: 'approve' | 'reject'): Promise<void> {
    setBusy(kind);
    setError(null);
    try {
      await apiFetch(`/api/users/${teacherId}/${kind}`, {
        method: 'POST',
        body: kind === 'reject' ? { reason: 'Rejected from admin panel' } : {},
      });
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError(t('Error inesperado'));
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="primary"
          loading={busy === 'approve'}
          disabled={busy !== null}
          onClick={() => act('approve')}
        >
          {t('Aprobar')}
        </Button>
        <Button
          size="sm"
          variant="danger"
          loading={busy === 'reject'}
          disabled={busy !== null}
          onClick={() => act('reject')}
        >
          {t('Rechazar')}
        </Button>
      </div>
      {error ? <p className="text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
