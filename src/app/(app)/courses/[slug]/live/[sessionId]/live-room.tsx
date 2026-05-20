'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LiveKitRoom, VideoConference, RoomAudioRenderer } from '@livekit/components-react';
import '@livekit/components-styles';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { LiveSessionDto } from '@/lib/live-sessions/service';
import type { MaterialDto } from '@/lib/materials/service';
import { DualViewer } from './dual-viewer';

interface Props {
  session: LiveSessionDto;
  materials: MaterialDto[];
  currentUserId: string;
  currentUserName: string;
}

interface TokenResponse {
  token: string;
  url: string;
  roomName: string;
  isHost: boolean;
}

export function LiveRoom({ session: initialSession, materials, currentUserId, currentUserName }: Props) {
  const router = useRouter();
  const [session, setSession] = useState<LiveSessionDto>(initialSession);
  const [tokenInfo, setTokenInfo] = useState<TokenResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const isHost = session.host.id === currentUserId;
  const cannotJoin =
    session.status === 'ENDED' || session.status === 'CANCELLED';

  async function fetchToken(): Promise<void> {
    setError(null);
    try {
      const t = await apiFetch<TokenResponse>(
        `/api/live-sessions/${session.id}/token`,
        { method: 'POST' },
      );
      setTokenInfo(t);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    }
  }

  async function startSession(): Promise<void> {
    setBusy(true);
    try {
      const s = await apiFetch<LiveSessionDto>(`/api/live-sessions/${session.id}/start`, {
        method: 'POST',
      });
      setSession(s);
      await fetchToken();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function endSession(): Promise<void> {
    if (!confirm('¿Finalizar la clase para todos los participantes?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/live-sessions/${session.id}/end`, { method: 'POST' });
      setTokenInfo(null);
      router.push(`/courses/${session.courseId}`);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  // Auto-fetch token when the session is LIVE and the user is allowed.
  useEffect(() => {
    if (session.status === 'LIVE' && !tokenInfo && !cannotJoin) {
      void fetchToken();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.status]);

  if (cannotJoin) {
    return (
      <Card>
        <CardTitle>{session.title}</CardTitle>
        <p className="mt-3 text-sm text-slate-500">
          Esta sesión {session.status === 'ENDED' ? 'ya terminó' : 'fue cancelada'}.
          Las grabaciones (si las hay) están disponibles en la página del curso.
        </p>
        <Button className="mt-4" variant="secondary" onClick={() => router.push(`/courses/${session.courseId}`)}>
          ← Volver al curso
        </Button>
      </Card>
    );
  }

  if (session.status === 'SCHEDULED') {
    return (
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>{session.title}</CardTitle>
          <Badge variant="warning">Programada</Badge>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Inicio previsto: {new Date(session.scheduledStart).toLocaleString('es')}
        </p>
        {session.description && (
          <p className="mt-3 whitespace-pre-wrap text-sm">{session.description}</p>
        )}
        {isHost ? (
          <div className="mt-6">
            <Button onClick={startSession} loading={busy}>
              Iniciar clase ahora
            </Button>
          </div>
        ) : (
          <p className="mt-6 text-sm text-slate-500">
            El profesor aún no ha iniciado la clase. Vuelve cuando esté en vivo.
          </p>
        )}
        {error && <Alert variant="error" className="mt-3">{error}</Alert>}
      </Card>
    );
  }

  if (!tokenInfo) {
    return (
      <Card>
        <p className="text-sm text-slate-500">Obteniendo acceso a la sala…</p>
        {error && <Alert variant="error" className="mt-3">{error}</Alert>}
      </Card>
    );
  }

  return (
    <div className="-mx-4 -mt-6 flex h-[calc(100vh-4rem)] flex-col sm:-mx-6 lg:-mx-8">
      <header className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-2 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-3">
          <Badge variant="brand">EN VIVO</Badge>
          <span className="font-medium">{session.title}</span>
          {isHost && <Badge variant="warning">Anfitrión</Badge>}
        </div>
        {isHost && (
          <Button size="sm" variant="danger" onClick={endSession} loading={busy}>
            Finalizar clase
          </Button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        <LiveKitRoom
          token={tokenInfo.token}
          serverUrl={tokenInfo.url}
          connect={true}
          video={isHost}
          audio={isHost}
          data-lk-theme="default"
          className="flex flex-1 overflow-hidden"
          onDisconnected={() => {
            // The user closed the tab / clicked Leave in the VideoConference UI.
            // Drop them back at the course page (host stays — they have the
            // "Finalizar clase" button instead).
            if (!isHost) router.push(`/courses/${session.courseId}`);
          }}
        >
          <RoomAudioRenderer />
          {/* Layout: video on the left, dual-pane content on the right */}
          <div className="flex flex-1 flex-col lg:flex-row">
            <div className="flex flex-1 flex-col bg-slate-950">
              <VideoConference />
            </div>
            <aside className="flex w-full flex-col border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 lg:w-[420px] lg:border-l lg:border-t-0">
              <DualViewer materials={materials} isHost={isHost} />
            </aside>
          </div>
        </LiveKitRoom>
      </div>
    </div>
  );
}
