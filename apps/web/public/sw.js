/* Minimal service worker: keeps the app installable without caching Next.js
 * build assets. Older versions cached /_next/static files cache-first, which
 * could leave a browser with an unstyled shell after a deployment. */
const LEGACY_CACHE_PREFIX = 'peoplehub-';

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith(LEGACY_CACHE_PREFIX)).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

// No fetch handler: every page, script, and stylesheet is loaded from the
// network/browser HTTP cache managed by Next.js and nginx.
