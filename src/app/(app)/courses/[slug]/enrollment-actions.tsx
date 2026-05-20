'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiFetch, HttpError } from '@/lib/api/client';

interface Props {
  courseSlug: string;
  myStatus: string | null;
}

export function EnrollmentActions({ courseSlug, myStatus }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(method: 'POST' | 'DELETE'): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/courses/${courseSlug}/enrollments`, { method });
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error inesperado');
      }
    } finally {
      setBusy(false);
    }
  }

  if (myStatus === 'ACTIVE') {
    return (
      <div className="flex flex-col items-end gap-1">
        <div className="flex items-center gap-2">
          <Badge variant="success">Inscrito</Badge>
          <Button variant="ghost" size="sm" loading={busy} onClick={() => act('DELETE')}>
            Darse de baja
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (myStatus === 'PENDING') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge variant="warning">Solicitud pendiente</Badge>
        <Button variant="ghost" size="sm" loading={busy} onClick={() => act('DELETE')}>
          Cancelar solicitud
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (myStatus === 'REJECTED') {
    return (
      <div className="flex flex-col items-end gap-1">
        <Badge variant="danger">Solicitud rechazada</Badge>
        <Button size="sm" loading={busy} onClick={() => act('POST')}>
          Volver a solicitar
        </Button>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    );
  }

  if (myStatus === 'COMPLETED') {
    return <Badge variant="success">Completado</Badge>;
  }

  // Not enrolled yet (or previously REMOVED).
  return (
    <div className="flex flex-col items-end gap-1">
      <Button loading={busy} onClick={() => act('POST')}>
        {myStatus === 'REMOVED' ? 'Volver a solicitar acceso' : 'Solicitar acceso'}
      </Button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
