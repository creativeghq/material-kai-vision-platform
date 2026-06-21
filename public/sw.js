/*
 * Minimal service worker for MaterialsHub.
 *
 * Two jobs:
 *  1. Make the app installable — Chrome/Edge won't fire `beforeinstallprompt`
 *     (which powers the in-app "Install app" button) without a registered SW
 *     that has a fetch handler.
 *  2. Keep clients fresh — on activation it purges any HTTP/Cache-Storage
 *     entries a previous version might have left behind, then takes control.
 *
 * Deliberately a NO-OP at the network layer — the fetch listener never calls
 * `event.respondWith`, so every request falls through to the browser's normal
 * handling. Combined with the no-cache HTML + content-hashed chunks, that means
 * every deploy is fetched fresh; this worker never serves stale assets.
 *
 * Bump SW_VERSION on any change so browsers detect a new worker, re-activate,
 * clear caches, and (via the controllerchange handler in main.tsx) reload open
 * tabs into the new build.
 */
const SW_VERSION = '2026-06-21.1';

self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // Defensive: drop any Cache Storage a prior worker version created so no
      // stale asset can survive a deploy. (This worker doesn't populate caches.)
      try {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      } catch {
        /* caches API unavailable — nothing to clear */
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', () => {
  // Intentionally empty: required for installability, but pass-through.
});
