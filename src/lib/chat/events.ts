/**
 * Wire format shared by client and server. Keeping it in one file means
 * a typo in an event name is a compile error on both sides.
 */
import type { ChatMessageDto } from './service';

/** Events the server emits to the client. */
export interface ServerToClientEvents {
  /** A new message landed in a room you're a member of. */
  'message:new': (payload: { roomId: string; message: ChatMessageDto }) => void;
  /** Another participant changed their lastReadMessageId. */
  'message:read': (payload: { roomId: string; userId: string; messageId: string }) => void;
  /** Another participant started/stopped typing. */
  'typing': (payload: { roomId: string; userId: string; typing: boolean }) => void;
  /** Presence diff for a room. `userIds` are the user ids currently online IN THIS ROOM. */
  'presence:room': (payload: { roomId: string; userIds: string[] }) => void;
  /** Connection-level errors not tied to one request. */
  'server:error': (payload: { message: string }) => void;
}

/** Events the client emits to the server. */
export interface ClientToServerEvents {
  'room:join': (roomId: string, ack: (ok: { ok: true } | { ok: false; error: string }) => void) => void;
  'room:leave': (roomId: string) => void;
  'message:send': (
    payload: { roomId: string; body: string; fileId?: string },
    ack: (res: { ok: true; message: ChatMessageDto } | { ok: false; error: string }) => void,
  ) => void;
  'message:read': (payload: { roomId: string; messageId: string }) => void;
  'typing': (payload: { roomId: string; typing: boolean }) => void;
}

/** Per-socket data attached after auth. */
export interface SocketData {
  userId: string;
  email: string;
  role: 'ADMIN' | 'TEACHER' | 'PARENT' | 'STUDENT';
}
