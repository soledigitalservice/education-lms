/* eslint-disable no-console */
/**
 * Custom Next.js server that also hosts a Socket.IO endpoint on the same
 * HTTP server (and port). Required because Next.js's built-in `next start`
 * cannot host long-lived WebSocket connections (it's optimised for the
 * serverless mental model).
 *
 *   pnpm dev  → tsx server.ts
 *   pnpm start → cross-env NODE_ENV=production tsx server.ts
 *
 * Deploy targets that work with this server: Railway, Render, Fly.io,
 * DigitalOcean App Platform, any VPS. NOT Vercel serverless functions.
 */
import { createServer } from 'node:http';
import { parse as parseUrl } from 'node:url';
import next from 'next';
import { Server as IOServer } from 'socket.io';

import { authenticateHandshake } from './src/lib/chat/socket-auth';
import { setIO } from './src/lib/chat/io';
import { ChatService } from './src/lib/chat/service';
import {
  startNotificationScheduler,
  stopNotificationScheduler,
} from './src/lib/notifications/scheduler';
import { prisma } from './src/lib/prisma';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  SocketData,
} from './src/lib/chat/events';

const dev = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT ?? '3000', 10);
const hostname = process.env.HOSTNAME ?? '0.0.0.0';

async function main(): Promise<void> {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => {
    // Hand everything to Next; Socket.IO upgrades happen below.
    const parsedUrl = parseUrl(req.url ?? '/', true);
    handle(req, res, parsedUrl).catch((err) => {
      console.error('Next request handler error:', err);
      res.statusCode = 500;
      res.end('internal server error');
    });
  });

  const io: IOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData> =
    new IOServer(httpServer, {
      path: '/socket.io',
      // Same-origin in dev (3000 → 3000) and prod (no separate host), so CORS
      // is only needed if the FE is ever served from a different origin.
      cors: dev ? { origin: true, credentials: true } : undefined,
      // Keep connections warm but kill ghosts promptly.
      pingInterval: 25_000,
      pingTimeout: 20_000,
    });

  setIO(io);

  // ---- handshake auth -----------------------------------------------
  io.use(async (socket, nextMiddleware) => {
    try {
      const data = await authenticateHandshake(socket.handshake.headers.cookie);
      socket.data = data;
      nextMiddleware();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'auth failed';
      // Socket.IO surfaces this to the client as `connect_error`.
      nextMiddleware(new Error(`Unauthorized: ${message}`));
    }
  });

  // ---- event wiring -------------------------------------------------
  io.on('connection', (socket) => {
    const userId = socket.data.userId;
    // Personal room used to fan-out events not tied to a specific chat room
    // (e.g. "new message in any room you're in" → unread badge).
    void socket.join(`user:${userId}`);
    const chat = new ChatService(prisma);

    socket.on('room:join', async (roomId, ack) => {
      try {
        await chat.getRoom(roomId, { userId, role: socket.data.role });
        await socket.join(`room:${roomId}`);
        ack({ ok: true });
        // Broadcast presence diff for that room.
        broadcastPresence(io, roomId);
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    socket.on('room:leave', (roomId) => {
      void socket.leave(`room:${roomId}`);
      broadcastPresence(io, roomId);
    });

    socket.on('message:send', async (payload, ack) => {
      try {
        const message = await chat.sendMessage(
          payload.roomId,
          { body: payload.body, fileId: payload.fileId },
          { userId, role: socket.data.role },
        );
        io.to(`room:${payload.roomId}`).emit('message:new', { roomId: payload.roomId, message });
        ack({ ok: true, message });
      } catch (err) {
        ack({ ok: false, error: err instanceof Error ? err.message : 'unknown' });
      }
    });

    socket.on('message:read', async (payload) => {
      try {
        await chat.markRead(payload.roomId, payload.messageId, { userId, role: socket.data.role });
        io.to(`room:${payload.roomId}`).emit('message:read', {
          roomId: payload.roomId,
          userId,
          messageId: payload.messageId,
        });
      } catch (err) {
        socket.emit('server:error', {
          message: err instanceof Error ? err.message : 'mark-read failed',
        });
      }
    });

    socket.on('typing', (payload) => {
      // Don't echo to sender; only broadcast to other room members.
      socket.to(`room:${payload.roomId}`).emit('typing', {
        roomId: payload.roomId,
        userId,
        typing: payload.typing,
      });
    });

    socket.on('disconnect', () => {
      // Recompute presence for every room the socket was in.
      // socket.rooms is empty by the time `disconnect` fires, so we read
      // from the engine's join records instead.
      for (const room of socket.rooms) {
        if (room.startsWith('room:')) {
          broadcastPresence(io, room.slice('room:'.length));
        }
      }
    });
  });

  // ---- background jobs ----------------------------------------------
  // The notification scheduler scans every minute for upcoming deadlines
  // and starting live sessions. Dedup via dispatch({dedupKey:...}) so each
  // notification fires at most once per (user, source).
  startNotificationScheduler(prisma);

  // ---- listen --------------------------------------------------------
  httpServer.listen(port, hostname, () => {
    console.log(`▶ Education LMS ${dev ? '(dev)' : '(prod)'} listening on http://${hostname}:${port}`);
    console.log(`  ↳ Socket.IO mounted at /socket.io`);
  });

  // Graceful shutdown so Prisma closes its pool cleanly.
  for (const sig of ['SIGINT', 'SIGTERM'] as const) {
    process.on(sig, () => {
      console.log(`\nReceived ${sig}, shutting down...`);
      stopNotificationScheduler();
      io.close();
      httpServer.close(() => {
        void prisma.$disconnect().finally(() => process.exit(0));
      });
    });
  }
}

function broadcastPresence(
  io: IOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>,
  roomId: string,
): void {
  const sockets = io.sockets.adapter.rooms.get(`room:${roomId}`);
  if (!sockets) return;
  const userIds = new Set<string>();
  for (const socketId of sockets) {
    const s = io.sockets.sockets.get(socketId);
    if (s?.data.userId) userIds.add(s.data.userId);
  }
  io.to(`room:${roomId}`).emit('presence:room', { roomId, userIds: [...userIds] });
}

main().catch((err) => {
  console.error('Fatal server error:', err);
  process.exit(1);
});
