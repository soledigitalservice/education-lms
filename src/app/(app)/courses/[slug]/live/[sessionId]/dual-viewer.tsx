'use client';

import { useCallback, useEffect, useState } from 'react';
import { useDataChannel } from '@livekit/components-react';

import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { apiFetch } from '@/lib/api/client';
import type { MaterialDto } from '@/lib/materials/service';

interface Props {
  materials: MaterialDto[];
  isHost: boolean;
}

/**
 * Dual-viewer: the right panel of the live class UI. The teacher (isHost)
 * picks a material from a dropdown; selecting one broadcasts a
 * `data:material-change` event to the LiveKit room. All participants
 * receive it and update their view at the same instant.
 *
 * This uses LiveKit data channels (UDP-style, low-latency, no server),
 * which is perfect for sync events like this.
 */
interface MaterialChangeEvent {
  type: 'material-change';
  materialId: string | null;
  /** Optional page hint for PDFs — included so future "go to page N" works the same way. */
  page?: number;
}

const TOPIC = 'edu-sync';

export function DualViewer({ materials, isHost }: Props) {
  const [activeMaterialId, setActiveMaterialId] = useState<string | null>(null);
  const [activeUrl, setActiveUrl] = useState<string | null>(null);

  // Subscribe to messages on the sync topic.
  const { send: sendData, message: lastMessage } = useDataChannel(TOPIC);

  useEffect(() => {
    if (!lastMessage) return;
    try {
      const text = new TextDecoder().decode(lastMessage.payload);
      const ev = JSON.parse(text) as MaterialChangeEvent;
      if (ev.type === 'material-change') {
        setActiveMaterialId(ev.materialId);
      }
    } catch {
      // ignore malformed data; data channel is best-effort
    }
  }, [lastMessage]);

  // When the active material changes, resolve a download URL (presigned).
  // Cache per-render; if the same material is reselected we hit the API again,
  // which is fine — presigned URLs are cheap and short-lived.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activeMaterialId) {
        setActiveUrl(null);
        return;
      }
      const material = materials.find((m) => m.id === activeMaterialId);
      if (!material) {
        setActiveUrl(null);
        return;
      }
      // For LINK / VIDEO_EMBED the url IS the public URL.
      if (material.type === 'LINK' || material.type === 'VIDEO_EMBED') {
        if (!cancelled) setActiveUrl(material.url);
        return;
      }
      try {
        const res = await apiFetch<{ url: string }>(`/api/materials/${material.id}/download`);
        if (!cancelled) setActiveUrl(res.url);
      } catch {
        if (!cancelled) setActiveUrl(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeMaterialId, materials]);

  const broadcast = useCallback(
    (ev: MaterialChangeEvent) => {
      const payload = new TextEncoder().encode(JSON.stringify(ev));
      // `reliable` so late joiners' state catches up. The default is lossy.
      sendData(payload, { reliable: true, topic: TOPIC });
    },
    [sendData],
  );

  function pickMaterial(materialId: string): void {
    setActiveMaterialId(materialId || null);
    broadcast({ type: 'material-change', materialId: materialId || null });
  }

  const active = materials.find((m) => m.id === activeMaterialId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {isHost && (
        <div className="border-b border-slate-200 p-3 dark:border-slate-800">
          <label className="text-xs font-medium text-slate-500">Material a mostrar</label>
          <div className="mt-1 flex gap-2">
            <Select
              value={activeMaterialId ?? ''}
              onChange={(e) => pickMaterial(e.target.value)}
              className="flex-1"
            >
              <option value="">— Nada —</option>
              {materials.map((m) => (
                <option key={m.id} value={m.id}>
                  {iconFor(m.type)} {m.title}
                </option>
              ))}
            </Select>
            {activeMaterialId && (
              <Button size="sm" variant="ghost" onClick={() => pickMaterial('')}>
                Quitar
              </Button>
            )}
          </div>
          <p className="mt-1 text-[10px] text-slate-500">
            Lo que selecciones aquí se sincroniza con todos los alumnos al instante.
          </p>
        </div>
      )}

      <div className="flex-1 overflow-hidden bg-slate-50 p-3 dark:bg-slate-950">
        {!active ? (
          <p className="flex h-full items-center justify-center text-center text-sm text-slate-500">
            {isHost
              ? 'Selecciona un material arriba para compartirlo con la clase.'
              : 'El profesor aún no ha compartido contenido. Aparecerá aquí cuando lo haga.'}
          </p>
        ) : !activeUrl ? (
          <p className="text-center text-sm text-slate-500">Cargando…</p>
        ) : (
          <PreviewFor material={active} url={activeUrl} />
        )}
      </div>
    </div>
  );
}

function PreviewFor({ material, url }: { material: MaterialDto; url: string }) {
  if (material.type === 'PDF') {
    return (
      <iframe
        src={url}
        title={material.title}
        className="size-full rounded border border-slate-200 dark:border-slate-700"
      />
    );
  }
  if (material.type === 'VIDEO_EMBED') {
    // YouTube/Vimeo URLs work directly in an iframe.
    return (
      <iframe
        src={toEmbedUrl(url)}
        title={material.title}
        className="size-full rounded border border-slate-200 dark:border-slate-700"
        allow="autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
      />
    );
  }
  if (material.type === 'SLIDES') {
    return (
      <iframe
        src={url}
        title={material.title}
        className="size-full rounded border border-slate-200 dark:border-slate-700"
      />
    );
  }
  if (material.type === 'LINK') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3">
        <p className="text-sm">{material.title}</p>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
        >
          Abrir en nueva pestaña
        </a>
      </div>
    );
  }
  // FILE — generic; try inline; let the browser handle (images/PDF/text).
  return (
    <iframe
      src={url}
      title={material.title}
      className="size-full rounded border border-slate-200 dark:border-slate-700"
    />
  );
}

function iconFor(type: MaterialDto['type']): string {
  switch (type) {
    case 'PDF':
      return '📄';
    case 'FILE':
      return '📎';
    case 'LINK':
      return '🔗';
    case 'VIDEO_EMBED':
      return '🎬';
    case 'SLIDES':
      return '🖼️';
  }
}

/** Convert common video URLs (YouTube /watch, youtu.be, Vimeo) to embed URLs. */
function toEmbedUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return `https://www.youtube.com/embed/${v}`;
    }
    if (u.hostname === 'youtu.be') {
      return `https://www.youtube.com/embed${u.pathname}`;
    }
    if (u.hostname.includes('vimeo.com')) {
      const id = u.pathname.replace(/^\//, '');
      return `https://player.vimeo.com/video/${id}`;
    }
  } catch {
    /* fall through */
  }
  return url;
}
