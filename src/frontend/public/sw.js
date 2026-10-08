/* SkyWhisper service worker — cache the shell, keep the field offline.

Strategy: precache the app shell on install; for navigations, network-first
with the cached shell as fallback (so the app still loads on a cold start);
for pack audio/transcript, stale-while-revalidate so a downloaded pack
plays with no network at all.
*/
const SHELL_CACHE = 'skywhisper-shell-v1';
const PACK_CACHE = 'skywhisper-packs-v1';

const SHELL_ASSETS = [
  '/',
  '/index.html',
  '/manifest.webmanifest',
  '/icon.svg',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== PACK_CACHE)
          .map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // Pack audio + transcripts: stale-while-revalidate. This is the offline
  // guarantee — a pack fetched once at home plays in the field with no signal.
  if (url.pathname.startsWith('/api/packs/')) {
    event.respondWith(
      caches.open(PACK_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res && res.status === 200) cache.put(req, res.clone());
            return res;
          })
          .catch(() => null);
        return cached || network || Response.error();
      })
    );
    return;
  }

  // Navigations: network-first, fall back to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match('/index.html').then((r) => r || Response.error()))
    );
    return;
  }

  // Same-origin static assets: cache-first.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
