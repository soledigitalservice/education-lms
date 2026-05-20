'use client';

import { useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { apiFetch, HttpError } from '@/lib/api/client';

interface QuizDto {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  maxAttempts: number;
  publishedAt: string | null;
  totalPoints: number;
  questionCount: number;
  questions: Array<{
    id: string;
    position: number;
    prompt: string;
    type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'LONG_ANSWER';
    points: number;
    expectedAnswer?: string | null;
    options: Array<{ id: string; text: string; position: number; isCorrect?: boolean }>;
  }>;
}

interface Props {
  lessonId: string;
  courseSlug: string;
}

export function QuizPanelTeacher({ lessonId, courseSlug }: Props) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function reload(): Promise<void> {
    const fresh = await apiFetch<QuizDto | null>(`/api/lessons/${lessonId}/quiz`);
    setQuiz(fresh);
  }

  useEffect(() => {
    void (async () => {
      try {
        await reload();
      } catch (err) {
        setError(err instanceof HttpError ? String(err.body.message) : 'Error');
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  if (loading) return <Card>Cargando cuestionario…</Card>;
  if (error) return <Alert variant="error">{error}</Alert>;

  if (!quiz) {
    return (
      <Card>
        <CardTitle>Crear cuestionario</CardTitle>
        <p className="mt-2 text-sm text-slate-500">
          No hay cuestionario vinculado. Créalo y añade preguntas.
        </p>
        <Button
          className="mt-4"
          onClick={async () => {
            await apiFetch(`/api/lessons/${lessonId}/quiz`, {
              method: 'POST',
              body: { title: 'Nuevo cuestionario' },
            });
            await reload();
            router.refresh();
          }}
        >
          Crear cuestionario
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <QuizSettings quiz={quiz} onChanged={reload} />
      <Card>
        <div className="flex items-center justify-between">
          <CardTitle>Preguntas ({quiz.questions.length})</CardTitle>
          <Link href={`/courses/${courseSlug}/quizzes/${quiz.id}/attempts`}>
            <Button size="sm" variant="secondary">
              Ver intentos
            </Button>
          </Link>
        </div>
        <p className="mt-1 text-xs text-slate-500">Total: {quiz.totalPoints} pts.</p>
        {quiz.publishedAt && (
          <p className="mt-2 text-xs text-amber-600">
            Cuestionario publicado — para editar preguntas, despublica primero.
          </p>
        )}
        <ul className="mt-4 space-y-2">
          {quiz.questions.map((q, i) => (
            <QuestionRow
              key={q.id}
              question={q}
              index={i}
              total={quiz.questions.length}
              quizLocked={!!quiz.publishedAt}
              onChanged={reload}
            />
          ))}
        </ul>
        {!quiz.publishedAt && <NewQuestionForm quizId={quiz.id} onCreated={reload} />}
      </Card>
    </div>
  );
}

function QuizSettings({ quiz, onChanged }: { quiz: QuizDto; onChanged: () => Promise<void> }) {
  const [form, setForm] = useState({
    title: quiz.title,
    description: quiz.description ?? '',
    timeLimitMin: quiz.timeLimitMin?.toString() ?? '',
    maxAttempts: quiz.maxAttempts,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/quizzes/${quiz.id}`, {
        method: 'PATCH',
        body: {
          title: form.title.trim(),
          description: form.description.trim() || null,
          timeLimitMin: form.timeLimitMin ? Number(form.timeLimitMin) : null,
          maxAttempts: form.maxAttempts,
        },
      });
      await onChanged();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  async function togglePublish(): Promise<void> {
    setBusy(true);
    try {
      await apiFetch(`/api/quizzes/${quiz.id}`, {
        method: 'PATCH',
        body: { publishedAt: quiz.publishedAt ? null : new Date().toISOString() },
      });
      await onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Cuestionario</CardTitle>
        {quiz.publishedAt ? (
          <Badge variant="success">Publicado</Badge>
        ) : (
          <Badge variant="warning">Borrador</Badge>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-3">
        <Input
          label="Título"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
        <Input
          label="Descripción"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
        />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input
            label="Tiempo límite (min, opcional)"
            type="number"
            min={1}
            value={form.timeLimitMin}
            onChange={(e) => setForm({ ...form, timeLimitMin: e.target.value })}
          />
          <Input
            label="Intentos máximos"
            type="number"
            min={1}
            max={20}
            value={form.maxAttempts}
            onChange={(e) => setForm({ ...form, maxAttempts: Number(e.target.value) })}
          />
        </div>
        {error && <Alert variant="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button onClick={save} loading={busy}>
            Guardar ajustes
          </Button>
          <Button variant="secondary" onClick={togglePublish} loading={busy}>
            {quiz.publishedAt ? 'Despublicar' : 'Publicar'}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function QuestionRow({
  question,
  index,
  total,
  quizLocked,
  onChanged,
}: {
  question: QuizDto['questions'][number];
  index: number;
  total: number;
  quizLocked: boolean;
  onChanged: () => Promise<void>;
}) {
  async function reorder(direction: 'up' | 'down'): Promise<void> {
    await apiFetch(`/api/questions/${question.id}/reorder`, {
      method: 'POST',
      body: { direction },
    });
    await onChanged();
  }
  async function remove(): Promise<void> {
    if (!confirm(`Eliminar la pregunta "${question.prompt.slice(0, 60)}..."?`)) return;
    await apiFetch(`/api/questions/${question.id}`, { method: 'DELETE' });
    await onChanged();
  }

  return (
    <li className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-700">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-mono text-slate-400">
            {question.position}. <Badge variant="default">{question.type}</Badge> · {question.points} pts
          </p>
          <p className="mt-1 font-medium">{question.prompt}</p>
          {question.options.length > 0 && (
            <ul className="mt-2 space-y-0.5 text-xs">
              {question.options.map((o) => (
                <li
                  key={o.id}
                  className={o.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-slate-500'}
                >
                  {o.isCorrect ? '✓ ' : '   '}
                  {o.text}
                </li>
              ))}
            </ul>
          )}
          {question.expectedAnswer && (
            <p className="mt-2 text-xs text-slate-500">
              Respuesta esperada: <span className="font-mono">{question.expectedAnswer}</span>
            </p>
          )}
        </div>
        {!quizLocked && (
          <div className="flex gap-1">
            <Button size="sm" variant="ghost" disabled={index === 0} onClick={() => reorder('up')}>
              ↑
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={index === total - 1}
              onClick={() => reorder('down')}
            >
              ↓
            </Button>
            <Button size="sm" variant="danger" onClick={remove}>
              Borrar
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function NewQuestionForm({
  quizId,
  onCreated,
}: {
  quizId: string;
  onCreated: () => Promise<void>;
}) {
  const [type, setType] = useState<'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'LONG_ANSWER'>('SINGLE_CHOICE');
  const [prompt, setPrompt] = useState('');
  const [points, setPoints] = useState(1);
  const [options, setOptions] = useState<Array<{ text: string; isCorrect: boolean }>>([
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
  ]);
  const [tfCorrect, setTfCorrect] = useState(true);
  const [expectedAnswer, setExpectedAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      let body: Record<string, unknown>;
      switch (type) {
        case 'SINGLE_CHOICE':
        case 'MULTIPLE_CHOICE':
          body = {
            type,
            prompt: prompt.trim(),
            points,
            options: options.filter((o) => o.text.trim().length > 0),
          };
          break;
        case 'TRUE_FALSE':
          body = { type, prompt: prompt.trim(), points, correct: tfCorrect };
          break;
        case 'SHORT_ANSWER':
          body = { type, prompt: prompt.trim(), points, expectedAnswer: expectedAnswer.trim() };
          break;
        case 'LONG_ANSWER':
          body = { type, prompt: prompt.trim(), points };
          break;
      }
      await apiFetch(`/api/quizzes/${quizId}/questions`, { method: 'POST', body });
      setPrompt('');
      setExpectedAnswer('');
      setOptions([
        { text: '', isCorrect: true },
        { text: '', isCorrect: false },
      ]);
      await onCreated();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="mt-4 flex flex-col gap-3 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700"
    >
      <p className="text-xs font-semibold uppercase text-slate-500">Nueva pregunta</p>
      <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
        <Input
          placeholder="Enunciado"
          required
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
        <Select value={type} onChange={(e) => setType(e.target.value as typeof type)}>
          <option value="SINGLE_CHOICE">Opción única</option>
          <option value="MULTIPLE_CHOICE">Opción múltiple</option>
          <option value="TRUE_FALSE">Verdadero / Falso</option>
          <option value="SHORT_ANSWER">Respuesta corta</option>
          <option value="LONG_ANSWER">Respuesta larga (manual)</option>
        </Select>
        <Input
          type="number"
          min={1}
          value={points}
          onChange={(e) => setPoints(Number(e.target.value))}
          placeholder="Puntos"
        />
      </div>

      {(type === 'SINGLE_CHOICE' || type === 'MULTIPLE_CHOICE') && (
        <div className="space-y-1">
          {options.map((o, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type={type === 'SINGLE_CHOICE' ? 'radio' : 'checkbox'}
                checked={o.isCorrect}
                onChange={(e) => {
                  const next = options.map((opt, j) => {
                    if (type === 'SINGLE_CHOICE') {
                      return { ...opt, isCorrect: i === j };
                    }
                    return j === i ? { ...opt, isCorrect: e.target.checked } : opt;
                  });
                  setOptions(next);
                }}
              />
              <Input
                placeholder={`Opción ${i + 1}`}
                value={o.text}
                onChange={(e) => {
                  const next = [...options];
                  next[i] = { ...next[i]!, text: e.target.value };
                  setOptions(next);
                }}
                className="flex-1"
              />
              {options.length > 2 && (
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={() => setOptions(options.filter((_, j) => j !== i))}
                >
                  ×
                </Button>
              )}
            </div>
          ))}
          {options.length < 10 && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => setOptions([...options, { text: '', isCorrect: false }])}
            >
              + Añadir opción
            </Button>
          )}
        </div>
      )}

      {type === 'TRUE_FALSE' && (
        <Select value={tfCorrect ? 'true' : 'false'} onChange={(e) => setTfCorrect(e.target.value === 'true')}>
          <option value="true">La respuesta correcta es Verdadero</option>
          <option value="false">La respuesta correcta es Falso</option>
        </Select>
      )}

      {type === 'SHORT_ANSWER' && (
        <Input
          label="Respuesta esperada (case-insensitive)"
          required
          value={expectedAnswer}
          onChange={(e) => setExpectedAnswer(e.target.value)}
        />
      )}

      {error && <Alert variant="error">{error}</Alert>}

      <Button type="submit" loading={busy} size="sm" className="self-start">
        + Añadir pregunta
      </Button>
    </form>
  );
}
