/**
 * Global Error Handler
 *
 * Captures unhandled errors and promise rejections and sends them to:
 * 1. Backend database (for unified logging)
 * 2. Sentry (for advanced error tracking)
 */

import { logger } from '@/services/logger.service';

/**
 * Initialize global error handlers
 */
export function initializeGlobalErrorHandlers(): void {
  if (typeof window === 'undefined') return;

  // Handle unhandled errors
  window.addEventListener('error', (event: ErrorEvent) => {
    const { message, filename, lineno, colno, error } = event;

    // Log using existing logger (will send to both Sentry and database)
    logger.error(
      message || 'Unhandled error',
      error || new Error(message),
      {
        type: 'unhandled_error',
        filename,
        lineno,
        colno,
        service: 'window.onerror',
      },
    );
  });

  // Handle unhandled promise rejections
  window.addEventListener('unhandledrejection', (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message = reason?.message || reason?.toString() || 'Unhandled promise rejection';

    // Log using existing logger (will send to both Sentry and database)
    logger.error(
      message,
      reason instanceof Error ? reason : new Error(message),
      {
        type: 'unhandled_promise_rejection',
        reason: typeof reason === 'object' ? JSON.stringify(reason) : reason,
        service: 'unhandledrejection',
      },
    );
  });

  // Handle console.error calls (optional - can be noisy)
  const originalConsoleError = console.error;
  console.error = (...args: any[]) => {
    // Call original console.error
    originalConsoleError.apply(console, args);

    // Only log actual errors, not warnings or info
    const firstArg = args[0];
    if (firstArg instanceof Error) {
      logger.error(
        firstArg.message,
        firstArg,
        {
          type: 'console_error',
          args: args.slice(1).map(arg =>
            typeof arg === 'object' ? JSON.stringify(arg) : String(arg),
          ),
          service: 'console.error',
        },
      );
    }
  };

  console.log('✅ Global error handlers initialized');
}

/**
 * Manually log an error with context
 */
export function logError(
  error: Error | string,
  context?: Record<string, any>,
  serviceName = 'frontend',
): void {
  const message = typeof error === 'string' ? error : error.message;
  const errorObj = typeof error === 'string' ? new Error(error) : error;

  // Log using existing logger (will send to both Sentry and database)
  logger.error(message, errorObj, {
    ...context,
    service: serviceName,
  });
}

/**
 * Log a warning
 */
export function logWarning(
  message: string,
  context?: Record<string, any>,
  serviceName = 'frontend',
): void {
  // Log using existing logger (will send to both Sentry and database)
  logger.warn(message, {
    ...context,
    service: serviceName,
  });
}

