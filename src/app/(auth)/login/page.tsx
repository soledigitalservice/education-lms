'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';

const schema = z.object({
  email: z.string().email('Correo no válido'),
  password: z.string().min(1, 'Introduce tu contraseña'),
});

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setError(null);
    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.errors[0]?.message ?? 'Datos inválidos');
      return;
    }
    setLoading(true);
    try {
      await apiFetch('/api/auth/login', { method: 'POST', body: parsed.data });
      // Cookies set by server; navigate to the gated area.
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

  return (
    <>
      <h1 className="text-2xl font-bold tracking-tight">Iniciar sesión</h1>
      <p className="mt-2 text-sm text-slate-500">
        ¿No tienes cuenta?{' '}
        <Link href="/register" className="font-medium text-brand-600 hover:underline">
          Crear una
        </Link>
      </p>

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Input
          label="Correo electrónico"
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Input
          label="Contraseña"
          type="password"
          name="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error ? <Alert variant="error">{error}</Alert> : null}

        <Button type="submit" loading={loading} size="lg">
          Entrar
        </Button>
      </form>
    </>
  );
}
