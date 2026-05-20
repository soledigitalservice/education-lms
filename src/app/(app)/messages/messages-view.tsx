'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api/client';
import type { ChatRoomDto } from '@/lib/chat/service';
import { ChatWindow } from './chat-window';
import { NewDirectChatDialog } from './new-direct-chat';

interface Props {
  currentUserId: string;
  currentUserName: string;
  rooms: ChatRoomDto[];
  initialRoomId: string | null;
}

export function MessagesView({
  currentUserId,
  currentUserName,
  rooms: initialRooms,
  initialRoomId,
}: Props) {
  const router = useRouter();
  const params = useSearchParams();
  const [rooms, setRooms] = useState<ChatRoomDto[]>(initialRooms);
  const [activeRoomId, setActiveRoomId] = useState<string | null>(initialRoomId);
  const [showNewDirect, setShowNewDirect] = useState(false);

  // If URL changes (?room=...) sync local state.
  useEffect(() => {
    const r = params.get('room');
    if (r && r !== activeRoomId) setActiveRoomId(r);
  }, [params, activeRoomId]);

  function selectRoom(id: string): void {
    setActiveRoomId(id);
    const sp = new URLSearchParams(params.toString());
    sp.set('room', id);
    router.replace(`/messages?${sp.toString()}`, { scroll: false });
  }

  async function refreshRooms(): Promise<void> {
    const fresh = await apiFetch<ChatRoomDto[]>('/api/me/chat-rooms');
    setRooms(fresh);
  }

  const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

  return (
    <>
      <header className="border-b border-slate-200 pb-6 dark:border-slate-800">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Mensajes</h1>
          <Button onClick={() => setShowNewDirect(true)}>+ Nuevo chat</Button>
        </div>
      </header>

      <div className="mt-6 grid gap-4 lg:grid-cols-[320px_1fr] lg:gap-6">
        <aside className="space-y-1">
          {rooms.length === 0 ? (
            <Card>
              <p className="text-sm text-slate-500">
                Aún no tienes conversaciones. Pulsa &quot;+ Nuevo chat&quot; para empezar.
              </p>
            </Card>
          ) : (
            <ul className="space-y-1">
              {rooms.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => selectRoom(r.id)}
                    className={
                      'w-full rounded-lg border px-3 py-2 text-left transition ' +
                      (activeRoomId === r.id
                        ? 'border-brand-500 bg-brand-50 dark:bg-brand-950'
                        : 'border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800')
                    }
                  >
                    <div className="flex items-center justify-between">
                      <p className="truncate text-sm font-medium">
                        {r.kind === 'DIRECT' ? r.otherParticipant?.fullName ?? '?' : r.name}
                      </p>
                      {r.unreadCount > 0 && (
                        <Badge variant="brand">{r.unreadCount}</Badge>
                      )}
                    </div>
                    <p className="mt-1 flex items-center gap-2 text-xs text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase dark:bg-slate-800">
                        {r.kind}
                      </span>
                      {r.lastMessage && (
                        <span className="truncate">
                          {r.lastMessage.senderId === currentUserId ? 'Tú: ' : ''}
                          {r.lastMessage.body}
                        </span>
                      )}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className="min-h-[60vh] rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          {activeRoom ? (
            <ChatWindow
              room={activeRoom}
              currentUserId={currentUserId}
              currentUserName={currentUserName}
              onRoomUpdated={refreshRooms}
            />
          ) : (
            <div className="flex h-full items-center justify-center p-12">
              <p className="text-sm text-slate-500">
                Selecciona una conversación en la izquierda.
              </p>
            </div>
          )}
        </section>
      </div>

      {showNewDirect && (
        <NewDirectChatDialog
          onClose={() => setShowNewDirect(false)}
          onCreated={(roomId) => {
            setShowNewDirect(false);
            void refreshRooms();
            selectRoom(roomId);
          }}
        />
      )}
    </>
  );
}
