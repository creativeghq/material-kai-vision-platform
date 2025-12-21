/**
 * Sentry Integration for Edge Functions
 * 
 * Provides error tracking and monitoring for Supabase Edge Functions
 */

// Sentry DSN for Edge Functions (same project as frontend)
const SENTRY_DSN = 'https://3f930a475eb29d63b5e78b1ebabaef78@o4509716458045440.ingest.de.sentry.io/4510301517316176';

interface SentryEvent {
  message?: string;
  exception?: Error;
  level: 'error' | 'warning' | 'info' | 'debug';
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  fingerprint?: string[];
}

/**
 * Send error to Sentry
 */
export async function captureException(
  error: Error,
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    fingerprint?: string[];
  }
): Promise<void> {
  try {
    const event: SentryEvent = {
      exception: error,
      level: 'error',
      tags: {
        environment: Deno.env.get('ENVIRONMENT') || 'production',
        function_name: Deno.env.get('FUNCTION_NAME') || 'unknown',
        ...context?.tags,
      },
      extra: {
        timestamp: new Date().toISOString(),
        ...context?.extra,
      },
      fingerprint: context?.fingerprint,
    };

    await sendToSentry(event);
  } catch (e) {
    console.error('Failed to send error to Sentry:', e);
  }
}

/**
 * Send message to Sentry
 */
export async function captureMessage(
  message: string,
  level: 'error' | 'warning' | 'info' | 'debug' = 'info',
  context?: {
    tags?: Record<string, string>;
    extra?: Record<string, any>;
    fingerprint?: string[];
  }
): Promise<void> {
  try {
    const event: SentryEvent = {
      message,
      level,
      tags: {
        environment: Deno.env.get('ENVIRONMENT') || 'production',
        function_name: Deno.env.get('FUNCTION_NAME') || 'unknown',
        ...context?.tags,
      },
      extra: {
        timestamp: new Date().toISOString(),
        ...context?.extra,
      },
      fingerprint: context?.fingerprint,
    };

    await sendToSentry(event);
  } catch (e) {
    console.error('Failed to send message to Sentry:', e);
  }
}

/**
 * Send event to Sentry API
 */
async function sendToSentry(event: SentryEvent): Promise<void> {
  if (!SENTRY_DSN) {
    console.warn('Sentry DSN not configured - skipping error reporting');
    return;
  }

  // Parse DSN to get project ID and public key
  const dsnMatch = SENTRY_DSN.match(/https:\/\/([^@]+)@([^/]+)\/(\d+)/);
  if (!dsnMatch) {
    console.error('Invalid Sentry DSN format');
    return;
  }

  const [, publicKey, host, projectId] = dsnMatch;
  const sentryUrl = `https://${host}/api/${projectId}/store/`;

  // Build Sentry event payload
  const payload = {
    event_id: crypto.randomUUID().replace(/-/g, ''),
    timestamp: Math.floor(Date.now() / 1000),
    platform: 'javascript',
    sdk: {
      name: 'sentry.javascript.deno',
      version: '1.0.0',
    },
    environment: event.tags?.environment || 'production',
    tags: event.tags || {},
    extra: event.extra || {},
    fingerprint: event.fingerprint || ['{{ default }}'],
    level: event.level,
    ...(event.message && { message: event.message }),
    ...(event.exception && {
      exception: {
        values: [
          {
            type: event.exception.name,
            value: event.exception.message,
            stacktrace: {
              frames: parseStackTrace(event.exception.stack || ''),
            },
          },
        ],
      },
    }),
  };

  // Send to Sentry
  const response = await fetch(sentryUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Sentry-Auth': `Sentry sentry_version=7, sentry_key=${publicKey}, sentry_client=sentry.javascript.deno/1.0.0`,
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    console.error('Failed to send event to Sentry:', await response.text());
  }
}

/**
 * Parse stack trace into Sentry format
 */
function parseStackTrace(stack: string): any[] {
  const lines = stack.split('\n').slice(1); // Skip first line (error message)
  return lines.map((line) => {
    const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
    if (match) {
      return {
        function: match[1],
        filename: match[2],
        lineno: parseInt(match[3]),
        colno: parseInt(match[4]),
      };
    }
    return { function: line.trim() };
  });
}

