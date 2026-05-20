'use client';

import { useEffect, useState } from 'react';

import { Alert } from './ui/alert';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Card, CardTitle } from './ui/card';
import { apiFetch, HttpError } from '@/lib/api/client';

interface ReviewDto {
  id: string;
  authorId: string;
  authorName: string;
  rating: number;
  comment: string | null;
  createdAt: string;
}

interface Summary {
  teacherId: string;
  ratingAvg: number;
  ratingCount: number;
  reviews: ReviewDto[];
}

interface Props {
  teacherId: string;
  teacherName: string;
  courseId: string;
  /// Whether the current user is allowed to write a review for this teacher.
  canReview: boolean;
  currentUserId: string;
}

export function TeacherReviewsPanel({
  teacherId,
  teacherName,
  courseId,
  canReview,
  currentUserId,
}: Props) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [showForm, setShowForm] = useState(false);

  async function reload(): Promise<void> {
    const fresh = await apiFetch<Summary>(`/api/teachers/${teacherId}/reviews`);
    setSummary(fresh);
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teacherId]);

  if (!summary) return <Card>Cargando valoraciones…</Card>;

  const myReview = summary.reviews.find((r) => r.authorId === currentUserId);

  return (
    <Card>
      <div className="flex items-center justify-between">
        <CardTitle>Valoraciones del profesor</CardTitle>
        {canReview && !showForm && (
          <Button size="sm" variant="secondary" onClick={() => setShowForm(true)}>
            {myReview ? 'Editar mi valoración' : 'Valorar profesor'}
          </Button>
        )}
      </div>

      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-3xl font-bold">
          {summary.ratingCount > 0 ? summary.ratingAvg.toFixed(1) : '—'}
        </span>
        <span className="text-sm text-slate-500">
          ({summary.ratingCount} valoración(es))
        </span>
      </div>
      <p className="text-xs text-slate-500">{teacherName}</p>

      {showForm && (
        <ReviewForm
          teacherId={teacherId}
          courseId={courseId}
          initial={myReview ?? null}
          onSaved={async () => {
            setShowForm(false);
            await reload();
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      {summary.reviews.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">Aún no hay valoraciones.</p>
      ) : (
        <ul className="mt-6 divide-y divide-slate-200 dark:divide-slate-800">
          {summary.reviews.map((r) => (
            <li key={r.id} className="py-3">
              <div className="flex items-center gap-2">
                <Badge variant="brand">★ {r.rating}</Badge>
                <span className="text-sm font-medium">{r.authorName}</span>
                {r.authorId === currentUserId && (
                  <Badge variant="default">Tú</Badge>
                )}
                <span className="ml-auto text-xs text-slate-500">
                  {new Date(r.createdAt).toLocaleDateString('es')}
                </span>
              </div>
              {r.comment && <p className="mt-1 text-sm whitespace-pre-wrap">{r.comment}</p>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function ReviewForm({
  teacherId,
  courseId,
  initial,
  onSaved,
  onCancel,
}: {
  teacherId: string;
  courseId: string;
  initial: ReviewDto | null;
  onSaved: () => Promise<void>;
  onCancel: () => void;
}) {
  const [rating, setRating] = useState(initial?.rating ?? 5);
  const [comment, setComment] = useState(initial?.comment ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/api/teachers/${teacherId}/reviews`, {
        method: 'PUT',
        body: { rating, comment: comment.trim() || undefined, courseId },
      });
      await onSaved();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3 dark:border-slate-700">
      <div className="flex items-center gap-2">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={
              'text-2xl transition ' + (n <= rating ? 'text-amber-500' : 'text-slate-300')
            }
            aria-label={`Rate ${n} stars`}
          >
            ★
          </button>
        ))}
        <span className="ml-2 text-sm text-slate-500">{rating}/5</span>
      </div>
      <textarea
        className="mt-3 min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        placeholder="Comentario (opcional)"
        maxLength={2_000}
        value={comment}
        onChange={(e) => setComment(e.target.value)}
      />
      {error && <Alert variant="error" className="mt-2">{error}</Alert>}
      <div className="mt-2 flex gap-2">
        <Button onClick={save} loading={busy} size="sm">
          Publicar
        </Button>
        <Button variant="ghost" onClick={onCancel} size="sm">
          Cancelar
        </Button>
      </div>
    </div>
  );
}
