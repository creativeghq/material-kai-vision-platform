import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Drop-in replacement for React.lazy that survives stale-deploy chunk failures.
 *
 * After a frontend deploy, a client still running the previous build holds an
 * `index.html` that references old chunk filenames. When it navigates to a lazy
 * route, the dynamic `import()` either rejects (chunk 404 — "Failed to fetch
 * dynamically imported module") or resolves to `undefined`, and the
 * `.then(m => ({ default: m.X }))` mapper throws `Cannot read properties of
 * undefined (reading 'X')`. Either way the route white-screens.
 *
 * This wrapper catches that failure and forces a SINGLE full reload to pull the
 * fresh `index.html` (and therefore the new chunk URLs). A sessionStorage guard
 * prevents reload loops — if the import still fails after one reload (a genuinely
 * broken chunk, not a stale one), we rethrow so the error boundary can show.
 */
const RELOAD_GUARD_KEY = 'lazyWithRetry:reloaded';

export function lazyWithRetry<T extends ComponentType<any>>(
  factory: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      const mod = await factory();
      // A stale/partial chunk can RESOLVE (not reject) to `undefined` or an object
      // with no `default` — React then reads `.default` off it and white-screens
      // ("Cannot read properties of undefined (reading 'default')"). Treat that as a
      // load failure so the reload path below runs instead.
      if (!mod || typeof mod.default === 'undefined') {
        throw new Error('lazyWithRetry: module resolved without a default export');
      }
      // Success — clear the guard so a future stale deploy can reload again.
      try { window.sessionStorage.removeItem(RELOAD_GUARD_KEY); } catch { /* ignore */ }
      return mod;
    } catch (err) {
      let alreadyReloaded = false;
      try { alreadyReloaded = window.sessionStorage.getItem(RELOAD_GUARD_KEY) === '1'; } catch { /* ignore */ }

      if (!alreadyReloaded) {
        try { window.sessionStorage.setItem(RELOAD_GUARD_KEY, '1'); } catch { /* ignore */ }
        window.location.reload();
        // Keep the Suspense fallback up while the reload happens.
        return new Promise<{ default: T }>(() => { /* never resolves */ });
      }
      throw err;
    }
  });
}

export default lazyWithRetry;
