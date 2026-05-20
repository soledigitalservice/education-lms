'use client';

import { useRef, useState } from 'react';

import { Button } from './ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';
import type { UploadKind } from '@/lib/storage/validation';

interface SignResponse {
  uploadUrl: string;
  fileId: string;
  key: string;
  expiresAt: string;
}

export interface UploadedFile {
  fileId: string;
  originalName: string;
  mimeType: string;
  sizeBytes: number;
}

interface Props {
  kind: UploadKind;
  /** Called once the upload finishes successfully. */
  onUploaded: (file: UploadedFile) => void;
  /** Optional `accept` attribute for the file input. */
  accept?: string;
  label?: string;
  disabled?: boolean;
}

/**
 * Two-phase uploader:
 *   1) POST /api/uploads/sign → presigned PUT URL + fileId
 *   2) PUT the file body straight to the bucket
 *
 * The component does no proxying — bytes never touch the Next.js server.
 */
export function FileUploader({ kind, onUploaded, accept, label, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  function pick(): void {
    inputRef.current?.click();
  }

  async function handleFile(file: File): Promise<void> {
    setError(null);
    setUploading(true);
    setProgress(0);

    try {
      const signed = await apiFetch<SignResponse>('/api/uploads/sign', {
        method: 'POST',
        body: {
          originalName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          kind,
        },
      });

      await putToS3(signed.uploadUrl, file, (p) => setProgress(p));

      onUploaded({
        fileId: signed.fileId,
        originalName: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
      });
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else if (err instanceof Error) {
        setError(err.message);
      } else {
        setError('Upload failed');
      }
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void handleFile(f);
        }}
      />
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={pick}
          loading={uploading}
          disabled={disabled || uploading}
        >
          {label ?? 'Subir archivo'}
        </Button>
        {uploading && (
          <div className="flex-1">
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
              <div
                className="h-full bg-brand-500 transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-slate-500">{progress}%</p>
          </div>
        )}
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/**
 * XHR-based PUT so we can report progress. fetch() doesn't expose upload
 * progress in browsers yet.
 */
function putToS3(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else reject(new Error(`S3 PUT failed: ${xhr.status} ${xhr.statusText}`));
    });
    xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
    xhr.send(file);
  });
}
