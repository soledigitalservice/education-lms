'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { apiFetch } from '@/lib/api/client';
import { useChatSocket } from '@/lib/chat/use-chat-socket';

/**
 * Nav bell with an unread-count badge. Polls the unread endpoint every
 * 30 seconds and bumps locally on socket events (new chat messages
 * generate notifications; we re-fetch the count when those arrive).
 */
export function NotificationBell() {
  const { socket } = useChatSocket();
  const [count, setCount] = useState(0);

  async function refresh(): Promise<void> {
    try {
      const r = await apiFetch<{ unreadCount: number }>('/api/me/notifications/unread-count');
      setCount(r.unreadCount);
    } catch {
      // ignore — leave stale
    }
  }

  useEffect(() => {
    void refresh();
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, []);

  // When a chat message lands or any push event fires, re-poll authoritative count.
  useEffect(() => {
    const bump = (): void => void refresh();
    socket.on('message:new', bump);
    return () => {
      socket.off('message:new', bump);
    };
  }, [socket]);

  return (
    <Link
      href="/notifications"
      className="flex items-center rounded-md px-2 py-1.5 text-slate-700 transition hover:bg-slate-100 dark:text-slate-200 dark:hover:bg-slate-800"
      aria-label={`Notificaciones${count > 0 ? `, ${count} sin leer` : ''}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="18"
        height="18"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {count > 0 && (
        <span className="ml-1 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">
          {count > 99 ? '99+' : count}
        </span>
      )}
    </Link>
  );
}
