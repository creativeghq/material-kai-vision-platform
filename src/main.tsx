import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

import App from './App';
import './index.css';
import { initializeGlobalErrorHandlers } from './utils/globalErrorHandler';

// Initialize global error handlers (sends errors to backend database)
initializeGlobalErrorHandlers();

// Auto-recover from stale chunk references. After a new deploy the hashed chunk
// filenames change; a browser still running the old index.html will 404 on a lazy
// import ("Failed to fetch dynamically imported module") and otherwise hit the
// critical error boundary. Reload once to pull the fresh index + chunks. The 15s
// guard prevents a reload loop if the failure is genuine (not a stale deploy).
window.addEventListener('vite:preloadError', (e) => {
  try {
    const last = Number(sessionStorage.getItem('mk-chunk-reload-at') || 0);
    if (Date.now() - last < 15000) return;
    sessionStorage.setItem('mk-chunk-reload-at', String(Date.now()));
    e.preventDefault();
    window.location.reload();
  } catch {
    window.location.reload();
  }
});

// Initialize Sentry for error tracking and monitoring
Sentry.init({
  dsn: 'https://3f930a475eb29d63b5e78b1ebabaef78@o4509716458045440.ingest.de.sentry.io/4510301517316176',
  // Setting this option to true will send default PII data to Sentry
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  tracePropagationTargets: ['localhost', /^https:\/\/materialshub\.gr/, /^https:\/\/.*\.materialshub\.gr/],
  // Production: sample 10% of transactions to reduce overhead (~50-100ms per page)
  // Development: keep 100% for full visibility
  tracesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
  profilesSampleRate: import.meta.env.MODE === 'production' ? 0.1 : 1.0,
  // Capture Replay for 10% of all sessions,
  // plus for 100% of sessions with an error
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  // Only the CHEAP integrations start eagerly. Browser tracing and session replay are the two
  // heavy ones and neither is needed to capture an error — they are added after first paint,
  // below. vendor-sentry was 135 KiB gzip / 406 KiB raw, the largest chunk in the initial payload
  // and bigger than React itself (59 KiB), loading on every page including anonymous ones
  // (/, /tools/*, /quote/:id, /storefront). See audit #308 finding 2.
  // The core error handler stays synchronous ON PURPOSE: errors thrown during initial render are
  // the hardest to reproduce and the most worth catching, so nothing that reports them is deferred.
  integrations: [
    // Automatically capture console.error() calls
    Sentry.captureConsoleIntegration({
      levels: ['error', 'assert'],
    }),

    // Capture HTTP client errors (fetch, XHR). 401/403/404/503 are
    // excluded — bad token / no permission / not found / upstream busy
    // are user-facing flows the UI handles with toasts, not bugs.
    Sentry.httpClientIntegration({
      failedRequestStatusCodes: [[400, 400], [402, 402], [405, 499], [500, 502], [504, 599]],
    }),
  ],

  // Environment tracking
  environment: import.meta.env.MODE,

  // Automatically capture unhandled errors and promise rejections
  beforeSend(event, hint) {
    const ex = (hint?.originalException ?? hint?.syntheticException) as
      | { name?: string; message?: string }
      | undefined;

    // Drop Supabase auth refresh-token noise. Happens whenever a session
    // expires; the SDK retries silently and the UI redirects to /login.
    // Not a bug, not actionable — just fills the dashboard.
    const message = ex?.message ?? event.message ?? '';
    if (
      ex?.name === 'AuthApiError' &&
      typeof message === 'string' &&
      /Refresh Token Not Found|Invalid Refresh Token/i.test(message)
    ) {
      return null;
    }

    // Log errors to console in development
    if (import.meta.env.MODE === 'development' && event.exception && ex) {
      console.debug('[Sentry] Error captured:', ex);
    }
    return event;
  },

  // Ignore certain errors that are not actionable
  ignoreErrors: [
    // Browser extensions
    'top.GLOBALS',
    'chrome-extension://',
    'moz-extension://',
    // Network errors that are expected
    'NetworkError',
    'Failed to fetch',
    // ResizeObserver errors (harmless)
    'ResizeObserver loop limit exceeded',
    'ResizeObserver loop completed with undelivered notifications',
    // Vite HMR transient errors (dev only, not actionable)
    /\[vite\] Failed to reload/,
    'Failed to fetch dynamically imported module',
    // Supabase auth refresh-token noise (session expired, SDK retries silently)
    'Invalid Refresh Token',
    'Refresh Token Not Found',
  ],
});

// Register the PWA service worker so the app is installable to the home screen
// (Chrome/Edge require an SW with a fetch handler to fire `beforeinstallprompt`).
// Production only — the dev server runs its own SW/HMR machinery and a stale
// pass-through worker just adds noise locally.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  // Auto-update: when a new deploy's service worker activates and claims the
  // page, reload once into the fresh build so mobile clients are never stuck on
  // a stale version. Guarded so it ONLY fires for a real update (the page was
  // already controlled by a worker) and never loops or reloads on first install.
  if (navigator.serviceWorker.controller) {
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  }
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
      // Non-fatal: install-to-home-screen is a progressive enhancement.
    });
  });
}

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);

/**
 * Attach the HEAVY Sentry integrations after first paint.
 *
 * Browser tracing and session replay are the two expensive parts of the SDK and neither is needed
 * to report an error — `Sentry.init` above already captures exceptions, unhandled rejections and
 * console.error from the first line of script. These two only add performance spans and session
 * recording, both of which are useless before anything has rendered.
 *
 * Deferred behind `requestIdleCallback` so it never competes with the initial render; the timeout
 * guarantees it still runs on a busy main thread, and the setTimeout fallback covers Safari, which
 * has no requestIdleCallback.
 *
 * NOTE ON BYTES: this defers WORK reliably. Whether it also moves bytes out of the initial chunk
 * depends on Rollup being able to split `@sentry/react` internally — measured after this change
 * rather than assumed. If the chunk did not shrink, the win is startup CPU, not payload.
 */
const attachHeavySentryIntegrations = () => {
  void import('@sentry/react')
    .then(({ browserTracingIntegration, replayIntegration, addIntegration }) => {
      addIntegration(browserTracingIntegration());
      addIntegration(replayIntegration({ maskAllText: false, blockAllMedia: false }));
    })
    .catch(() => {
      // Non-fatal: tracing and replay are diagnostics. Error reporting is already live and
      // unaffected, so a failure here must never surface to the user.
    });
};

if (typeof window.requestIdleCallback === 'function') {
  window.requestIdleCallback(attachHeavySentryIntegrations, { timeout: 5000 });
} else {
  window.setTimeout(attachHeavySentryIntegrations, 2000);
}
