'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { apiFetch, HttpError } from '@/lib/api/client';

export interface MaterialItem {
  id: string;
  title: string;
  type: 'FILE' | 'LINK' | 'VIDEO_EMBED' | 'PDF' | 'SLIDES';
  url: string;
  fileId: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
}

interface Props {
  items: MaterialItem[];
  /** Show delete buttons (teacher/admin view). */
  canManage?: boolean;
  /** Show inline previews (PDF/video) instead of just links. */
  showPreviews?: boolean;
}

const ICONS: Record<MaterialItem['type'], string> = {
  PDF: '📄',
  FILE: '📎',
  LINK: '🔗',
  VIDEO_EMBED: '🎬',
  SLIDES: '🖼️',
};

const LABELS: Record<MaterialItem['type'], string> = {
  PDF: 'PDF',
  FILE: 'Archivo',
  LINK: 'Enlace',
  VIDEO_EMBED: 'Vídeo',
  SLIDES: 'Presentación',
};

export function MaterialList({ items, canManage, showPreviews }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  if (items.length === 0) {
    return <p className="text-sm text-slate-500">Aún no hay materiales.</p>;
  }

  async function open(item: MaterialItem): Promise<void> {
    // External links open directly.
    if (item.type === 'LINK' || item.type === 'VIDEO_EMBED') {
      window.open(item.url, '_blank', 'noopener,noreferrer');
      return;
    }
    // Files: fetch a fresh presigned URL and open it.
    setBusy(item.id);
    try {
      const res = await apiFetch<{ url: string }>(`/api/materials/${item.id}/download`);
      window.open(res.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      alert(err instanceof HttpError ? String(err.body.message) : 'Error al descargar');
    } finally {
      setBusy(null);
    }
  }

  async function remove(item: MaterialItem): Promise<void> {
    if (!confirm(`¿Eliminar "${item.title}"?`)) return;
    setBusy(item.id);
    try {
      await apiFetch(`/api/materials/${item.id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      alert(err instanceof HttpError ? String(err.body.message) : 'Error al eliminar');
    } finally {
      setBusy(null);
    }
  }

  return (
    <ul className="divide-y divide-slate-200 dark:divide-slate-800">
      {items.map((m) => (
        <li key={m.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span className="text-2xl" aria-hidden>
              {ICONS[m.type]}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{m.title}</p>
              <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <Badge variant="default">{LABELS[m.type]}</Badge>
                {m.sizeBytes && <span>{formatBytes(m.sizeBytes)}</span>}
                {m.mimeType && <span className="truncate">{m.mimeType}</span>}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="secondary" loading={busy === m.id} onClick={() => open(m)}>
              {m.fileId ? 'Descargar' : 'Abrir'}
            </Button>
            {canManage && (
              <Button size="sm" variant="danger" onClick={() => remove(m)} loading={busy === m.id}>
                Eliminar
              </Button>
            )}
          </div>
          {showPreviews && m.type === 'PDF' && m.fileId && <PdfInlinePreview materialId={m.id} />}
        </li>
      ))}
    </ul>
  );
}

function PdfInlinePreview({ materialId }: { materialId: string }) {
  const [url, setUrl] = useState<string | null>(null);

  async function load(): Promise<void> {
    if (url) return;
    try {
      const res = await apiFetch<{ url: string }>(`/api/materials/${materialId}/download`);
      setUrl(res.url);
    } catch {
      // silent — user can still click Descargar
    }
  }

  return (
    <details className="sm:basis-full" onToggle={(e) => (e.currentTarget.open ? void load() : null)}>
      <summary className="cursor-pointer text-xs text-brand-600 hover:underline">
        Ver previsualización
      </summary>
      {url && (
        <iframe
          src={url}
          title="PDF preview"
          className="mt-2 h-96 w-full rounded-lg border border-slate-200 dark:border-slate-700"
        />
      )}
    </details>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}
