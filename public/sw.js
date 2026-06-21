/*
 * Minimal service worker for MaterialsHub.
 *
 * Its only job is to make the app installable: Chrome/Edge will not fire the
 * `beforeinstallprompt` event (which powers the in-app "Install app" button)
 * unless a service worker with a fetch handler is registered.
 *
 * Deliberately a NO-OP at the network layer — the fetch listener never calls
 * `event.respondWith`, so every request falls through to the browser's normal
 * handling. That preserves the app's no-cache SPA behaviour (see the
 * Cache-Control meta tags in index.html); we are not turning this into an
 * offline-caching worker.
 */
self.addEventListener('install', () => {
  // Activate this worker immediately instead of waiting for old tabs to close.
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', () => {
  // Intentionally empty: required for installability, but pass-through.
});
