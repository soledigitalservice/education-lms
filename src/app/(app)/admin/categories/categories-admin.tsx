'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';
import type { CategoryDto } from '@/lib/categories/service';

interface Props {
  initial: CategoryDto[];
}

export function CategoriesAdmin({ initial }: Props) {
  const router = useRouter();
  const t = useT();
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [parentId, setParentId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await apiFetch('/api/categories', {
        method: 'POST',
        body: {
          name: name.trim(),
          slug: slug.trim() || undefined,
          parentId: parentId || null,
        },
      });
      setName('');
      setSlug('');
      setParentId('');
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

  async function remove(id: string): Promise<void> {
    if (!confirm(t('¿Eliminar esta categoría?'))) return;
    try {
      await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        alert(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      }
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardTitle>{t('Nueva categoría')}</CardTitle>
        <form onSubmit={create} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input
            label={t('Nombre')}
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label={t('Slug (opcional)')}
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
          />
          <Select
            label={t('Categoría padre (opcional)')}
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="sm:col-span-2"
          >
            <option value="">{t('— Raíz —')}</option>
            {initial.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
          {error && <Alert variant="error" className="sm:col-span-2">{error}</Alert>}
          <Button type="submit" loading={busy} className="sm:col-span-2 sm:justify-self-start">
            {t('Crear')}
          </Button>
        </form>
      </Card>

      <Card>
        <CardTitle>{t('Categorías existentes ({n})', { n: initial.length })}</CardTitle>
        {initial.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">{t('No hay categorías todavía.')}</p>
        ) : (
          <ul className="mt-4 divide-y divide-slate-200 dark:divide-slate-800">
            {initial.map((c) => (
              <li key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-xs text-slate-500">
                    /{c.slug} {c.parentId && <Badge className="ml-2">{t('hija')}</Badge>}
                  </p>
                </div>
                <Button size="sm" variant="danger" onClick={() => remove(c.id)}>
                  {t('Eliminar')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
