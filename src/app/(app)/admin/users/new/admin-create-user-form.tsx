'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';

type Role = 'STUDENT' | 'PARENT' | 'TEACHER' | 'ADMIN';

interface Form {
  fullName: string;
  email: string;
  password: string;
  role: Role;
  phone: string;
}

export function AdminCreateUserForm() {
  const router = useRouter();
  const t = useT();
  const [form, setForm] = useState<Form>({
    fullName: '',
    email: '',
    password: '',
    role: 'STUDENT',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/admin/users', {
        method: 'POST',
        body: {
          fullName: form.fullName.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          phone: form.phone.trim() || undefined,
        },
      });
      router.push('/admin/users');
      router.refresh();
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
        label={t('Nombre completo')}
        name="fullName"
        required
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
      />
      <Input
        label={t('Correo electrónico')}
        type="email"
        name="email"
        autoComplete="off"
        required
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
      />
      <Input
        label={t('Contraseña')}
        type="text"
        name="password"
        autoComplete="off"
        required
        hint={t('Mínimo 10 caracteres, con mayúscula, minúscula y dígito.')}
        value={form.password}
        onChange={(e) => setForm({ ...form, password: e.target.value })}
      />
      <Select
        label={t('Rol')}
        name="role"
        value={form.role}
        onChange={(e) => setForm({ ...form, role: e.target.value as Role })}
      >
        <option value="STUDENT">{t('Estudiante')}</option>
        <option value="PARENT">{t('Padre / Madre')}</option>
        <option value="TEACHER">{t('Profesor')}</option>
        <option value="ADMIN">{t('Administrador')}</option>
      </Select>
      <Input
        label={t('Teléfono (opcional)')}
        name="phone"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
      />

      {error ? <Alert variant="error">{error}</Alert> : null}

      <div className="flex gap-2">
        <Button type="submit" loading={loading}>
          {t('Crear usuario')}
        </Button>
        <Button type="button" variant="secondary" onClick={() => router.back()}>
          {t('Cancelar')}
        </Button>
      </div>
    </form>
  );
}
