'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT } from '@/lib/i18n/client';
import type { ForumPostDto, ForumThreadDto } from '@/lib/forums/service';

const DELETED = '[mensaje eliminado]';

interface Props {
  thread: ForumThreadDto;
  posts: ForumPostDto[];
  currentUserId: string;
  canModerate: boolean;
}

export function ThreadView({ thread: initialThread, posts: initialPosts, currentUserId, canModerate }: Props) {
  const router = useRouter();
  const t = useT();
  const [thread, setThread] = useState<ForumThreadDto>(initialThread);
  const [posts, setPosts] = useState<ForumPostDto[]>(initialPosts);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function reply(body: string, parentId: string | null): Promise<void> {
    setBusy('reply');
    setError(null);
    try {
      const created = await apiFetch<ForumPostDto>(`/api/threads/${thread.id}/posts`, {
        method: 'POST',
        body: { body, ...(parentId ? { parentId } : {}) },
      });
      setPosts([...posts, created]);
      setReplyTo(null);
      router.refresh();
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(null);
    }
  }

  async function deletePost(postId: string): Promise<void> {
    if (!confirm(t('¿Eliminar este mensaje?'))) return;
    setBusy(postId);
    try {
      await apiFetch(`/api/posts/${postId}`, { method: 'DELETE' });
      setPosts(
        posts.map((p) =>
          p.id === postId
            ? { ...p, body: DELETED }
            : p,
        ),
      );
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(null);
    }
  }

  async function toggleModeration(field: 'pinned' | 'locked'): Promise<void> {
    setBusy(field);
    try {
      const updated = await apiFetch<ForumThreadDto>(`/api/threads/${thread.id}`, {
        method: 'PATCH',
        body: { [field]: !thread[field] },
      });
      setThread(updated);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setBusy(null);
    }
  }

  // Build a 1-level tree: top-level posts + replies grouped by parentId.
  const topLevel = posts.filter((p) => !p.parentId);
  const repliesOf = (parentId: string): ForumPostDto[] =>
    posts.filter((p) => p.parentId === parentId);

  return (
    <article className="mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            {thread.pinned && <Badge variant="warning">{t('Fijado')}</Badge>}
            {thread.locked && <Badge variant="default">{t('Cerrado')}</Badge>}
          </div>
          <h1 className="mt-1 text-2xl font-bold">{thread.title}</h1>
          <p className="mt-1 text-xs text-slate-500">
            {t('Por')} {thread.author.fullName} ·{' '}
            {new Date(thread.createdAt).toLocaleDateString('es')}
          </p>
        </div>
        {canModerate && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => toggleModeration('pinned')}
              loading={busy === 'pinned'}
            >
              {thread.pinned ? t('Desfijar') : t('Fijar')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => toggleModeration('locked')}
              loading={busy === 'locked'}
            >
              {thread.locked ? t('Reabrir') : t('Cerrar')}
            </Button>
          </div>
        )}
      </div>

      {error && <Alert variant="error" className="mt-4">{error}</Alert>}

      <ul className="mt-6 space-y-3">
        {topLevel.map((p) => (
          <li key={p.id}>
            <PostCard
              post={p}
              currentUserId={currentUserId}
              canModerate={canModerate}
              busy={busy === p.id}
              onDelete={() => deletePost(p.id)}
              onReplyClick={() => setReplyTo(p.id)}
              showReplyButton={!thread.locked}
            />
            {repliesOf(p.id).length > 0 && (
              <ul className="ml-8 mt-2 space-y-2 border-l-2 border-slate-200 pl-3 dark:border-slate-700">
                {repliesOf(p.id).map((reply) => (
                  <li key={reply.id}>
                    <PostCard
                      post={reply}
                      currentUserId={currentUserId}
                      canModerate={canModerate}
                      busy={busy === reply.id}
                      onDelete={() => deletePost(reply.id)}
                      onReplyClick={() => setReplyTo(p.id)}
                      showReplyButton={false}
                    />
                  </li>
                ))}
              </ul>
            )}
            {replyTo === p.id && (
              <ReplyForm
                onCancel={() => setReplyTo(null)}
                onSubmit={(body) => reply(body, p.id)}
                busy={busy === 'reply'}
              />
            )}
          </li>
        ))}
      </ul>

      {!thread.locked && (
        <Card className="mt-6">
          <CardTitle>{t('Añadir respuesta')}</CardTitle>
          <ReplyForm
            embedded
            onCancel={() => undefined}
            onSubmit={(body) => reply(body, null)}
            busy={busy === 'reply'}
          />
        </Card>
      )}
    </article>
  );
}

function PostCard({
  post,
  currentUserId,
  canModerate,
  busy,
  onDelete,
  onReplyClick,
  showReplyButton,
}: {
  post: ForumPostDto;
  currentUserId: string;
  canModerate: boolean;
  busy: boolean;
  onDelete: () => void;
  onReplyClick: () => void;
  showReplyButton: boolean;
}) {
  const t = useT();
  const isAuthor = post.author.id === currentUserId;
  const deleted = post.body === DELETED;
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{post.author.fullName}</p>
          <p className="text-xs text-slate-500">
            {new Date(post.createdAt).toLocaleString('es', {
              dateStyle: 'short',
              timeStyle: 'short',
            })}
            {post.editedAt && ` · ${t('editado')}`}
          </p>
        </div>
        <div className="flex gap-2">
          {showReplyButton && (
            <Button size="sm" variant="ghost" onClick={onReplyClick}>
              {t('Responder')}
            </Button>
          )}
          {(isAuthor || canModerate) && !deleted && (
            <Button size="sm" variant="ghost" loading={busy} onClick={onDelete}>
              {t('Eliminar')}
            </Button>
          )}
        </div>
      </div>
      <p
        className={
          'mt-3 whitespace-pre-wrap text-sm ' + (deleted ? 'italic text-slate-400' : '')
        }
      >
        {deleted ? t('[mensaje eliminado]') : post.body}
      </p>
    </Card>
  );
}

function ReplyForm({
  onSubmit,
  onCancel,
  busy,
  embedded,
}: {
  onSubmit: (body: string) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  embedded?: boolean;
}) {
  const t = useT();
  const [body, setBody] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>): Promise<void> {
    e.preventDefault();
    if (!body.trim()) return;
    await onSubmit(body.trim());
    setBody('');
  }
  return (
    <form onSubmit={submit} className={embedded ? 'mt-3' : 'mt-2 ml-8'}>
      <textarea
        className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
        required
        maxLength={20_000}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t('Escribe tu respuesta...')}
      />
      <div className="mt-2 flex justify-end gap-2">
        {!embedded && (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            {t('Cancelar')}
          </Button>
        )}
        <Button type="submit" size="sm" loading={busy} disabled={!body.trim()}>
          {t('Publicar')}
        </Button>
      </div>
    </form>
  );
}
