// Service Worker — network-first for JS/CSS, cache-first for images/fonts only
const CACHE_VERSION = 'v11';
const CACHE_NAME = `app-cache-${CACHE_VERSION}`;

// On install: skip waiting so the new SW activates immediately
self.addEventListener('install', (event) => {
  self.skipWaiting();
});

// On activate: take control of all clients and clear ALL old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.map((key) => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

// Fetch strategy:
// - Navigation (HTML): network-first
// - JS / CSS / JSON (app code): ALWAYS network — never cache, prevents stale React copies
// - Images / fonts: cache-first (safe to cache, don't cause React duplication)
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET and cross-origin requests
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  // Navigation (HTML pages) — network-first
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request).catch(() => caches.match(request))
    );
    return;
  }

  const ext = url.pathname.split('.').pop().toLowerCase();

  // JS, CSS, JSON — always fetch from network to prevent stale React / module duplication
  if (['js', 'css', 'json', 'jsx', 'ts', 'tsx'].includes(ext)) {
    event.respondWith(fetch(request));
    return;
  }

  // Images and fonts — cache-first (safe)
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'woff', 'woff2', 'ttf'].includes(ext)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // Everything else — network
  event.respondWith(fetch(request));
});


// Encrypted Web Push wakes this worker even with no open application window.
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data?.json() || {}; } catch { /* Always display a notification. */ }
  event.waitUntil(self.registration.showNotification(payload.title || 'BizCTRL', {
    body: payload.body || 'New business activity · رویداد جدید کسب‌وکار',
    icon: '/icons/icon-192.png', badge: '/icons/icon-96.png',
    tag: payload.tag || undefined,
    data: { url: '/notifications' },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL('/notifications', self.location.origin).href;
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (existing) { await existing.navigate(target); await existing.focus(); }
    else await self.clients.openWindow(target);
  })());
});
