import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';

import App from './App';
import './index.css';

// Initialize Sentry for error tracking and monitoring
Sentry.init({
  dsn: 'https://3f930a475eb29d63b5e78b1ebabaef78@o4509716458045440.ingest.de.sentry.io/4510301517316176',
  // Setting this option to true will send default PII data to Sentry
  // For example, automatic IP address collection on events
  sendDefaultPii: true,
  // Set traces_sample_rate to 1.0 to capture 100% of transactions for performance monitoring
  tracePropagationTargets: ['localhost', /^https:\/\/materialshub\.gr/, /^https:\/\/.*\.materialshub\.gr/],
  tracesSampleRate: 1.0,
  // Set profiles_sample_rate to 1.0 to profile 100% of sampled transactions
  profilesSampleRate: 1.0,
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

    // Capture HTTP client errors (fetch, XHR)
    Sentry.httpClientIntegration({
      failedRequestStatusCodes: [[400, 599]], // Capture 4xx and 5xx errors
    }),
  ],

  // Environment tracking
  environment: import.meta.env.MODE,

  // Automatically capture unhandled errors and promise rejections
  beforeSend(event, hint) {
    // Log errors to console in development
    if (import.meta.env.MODE === 'development' && event.exception) {
      console.error('Error captured by Sentry:', hint.originalException || hint.syntheticException);
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
