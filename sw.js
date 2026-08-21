/**
 * Phaza tile-memory service worker.
 *
 * Persistent cache-first storage for everything the basemap needs from the
 * tile host (vector tiles, style JSON, sprites, glyphs). Tile URLs are
 * version-dated by the host, so cache-first is safe: once a tile has been
 * seen it is served from device memory forever — repeat visits, scroll-backs
 * and flaky networks never refetch or break the map.
 */
const TILE_CACHE = 'phaza-tiles-v1';
const TILE_HOSTS = new Set(['tiles.openfreemap.org']);
const MAX_ENTRIES = 6000;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith('phaza-tiles-') && k !== TILE_CACHE)
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

let trimming = false;
async function trim(cache) {
  if (trimming) return;
  trimming = true;
  try {
    const keys = await cache.keys();
    if (keys.length > MAX_ENTRIES) {
      // Cache API keys are returned in insertion order in practice —
      // dropping from the front approximates LRU well enough here.
      const excess = keys.slice(0, keys.length - MAX_ENTRIES);
      await Promise.all(excess.map((k) => cache.delete(k)));
    }
  } catch {
    /* trimming is best-effort */
  } finally {
    trimming = false;
  }
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || !TILE_HOSTS.has(url.host)) return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(TILE_CACHE);
      const hit = await cache.match(event.request);
      if (hit) return hit;
      const res = await fetch(event.request);
      if (res.ok || res.status === 204) {
        cache.put(event.request, res.clone()).then(() => trim(cache)).catch(() => {});
      }
      return res;
    })(),
  );
});
