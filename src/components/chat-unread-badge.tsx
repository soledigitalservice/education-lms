'use client';

import { useEffect, useState } from 'react';

import { apiFetch } from '@/lib/api/client';
import { useChatSocket } from '@/lib/chat/use-chat-socket';

/**
 * Lightweight badge that polls `/api/me/chat-unread` every 30s and bumps
 * locally whenever the socket sees a new message in a room the user
 * belongs to. Cheap and "good enough" for v1.
 */
export function ChatUnreadBadge() {
  const { socket } = useChatSocket();
  const [count, setCount] = useState(0);

  async function refresh(): Promise<void> {
    try {
      const r = await apiFetch<{ unreadCount: number }>('/api/me/chat-unread');
      setCount(r.unreadCount);
    } catch {
      // ignore — leave stale count
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const onNew = (): void => {
      // Re-fetch authoritative count (cheap; no client-side bookkeeping needed).
      void refresh();
    };
    socket.on('message:new', onNew);
    return () => {
      socket.off('message:new', onNew);
    };
  }, [socket]);

  if (count <= 0) return null;
  return (
    <span className="ml-1 rounded-full bg-brand-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
      {count > 99 ? '99+' : count}
    </span>
  );
}
