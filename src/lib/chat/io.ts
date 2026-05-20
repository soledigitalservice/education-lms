import type { Server as IOServer } from 'socket.io';

import type { ClientToServerEvents, ServerToClientEvents, SocketData } from './events';

export type ChatIO = IOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

/**
 * Singleton handle so route handlers can `getIO()?.to(roomId).emit(...)`
 * without having to thread the Socket.IO server through every call site.
 *
 * Set once at server boot by `server.ts`. Reads return `null` when running
 * outside the Node server (e.g. unit tests or hypothetical serverless
 * deploy), and emit calls become no-ops.
 */
const g = globalThis as unknown as { __edu_io?: ChatIO };

export function setIO(io: ChatIO): void {
  g.__edu_io = io;
}

export function getIO(): ChatIO | null {
  return g.__edu_io ?? null;
}

/**
 * Convenience helper: broadcast a new message to everyone in the room.
 * Safe to call when IO isn't initialised (becomes a no-op).
 */
export function emitMessage(roomId: string, message: import('./service').ChatMessageDto): void {
  getIO()?.to(`room:${roomId}`).emit('message:new', { roomId, message });
}

export function emitRead(roomId: string, userId: string, messageId: string): void {
  getIO()?.to(`room:${roomId}`).emit('message:read', { roomId, userId, messageId });
}
