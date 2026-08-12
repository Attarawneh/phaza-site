/**
 * Phaza tile-memory + app-shell service worker.
 *
 * 1) Tile cache: persistent cache-first storage for everything the basemap
 *    needs from the tile host (vector tiles, style JSON, sprites, glyphs).
 *    Tile URLs are version-dated by the host, so cache-first is safe.
 * 2) Shell cache: same-origin /assets/ files carry content hashes in their
 *    filenames (Vite build), and Google-Fonts woff2 URLs are versioned —
 *    both are immutable, so cache-first makes repeat visits instant and
 *    resilient to flaky networks. index.html and other mutable files are
 *    deliberately NOT touched.
 */
const TILE_CACHE = 'phaza-tiles-v1';
const SHELL_CACHE = 'phaza-shell-v1';
const KEEP_CACHES = new Set([TILE_CACHE, SHELL_CACHE]);
const TILE_HOSTS = new Set(['tiles.openfreemap.org']);
const FONT_HOSTS = new Set(['fonts.gstatic.com']);
const MAX_ENTRIES = 6000;
const MAX_SHELL_ENTRIES = 300;

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith('phaza-tiles-') || k.startsWith('phaza-shell-')) && !KEEP_CACHES.has(k))
          .map((k) => caches.delete(k)),
      );
      await self.clients.claim();
    })(),
  );
});

const trimming = { tiles: false, shell: false };
async function trim(cache, slot, max) {
  if (trimming[slot]) return;
  trimming[slot] = true;
  try {
    const keys = await cache.keys();
    if (keys.length > max) {
      // Cache API keys are returned in insertion order in practice —
      // dropping from the front approximates LRU well enough here.
      const excess = keys.slice(0, keys.length - max);
      await Promise.all(excess.map((k) => cache.delete(k)));
    }
  } catch {
    /* trimming is best-effort */
  } finally {
    trimming[slot] = false;
  }
}

const cacheFirst = async (request, cacheName, slot, max) => {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok || res.status === 204) {
    cache.put(request, res.clone()).then(() => trim(cache, slot, max)).catch(() => {});
  }
  return res;
};

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);

  // Basemap tiles / style / sprites / glyphs — cache-first forever.
  if (TILE_HOSTS.has(url.host)) {
    event.respondWith(cacheFirst(event.request, TILE_CACHE, 'tiles', MAX_ENTRIES));
    return;
  }

  // Immutable app shell: content-hashed build assets + versioned font files.
  const sameOriginAsset = url.origin === self.location.origin && url.pathname.startsWith('/assets/');
  if (sameOriginAsset || FONT_HOSTS.has(url.host)) {
    event.respondWith(cacheFirst(event.request, SHELL_CACHE, 'shell', MAX_SHELL_ENTRIES));
  }
});
