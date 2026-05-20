import { PrismaClient } from '@prisma/client';
import { PrismaNeon } from '@prisma/adapter-neon';
import { Pool, neonConfig } from '@neondatabase/serverless';
import ws from 'ws';

/**
 * Prisma client singleton.
 *
 * Why the Neon HTTP/WebSocket adapter:
 *   The dev environment for this project sits behind ESET, which blocks
 *   direct TCP to Postgres on port 5432. The adapter routes queries over
 *   the WebSocket endpoint Neon exposes on 443 (standard HTTPS), so the
 *   connection bypasses the antivirus' Postgres-specific filter.
 *
 *   In Node.js (server.ts, route handlers, prisma:seed) we have to provide
 *   the `ws` WebSocket impl. Browsers have native WebSocket.
 *
 * Next.js' dev server HMR can otherwise create new PrismaClient instances
 * on every reload — we stash it on `globalThis` to survive that.
 */
if (typeof globalThis.WebSocket === 'undefined') {
  // Node.js doesn't ship a global WebSocket. The 'ws' polyfill is what
  // @neondatabase/serverless expects on the server side.
  neonConfig.webSocketConstructor = ws as unknown as typeof WebSocket;
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');
  const pool = new Pool({ connectionString });
  const adapter = new PrismaNeon(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });
}

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
