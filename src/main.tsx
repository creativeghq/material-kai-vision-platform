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
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration({
      maskAllText: false,
      blockAllMedia: false,
    }),
  ],
  // Environment tracking
  environment: import.meta.env.MODE,
});

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);
root.render(
  <StrictMode>
    <App />
  </StrictMode>,
);
