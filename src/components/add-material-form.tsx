'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from './ui/alert';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Select } from './ui/select';
import { FileUploader, type UploadedFile } from './file-uploader';
import { apiFetch, HttpError } from '@/lib/api/client';

interface Props {
  /** Target: either a lesson or a course (course-level bibliography). */
  target: { kind: 'lesson'; lessonId: string } | { kind: 'course'; courseSlug: string };
}

type Mode = 'upload' | 'link';

export function AddMaterialForm({ target }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('upload');
  const [title, setTitle] = useState('');
  const [uploaded, setUploaded] = useState<UploadedFile | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkType, setLinkType] = useState<'LINK' | 'VIDEO_EMBED'>('LINK');
  const [fileType, setFileType] = useState<'FILE' | 'PDF' | 'SLIDES'>('FILE');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function endpoint(): string {
    return target.kind === 'lesson'
      ? `/api/lessons/${target.lessonId}/materials`
      : `/api/courses/${target.courseSlug}/materials`;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const body =
        mode === 'upload'
          ? uploaded
            ? {
                source: 'upload',
                title: title.trim(),
                fileId: uploaded.fileId,
                type: fileType,
              }
            : null
          : {
              source: 'link',
              title: title.trim(),
              url: linkUrl.trim(),
              type: linkType,
            };
      if (!body) {
        setError('Sube el archivo antes de enviar.');
        return;
      }
      await apiFetch(endpoint(), { method: 'POST', body });
      setTitle('');
      setUploaded(null);
      setLinkUrl('');
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error inesperado');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setMode('upload')}
          className={
            'rounded-md border px-3 py-1.5 text-sm transition ' +
            (mode === 'upload'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950'
              : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')
          }
        >
          Subir archivo
        </button>
        <button
          type="button"
          onClick={() => setMode('link')}
          className={
            'rounded-md border px-3 py-1.5 text-sm transition ' +
            (mode === 'link'
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-950'
              : 'border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')
          }
        >
          Enlace externo
        </button>
      </div>

      <Input
        label="Título"
        required
        maxLength={200}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />

      {mode === 'upload' ? (
        <>
          <Select
            label="Tipo de archivo"
            value={fileType}
            onChange={(e) => setFileType(e.target.value as typeof fileType)}
          >
            <option value="FILE">Archivo genérico</option>
            <option value="PDF">PDF</option>
            <option value="SLIDES">Presentación</option>
          </Select>
          {uploaded ? (
            <div className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
              ✓ {uploaded.originalName} · {Math.round(uploaded.sizeBytes / 1024)} KB
              <button
                type="button"
                onClick={() => setUploaded(null)}
                className="ml-3 text-xs underline"
              >
                cambiar
              </button>
            </div>
          ) : (
            <FileUploader kind="file" onUploaded={setUploaded} label="Seleccionar archivo…" />
          )}
        </>
      ) : (
        <>
          <Select
            label="Tipo de enlace"
            value={linkType}
            onChange={(e) => setLinkType(e.target.value as typeof linkType)}
          >
            <option value="LINK">Enlace web</option>
            <option value="VIDEO_EMBED">Vídeo embebido (YouTube, Vimeo…)</option>
          </Select>
          <Input
            label="URL"
            type="url"
            required
            placeholder="https://..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
          />
        </>
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <Button
        type="submit"
        loading={submitting}
        disabled={mode === 'upload' && !uploaded}
        className="self-start"
      >
        Añadir material
      </Button>
    </form>
  );
}
