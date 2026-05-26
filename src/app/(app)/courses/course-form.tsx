'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';
import type { CategoryDto } from '@/lib/categories/service';
import type { CourseDto } from '@/lib/courses/service';

interface Props {
  mode: 'create' | 'edit';
  categories: CategoryDto[];
  initial?: CourseDto;
}

interface FormState {
  title: string;
  slug: string;
  summary: string;
  description: string;
  language: string;
  categoryId: string;
  requiresApproval: boolean;
  maxStudents: string;
  startsAt: string;
  endsAt: string;
}

function toState(c?: CourseDto): FormState {
  return {
    title: c?.title ?? '',
    slug: c?.slug ?? '',
    summary: c?.summary ?? '',
    description: c?.description ?? '',
    language: c?.language ?? 'es',
    categoryId: c?.category?.id ?? '',
    requiresApproval: c?.requiresApproval ?? true,
    maxStudents: c?.maxStudents != null ? String(c.maxStudents) : '',
    startsAt: c?.startsAt ? c.startsAt.slice(0, 10) : '',
    endsAt: c?.endsAt ? c.endsAt.slice(0, 10) : '',
  };
}

export function CourseForm({ mode, categories, initial }: Props) {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState<FormState>(() => toState(initial));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const body = {
      title: form.title.trim(),
      slug: form.slug.trim() || undefined,
      summary: form.summary.trim() || undefined,
      description: form.description.trim() || undefined,
      language: form.language,
      categoryId: form.categoryId || null,
      requiresApproval: form.requiresApproval,
      maxStudents: form.maxStudents ? Number(form.maxStudents) : undefined,
      startsAt: form.startsAt || undefined,
      endsAt: form.endsAt || undefined,
    };

    try {
      if (mode === 'create') {
        const created = await apiFetch<CourseDto>('/api/courses', {
          method: 'POST',
          body,
        });
        router.push(`/courses/${created.slug}`);
        router.refresh();
      } else if (initial) {
        const updated = await apiFetch<CourseDto>(`/api/courses/${initial.id}`, {
          method: 'PATCH',
          body,
        });
        router.push(`/courses/${updated.slug}`);
        router.refresh();
      }
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError(t('Error inesperado'));
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Input
        label={t('Título')}
        name="title"
        required
        maxLength={160}
        value={form.title}
        onChange={(e) => setForm({ ...form, title: e.target.value })}
      />
      <Input
        label={t('Slug (opcional)')}
        name="slug"
        hint={t('Si lo dejas vacío, se genera a partir del título.')}
        value={form.slug}
        onChange={(e) => setForm({ ...form, slug: e.target.value })}
      />
      <Input
        label={t('Resumen breve')}
        name="summary"
        maxLength={500}
        value={form.summary}
        onChange={(e) => setForm({ ...form, summary: e.target.value })}
      />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {t('Descripción')}
        </label>
        <textarea
          className="min-h-32 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 dark:border-slate-700 dark:bg-slate-800"
          value={form.description}
          maxLength={20_000}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Select
          label={t('Categoría')}
          value={form.categoryId}
          onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
        >
          <option value="">{t('Sin categoría')}</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
        <Select
          label={t('Idioma')}
          value={form.language}
          onChange={(e) => setForm({ ...form, language: e.target.value })}
        >
          <option value="es">Español</option>
          <option value="en">English</option>
          <option value="pt">Português</option>
          <option value="fr">Français</option>
        </Select>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('Empieza el')}
          type="date"
          value={form.startsAt}
          onChange={(e) => setForm({ ...form, startsAt: e.target.value })}
        />
        <Input
          label={t('Termina el')}
          type="date"
          value={form.endsAt}
          onChange={(e) => setForm({ ...form, endsAt: e.target.value })}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label={t('Máx. alumnos (opcional)')}
          type="number"
          min={1}
          value={form.maxStudents}
          onChange={(e) => setForm({ ...form, maxStudents: e.target.value })}
        />
        <label className="flex items-end gap-2 pb-2">
          <input
            type="checkbox"
            checked={form.requiresApproval}
            onChange={(e) => setForm({ ...form, requiresApproval: e.target.checked })}
            className="size-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="text-sm">{t('Requiere aprobación del profesor')}</span>
        </label>
      </div>

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          {mode === 'create' ? t('Crear curso') : t('Guardar cambios')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t('Cancelar')}
        </Button>
      </div>
    </form>
  );
}
