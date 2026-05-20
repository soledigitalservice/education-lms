'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { apiFetch, HttpError } from '@/lib/api/client';

interface Question {
  id: string;
  position: number;
  prompt: string;
  type: 'SINGLE_CHOICE' | 'MULTIPLE_CHOICE' | 'TRUE_FALSE' | 'SHORT_ANSWER' | 'LONG_ANSWER';
  points: number;
  options: Array<{ id: string; text: string; position: number }>;
}

interface QuizForStudent {
  id: string;
  title: string;
  description: string | null;
  timeLimitMin: number | null;
  maxAttempts: number;
  publishedAt: string | null;
  totalPoints: number;
  questions: Question[];
}

interface Attempt {
  id: string;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  maxScore: number | null;
  serverNow: string;
  deadlineAt: string | null;
  answers: Array<{
    questionId: string;
    isCorrect: boolean | null;
    pointsAwarded: number | null;
    payload: unknown;
  }>;
}

interface Props {
  lessonId: string;
}

export function QuizPanelStudent({ lessonId }: Props) {
  const router = useRouter();
  const [quiz, setQuiz] = useState<QuizForStudent | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const q = await apiFetch<QuizForStudent | null>(`/api/lessons/${lessonId}/quiz`);
        setQuiz(q);
      } catch (err) {
        setError(err instanceof HttpError ? String(err.body.message) : 'Error');
      } finally {
        setLoading(false);
      }
    })();
  }, [lessonId]);

  if (loading) return <Card>Cargando cuestionario…</Card>;
  if (error) return <Alert variant="error">{error}</Alert>;
  if (!quiz) {
    return (
      <Card>
        <p className="text-sm text-slate-500">El profesor aún no ha publicado el cuestionario.</p>
      </Card>
    );
  }

  if (!attempt) {
    return (
      <Card>
        <CardTitle>{quiz.title}</CardTitle>
        {quiz.description && <p className="mt-2 text-sm">{quiz.description}</p>}
        <p className="mt-3 text-xs text-slate-500">
          {quiz.questions.length} pregunta(s) · {quiz.totalPoints} pts
          {quiz.timeLimitMin && ` · Tiempo límite: ${quiz.timeLimitMin} min`} · Máx {quiz.maxAttempts} intento(s)
        </p>
        <Button
          className="mt-4"
          onClick={async () => {
            try {
              const a = await apiFetch<Attempt>(`/api/quizzes/${quiz.id}/attempts`, { method: 'POST' });
              setAttempt(a);
            } catch (err) {
              setError(err instanceof HttpError ? String(err.body.message) : 'Error');
            }
          }}
        >
          Empezar intento
        </Button>
      </Card>
    );
  }

  return <AttemptRunner quiz={quiz} attempt={attempt} onUpdate={setAttempt} onFinished={() => router.refresh()} />;
}

function AttemptRunner({
  quiz,
  attempt,
  onUpdate,
  onFinished,
}: {
  quiz: QuizForStudent;
  attempt: Attempt;
  onUpdate: (a: Attempt) => void;
  onFinished: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    const r: Record<string, unknown> = {};
    for (const a of attempt.answers) r[a.questionId] = a.payload;
    return r;
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Countdown timer if the quiz has a time limit.
  useEffect(() => {
    if (!attempt.deadlineAt) return;
    const tick = (): void => {
      const ms = new Date(attempt.deadlineAt!).getTime() - Date.now();
      setRemaining(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [attempt.deadlineAt]);

  if (attempt.submittedAt) {
    return (
      <Card>
        <CardTitle>Resultado</CardTitle>
        <p className="mt-2 text-2xl font-bold">
          {attempt.score?.toFixed(1) ?? '-'} / {attempt.maxScore?.toFixed(1) ?? '-'}
        </p>
        <p className="mt-1 text-xs text-slate-500">
          Las preguntas de respuesta larga (si las hay) las calificará el profesor manualmente.
        </p>
        <ul className="mt-4 space-y-2 text-sm">
          {quiz.questions.map((q) => {
            const a = attempt.answers.find((x) => x.questionId === q.id);
            return (
              <li
                key={q.id}
                className="rounded-md border border-slate-200 p-2 dark:border-slate-700"
              >
                <p className="text-xs text-slate-500">
                  {q.position}. {q.prompt}
                </p>
                <p className="mt-1 text-xs">
                  {a?.isCorrect === true && <Badge variant="success">Correcta</Badge>}
                  {a?.isCorrect === false && <Badge variant="danger">Incorrecta</Badge>}
                  {a?.isCorrect === null && <Badge variant="warning">Pendiente de revisión</Badge>}
                  {a == null && <Badge>Sin responder</Badge>}
                  <span className="ml-2 text-slate-500">
                    {a?.pointsAwarded != null ? `${a.pointsAwarded} / ${q.points} pts` : ''}
                  </span>
                </p>
              </li>
            );
          })}
        </ul>
      </Card>
    );
  }

  async function persist(questionId: string, payload: unknown): Promise<void> {
    try {
      await apiFetch(`/api/quiz-attempts/${attempt.id}/answers`, {
        method: 'PUT',
        body: { questionId, payload },
      });
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    }
  }

  async function finish(): Promise<void> {
    setBusy(true);
    try {
      const finished = await apiFetch<Attempt>(`/api/quiz-attempts/${attempt.id}/finish`, {
        method: 'POST',
      });
      onUpdate(finished);
      onFinished();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>{quiz.title}</CardTitle>
        {remaining != null && (
          <Badge variant={remaining < 60 ? 'danger' : 'brand'}>
            Tiempo: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
          </Badge>
        )}
      </div>

      <ol className="mt-4 space-y-4">
        {quiz.questions.map((q) => (
          <li key={q.id} className="rounded-md border border-slate-200 p-3 dark:border-slate-700">
            <p className="text-xs text-slate-500">
              Pregunta {q.position} · {q.points} pts
            </p>
            <p className="mt-1 font-medium">{q.prompt}</p>
            <QuestionInput
              question={q}
              value={answers[q.id]}
              onChange={(v) => {
                setAnswers({ ...answers, [q.id]: v });
                void persist(q.id, v);
              }}
            />
          </li>
        ))}
      </ol>

      {error && <Alert variant="error" className="mt-3">{error}</Alert>}

      <div className="mt-4 flex justify-end">
        <Button onClick={finish} loading={busy}>
          Enviar respuestas
        </Button>
      </div>
    </Card>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: Question;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  switch (question.type) {
    case 'SINGLE_CHOICE': {
      const v = (value as { optionId?: string } | undefined)?.optionId;
      return (
        <div className="mt-2 space-y-1">
          {question.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={question.id}
                checked={v === o.id}
                onChange={() => onChange({ optionId: o.id })}
              />
              {o.text}
            </label>
          ))}
        </div>
      );
    }
    case 'MULTIPLE_CHOICE': {
      const v = ((value as { optionIds?: string[] } | undefined)?.optionIds ?? []) as string[];
      return (
        <div className="mt-2 space-y-1">
          {question.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={v.includes(o.id)}
                onChange={(e) => {
                  const next = e.target.checked ? [...v, o.id] : v.filter((id) => id !== o.id);
                  onChange({ optionIds: next });
                }}
              />
              {o.text}
            </label>
          ))}
        </div>
      );
    }
    case 'TRUE_FALSE': {
      const v = (value as { value?: boolean } | undefined)?.value;
      return (
        <div className="mt-2 flex gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={question.id}
              checked={v === true}
              onChange={() => onChange({ value: true })}
            />
            Verdadero
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name={question.id}
              checked={v === false}
              onChange={() => onChange({ value: false })}
            />
            Falso
          </label>
        </div>
      );
    }
    case 'SHORT_ANSWER':
      return (
        <Input
          className="mt-2"
          value={(value as { text?: string } | undefined)?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
    case 'LONG_ANSWER':
      return (
        <textarea
          className="mt-2 min-h-32 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
          value={(value as { text?: string } | undefined)?.text ?? ''}
          onChange={(e) => onChange({ text: e.target.value })}
        />
      );
  }
}
