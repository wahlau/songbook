/*
 * Offline support. Always tries the network first (so new songs show up
 * immediately) and falls back to the last saved copy when there's no signal —
 * handy for tablets on patchy church Wi-Fi. Once a songbook link has been
 * opened, it keeps working offline on that device.
 */
const CACHE = 'songbook-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      })
      .catch(() =>
        caches.match(req).then(hit =>
          hit || caches.match(req, { ignoreSearch: true }).then(r => r || Response.error())
        )
      )
  );
});
