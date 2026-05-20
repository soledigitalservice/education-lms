/* eslint-disable no-restricted-globals */
/**
 * Education LMS — service worker.
 *
 * Strategy
 *   - Precache the app shell (start_url + offline page) on install
 *   - Network-first for navigations, falling back to cached shell if offline
 *   - Cache-first with revalidation for hashed static assets (/_next/static/*)
 *   - Never cache API responses (auth + data freshness > offline)
 */

const VERSION = 'edu-v1';
const STATIC_CACHE = `${VERSION}-static`;
const SHELL_CACHE = `${VERSION}-shell`;

const APP_SHELL_URLS = ['/', '/offline'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(APP_SHELL_URLS)).catch(() => null),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never cache API responses — auth state must be fresh.
  if (url.pathname.startsWith('/api/')) return;

  // Navigations → network-first, fall back to cached offline page.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((res) => {
          // Update shell cache opportunistically.
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(request, copy)).catch(() => null);
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(request);
          if (cached) return cached;
          return caches.match('/offline');
        }),
    );
    return;
  }

  // Hashed static assets → cache-first.
  if (url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((res) => {
            const copy = res.clone();
            caches.open(STATIC_CACHE).then((c) => c.put(request, copy)).catch(() => null);
            return res;
          }),
      ),
    );
  }
});

// =========================================================================
// Capa 9 — Web Push handlers
// =========================================================================

/**
 * Payload shape sent by the server (see src/lib/push/index.ts):
 *   { title: string, body: string, link?: string, tag?: string }
 */
self.addEventListener('push', (event) => {
  let payload = { title: 'Education LMS', body: 'Nueva notificación' };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // payload was not JSON; fall back to defaults
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      tag: payload.tag || undefined,
      data: { link: payload.link || '/' },
    }),
  );
});

/**
 * On click: focus an existing tab if the user is already in the app, else
 * open a new one at the deep-link the notification carried.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const link = event.notification.data?.link || '/';
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const target = new URL(link, self.location.origin).href;
      // Reuse a tab on the same origin if any.
      for (const client of allClients) {
        if (client.url.startsWith(self.location.origin) && 'focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(target);
            } catch {
              // navigate() can throw if the target is cross-origin; ignore.
            }
          }
          return;
        }
      }
      // No open tab — open a new one.
      await self.clients.openWindow(target);
    })(),
  );
});
