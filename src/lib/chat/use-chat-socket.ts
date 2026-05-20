'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

import type {
  ClientToServerEvents,
  ServerToClientEvents,
} from './events';

type ChatSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Lazy, app-wide singleton client socket. Same-origin so cookies travel
 * automatically (the server reads `edu_access` from the handshake cookies).
 *
 * We keep ONE socket per browser tab and let it survive route changes.
 */
let globalSocket: ChatSocket | null = null;

function getSocket(): ChatSocket {
  if (globalSocket) return globalSocket;
  globalSocket = io({
    path: '/socket.io',
    withCredentials: true,
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
  }) as ChatSocket;
  return globalSocket;
}

export interface ChatSocketAPI {
  socket: ChatSocket;
  connected: boolean;
}

/** Returns the singleton socket + a live `connected` boolean for the UI. */
export function useChatSocket(): ChatSocketAPI {
  const socket = useMemo(() => getSocket(), []);
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    const onConnect = (): void => setConnected(true);
    const onDisconnect = (): void => setConnected(false);
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, [socket]);

  return { socket, connected };
}

/**
 * Bind to a specific room: joins on mount, leaves on unmount. The caller
 * passes message and read-receipt handlers; the hook returns helpers to
 * send a message (using the socket's ack) and to mark the latest as read.
 */
export function useChatRoom(
  roomId: string | null,
  handlers: {
    onMessage: (msg: import('./service').ChatMessageDto) => void;
    onRead?: (userId: string, messageId: string) => void;
    onPresence?: (userIds: string[]) => void;
    onTyping?: (userId: string, typing: boolean) => void;
  },
) {
  const { socket, connected } = useChatSocket();
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!roomId || !connected) return;
    socket.emit('room:join', roomId, (res) => {
      if (!res.ok) {
        // eslint-disable-next-line no-console
        console.warn('room:join failed:', res.error);
      }
    });

    const onMessage = (payload: { roomId: string; message: import('./service').ChatMessageDto }) => {
      if (payload.roomId === roomId) handlersRef.current.onMessage(payload.message);
    };
    const onRead = (payload: { roomId: string; userId: string; messageId: string }) => {
      if (payload.roomId === roomId) handlersRef.current.onRead?.(payload.userId, payload.messageId);
    };
    const onPresence = (payload: { roomId: string; userIds: string[] }) => {
      if (payload.roomId === roomId) handlersRef.current.onPresence?.(payload.userIds);
    };
    const onTyping = (payload: { roomId: string; userId: string; typing: boolean }) => {
      if (payload.roomId === roomId) handlersRef.current.onTyping?.(payload.userId, payload.typing);
    };

    socket.on('message:new', onMessage);
    socket.on('message:read', onRead);
    socket.on('presence:room', onPresence);
    socket.on('typing', onTyping);

    return () => {
      socket.emit('room:leave', roomId);
      socket.off('message:new', onMessage);
      socket.off('message:read', onRead);
      socket.off('presence:room', onPresence);
      socket.off('typing', onTyping);
    };
  }, [socket, roomId, connected]);

  return {
    connected,
    sendMessage(body: string, fileId?: string): Promise<import('./service').ChatMessageDto> {
      return new Promise((resolve, reject) => {
        if (!roomId) return reject(new Error('No room'));
        socket.emit('message:send', { roomId, body, fileId }, (res) => {
          if (res.ok) resolve(res.message);
          else reject(new Error(res.error));
        });
      });
    },
    markRead(messageId: string): void {
      if (roomId) socket.emit('message:read', { roomId, messageId });
    },
    setTyping(typing: boolean): void {
      if (roomId) socket.emit('typing', { roomId, typing });
    },
  };
}
