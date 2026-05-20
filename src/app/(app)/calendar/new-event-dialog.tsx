'use client';

import { useState, type FormEvent } from 'react';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';

interface Props {
  onClose: () => void;
  onCreated: () => void | Promise<void>;
}

export function NewEventDialog({ onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    title: '',
    notes: '',
    startsAt: '',
    endsAt: '',
    allDay: false,
    color: '#8b5cf6',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiFetch('/api/schedule-events', {
        method: 'POST',
        body: {
          title: form.title.trim(),
          notes: form.notes.trim() || undefined,
          startsAt: new Date(form.startsAt).toISOString(),
          endsAt: new Date(form.endsAt).toISOString(),
          allDay: form.allDay,
          color: form.color,
        },
      });
      await onCreated();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900"
      >
        <h2 className="text-lg font-bold">Nuevo evento personal</h2>
        <p className="mt-1 text-xs text-slate-500">
          Solo lo ves tú. Útil para recordatorios, deadlines internos, reuniones, etc.
        </p>

        <div className="mt-4 flex flex-col gap-3">
          <Input
            label="Título"
            required
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium">Notas</label>
            <textarea
              className="min-h-20 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
              maxLength={2_000}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Inicio"
              type="datetime-local"
              required
              value={form.startsAt}
              onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
            />
            <Input
              label="Fin"
              type="datetime-local"
              required
              value={form.endsAt}
              onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
            />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={form.allDay}
                onChange={(e) => setForm({ ...form, allDay: e.target.checked })}
                className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
              />
              Todo el día
            </label>
            <label className="flex items-center gap-2 text-sm">
              Color
              <input
                type="color"
                value={form.color}
                onChange={(e) => setForm({ ...form, color: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded border border-slate-300 dark:border-slate-700"
              />
            </label>
          </div>

          {error && <Alert variant="error">{error}</Alert>}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancelar
            </Button>
            <Button type="submit" loading={busy}>
              Crear
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
