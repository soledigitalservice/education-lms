'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';

type Scale = 'NUMERIC' | 'CONCEPT' | 'LETTER';

interface Props {
  submissionId: string;
  maxScore: number;
  existingGrade: null | {
    scale: string;
    numericValue: number | null;
    conceptValue: string | null;
    letterValue: string | null;
    feedback: string | null;
  };
}

export function SubmissionGraderForm({ submissionId, maxScore, existingGrade }: Props) {
  const router = useRouter();
  const [scale, setScale] = useState<Scale>((existingGrade?.scale as Scale) ?? 'NUMERIC');
  const [numericValue, setNumericValue] = useState<string>(
    existingGrade?.numericValue?.toString() ?? '',
  );
  const [conceptValue, setConceptValue] = useState(existingGrade?.conceptValue ?? '');
  const [letterValue, setLetterValue] = useState(existingGrade?.letterValue ?? 'A');
  const [feedback, setFeedback] = useState(existingGrade?.feedback ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      let body: Record<string, unknown>;
      switch (scale) {
        case 'NUMERIC':
          body = { scale, numericValue: Number(numericValue), feedback: feedback || undefined };
          break;
        case 'CONCEPT':
          body = { scale, conceptValue, feedback: feedback || undefined };
          break;
        case 'LETTER':
          body = { scale, letterValue, feedback: feedback || undefined };
          break;
      }
      await apiFetch(`/api/submissions/${submissionId}/grade`, { method: 'PUT', body });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function returnToStudent(): Promise<void> {
    if (!confirm('Devolver al estudiante para que revise y vuelva a entregar?')) return;
    setBusy(true);
    try {
      await apiFetch(`/api/submissions/${submissionId}/return`, { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <Select value={scale} onChange={(e) => setScale(e.target.value as Scale)}>
        <option value="NUMERIC">Numérica</option>
        <option value="CONCEPT">Conceptual (ej: Excelente)</option>
        <option value="LETTER">Letra (A/B/C/D/F)</option>
      </Select>

      {scale === 'NUMERIC' && (
        <Input
          label={`Nota (0 - ${maxScore})`}
          type="number"
          min={0}
          max={maxScore}
          step={0.1}
          value={numericValue}
          onChange={(e) => setNumericValue(e.target.value)}
        />
      )}
      {scale === 'CONCEPT' && (
        <Input
          label="Concepto"
          placeholder="Excelente / Notable / Aprobado..."
          value={conceptValue}
          onChange={(e) => setConceptValue(e.target.value)}
        />
      )}
      {scale === 'LETTER' && (
        <Select value={letterValue} onChange={(e) => setLetterValue(e.target.value)}>
          {['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'].map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </Select>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium">Retroalimentación</label>
        <textarea
          className="min-h-24 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          maxLength={20_000}
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
        />
      </div>

      {error && <Alert variant="error">{error}</Alert>}
      {saved && !error && <Badge variant="success">Guardado</Badge>}

      <div className="flex gap-2">
        <Button onClick={save} loading={busy}>
          Guardar calificación
        </Button>
        <Button variant="secondary" onClick={returnToStudent} loading={busy}>
          Devolver
        </Button>
      </div>
    </div>
  );
}
