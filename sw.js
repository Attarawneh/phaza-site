/**
 * Tombstone service worker.
 *
 * phaza.io previously shipped a tile-caching service worker. It is still
 * registered in the browsers of anyone who visited before the rebuild, and
 * its script now 404s, which leaves stale workers and caches sitting on
 * visitors' devices. This replacement does one job: uninstall all of it and
 * reload any open page onto the current build.
 */
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch { /* best effort */ }
    try { await self.registration.unregister(); } catch { /* already gone */ }
    try {
      const clients = await self.clients.matchAll({ type: 'window' });
      for (const c of clients) { try { await c.navigate(c.url); } catch {} }
    } catch { /* nothing open */ }
  })());
});

// Never intercept a request while winding down.
self.addEventListener('fetch', () => {});
