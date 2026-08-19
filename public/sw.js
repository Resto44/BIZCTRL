// Service Worker — network-first for JS/CSS, cache-first for images/fonts only
const CACHE_VERSION = 'v9';
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
