'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { apiFetch, HttpError } from '@/lib/api/client';
import { useT, useLocale } from '@/lib/i18n/client';
import type { ChatMessageDto, ChatRoomDto } from '@/lib/chat/service';
import { useChatRoom } from '@/lib/chat/use-chat-socket';

interface Props {
  room: ChatRoomDto;
  currentUserId: string;
  currentUserName: string;
  /** Called after a successful send so the parent can refresh the room list. */
  onRoomUpdated: () => void;
}

export function ChatWindow({ room, currentUserId, currentUserName, onRoomUpdated }: Props) {
  const t = useT();
  const locale = useLocale();
  const dateLocale = locale === 'en' ? 'en-US' : 'es';
  const [messages, setMessages] = useState<ChatMessageDto[]>([]);
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [presence, setPresence] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load history (newest at the bottom of the list).
  const loadInitial = useCallback(async () => {
    setLoadingHistory(true);
    try {
      const rows = await apiFetch<ChatMessageDto[]>(
        `/api/chat-rooms/${room.id}/messages?limit=50`,
      );
      // API returns newest-first; reverse for chronological display.
      setMessages(rows.slice().reverse());
      setHasMore(rows.length === 50);
    } catch (err) {
      setError(err instanceof HttpError ? String(err.body.message) : 'Error');
    } finally {
      setLoadingHistory(false);
    }
  }, [room.id]);

  useEffect(() => {
    void loadInitial();
    setBody('');
    setError(null);
  }, [loadInitial]);

  // Subscribe to socket events for this room.
  const { connected, sendMessage, markRead } = useChatRoom(room.id, {
    onMessage: (msg) => {
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      // Auto-scroll if user is near the bottom.
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
      // Mark incoming messages from others as read immediately.
      if (msg.senderId !== currentUserId) markRead(msg.id);
    },
    onPresence: (userIds) => setPresence(userIds),
  });

  // Scroll-to-bottom on first load.
  useEffect(() => {
    if (!loadingHistory) {
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [loadingHistory]);

  // Mark the most-recent visible message as read whenever the list changes.
  const lastMessageId = messages.at(-1)?.id;
  useEffect(() => {
    if (lastMessageId) markRead(lastMessageId);
  }, [lastMessageId, markRead]);

  async function loadOlder(): Promise<void> {
    if (!hasMore || messages.length === 0) return;
    const cursor = messages[0]!.id;
    const older = await apiFetch<ChatMessageDto[]>(
      `/api/chat-rooms/${room.id}/messages?cursor=${cursor}&limit=50`,
    );
    if (older.length === 0) {
      setHasMore(false);
      return;
    }
    const el = scrollRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setMessages((prev) => [...older.slice().reverse(), ...prev]);
    setHasMore(older.length === 50);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  }

  async function send(): Promise<void> {
    const trimmed = body.trim();
    if (!trimmed) return;
    setSending(true);
    setError(null);
    try {
      const msg = await sendMessage(trimmed);
      setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
      setBody('');
      onRoomUpdated();
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (el) el.scrollTop = el.scrollHeight;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const otherOnline = useMemo(
    () => presence.filter((id) => id !== currentUserId),
    [presence, currentUserId],
  );

  return (
    <div className="flex h-[70vh] flex-col">
      <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
        <div>
          <p className="font-medium">
            {room.kind === 'DIRECT' ? room.otherParticipant?.fullName ?? '?' : room.name}
          </p>
          <p className="flex items-center gap-2 text-xs text-slate-500">
            <Badge variant="default">{room.kind}</Badge>
            <span>{t('{n} participante(s)', { n: room.participantCount })}</span>
            {connected ? (
              <span className="flex items-center gap-1">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {t('Conectado')}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-amber-600">
                <span className="size-1.5 rounded-full bg-amber-500" />
                {t('Reconectando…')}
              </span>
            )}
            {otherOnline.length > 0 && room.kind === 'DIRECT' && (
              <span className="text-emerald-600">{t('· Otro extremo conectado')}</span>
            )}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {hasMore && messages.length > 0 && (
          <div className="flex justify-center">
            <Button size="sm" variant="ghost" onClick={loadOlder}>
              {t('Cargar mensajes anteriores')}
            </Button>
          </div>
        )}
        {loadingHistory ? (
          <p className="text-center text-sm text-slate-500">{t('Cargando…')}</p>
        ) : messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-slate-500">
            {t('No hay mensajes todavía. Escribe el primero abajo.')}
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div key={m.id} className={mine ? 'flex justify-end' : 'flex justify-start'}>
                <div
                  className={
                    'max-w-[75%] rounded-2xl px-3 py-2 text-sm ' +
                    (mine
                      ? 'bg-brand-600 text-white'
                      : 'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-100')
                  }
                >
                  {!mine && (
                    <p className="text-xs font-medium opacity-70">{m.senderName}</p>
                  )}
                  <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                  <p
                    className={
                      'mt-1 text-[10px] ' +
                      (mine ? 'text-white/70' : 'text-slate-500 dark:text-slate-400')
                    }
                  >
                    {new Date(m.createdAt).toLocaleTimeString(dateLocale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              </div>
            );
          })
        )}
      </div>

      <footer className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
        {error && <p className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <textarea
            className="min-h-12 flex-1 resize-none rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800"
            placeholder={t('Mensaje para {name}', {
              name: room.kind === 'DIRECT' ? room.otherParticipant?.fullName ?? '?' : room.name ?? '',
            })}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            maxLength={4_000}
            disabled={sending}
          />
          <Button onClick={send} loading={sending} disabled={!body.trim()}>
            {t('Enviar')}
          </Button>
        </div>
        <p className="mt-1 text-[10px] text-slate-500">
          {t('Enter para enviar · Shift+Enter para salto de línea · {name}', {
            name: currentUserName,
          })}
        </p>
      </footer>
    </div>
  );
}
