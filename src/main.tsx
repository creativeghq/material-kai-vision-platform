import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

import App from './App';
import './index.css';
import { initializeGlobalErrorHandlers } from './utils/globalErrorHandler';

// Initialize global error handlers (sends errors to backend database)
initializeGlobalErrorHandlers();

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
  integrations: [
    // Browser performance tracking
    Sentry.browserTracingIntegration(),

    // Session replay - records user sessions when errors occur
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),

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

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
