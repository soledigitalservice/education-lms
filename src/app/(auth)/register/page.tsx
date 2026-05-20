'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';

const schema = z.object({
  fullName: z.string().min(2, 'Mínimo 2 caracteres'),
  email: z.string().email('Correo no válido'),
  password: z
    .string()
    .min(10, 'Mínimo 10 caracteres')
    .regex(/[A-Z]/, 'Debe contener una mayúscula')
    .regex(/[a-z]/, 'Debe contener una minúscula')
    .regex(/[0-9]/, 'Debe contener un dígito'),
  role: z.enum(['STUDENT', 'PARENT', 'TEACHER']),
  phone: z.string().optional(),
});

type RegisterResponse =
  | {
      user: unknown;
      accessToken: string;
    }
  | { status: 'pending_approval'; message: string };

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    password: '',
    role: 'STUDENT' as 'STUDENT' | 'PARENT' | 'TEACHER',
    phone: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pendingMsg, setPendingMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse(form);
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
      return;
    }
    setLoading(true);
    try {
      const result = await apiFetch<RegisterResponse>('/api/auth/register', {
        method: 'POST',
        body: {
          ...parsed.data,
          phone: parsed.data.phone || undefined,
        },
      });
      if ('status' in result && result.status === 'pending_approval') {
        setPendingMsg(result.message);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      if (err instanceof HttpError) {
        setError(typeof err.body.message === 'string' ? err.body.message : err.body.message.join(', '));
      } else {
        setError('Error inesperado. Intenta de nuevo.');
      }
    } finally {
      setLoading(false);
    }
  }

  if (pendingMsg) {
    return (
      <>
        <h1 className="text-2xl font-bold tracking-tight">Cuenta creada</h1>
        <Alert variant="warning" className="mt-4">
          {pendingMsg}
        </Alert>
        <div className="mt-6">
          <Link href="/login" className="text-sm font-medium text-brand-600 hover:underline">
            Volver al login
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Crear cuenta</h1>
      <p className="mt-2 text-sm text-slate-500">
        ¿Ya tienes cuenta?{' '}
        <Link href="/login" className="font-medium text-brand-600 hover:underline">
          Inicia sesión
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Input
          label="Nombre completo"
          name="fullName"
          required
          value={form.fullName}
          onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        />
        <Input
          label="Correo electrónico"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <Input
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="new-password"
          required
          hint="Mínimo 10 caracteres, con mayúscula, minúscula y dígito."
          value={form.password}
          onChange={(e) => setForm({ ...form, password: e.target.value })}
        />

        <Select
          label="Tipo de cuenta"
          name="role"
          value={form.role}
          onChange={(e) =>
            setForm({ ...form, role: e.target.value as 'STUDENT' | 'PARENT' | 'TEACHER' })
          }
        >
          <option value="STUDENT">Estudiante</option>
          <option value="PARENT">Padre / Madre</option>
          <option value="TEACHER">Profesor (requiere aprobación del administrador)</option>
        </Select>

        <Input
          label="Teléfono (opcional)"
          name="phone"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
        />

        {error ? <Alert variant="error">{error}</Alert> : null}

        <Button type="submit" loading={loading} size="lg">
          Crear cuenta
        </Button>
      </form>
    </>
  );
}
