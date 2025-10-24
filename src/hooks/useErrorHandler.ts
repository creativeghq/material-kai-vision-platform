/**
 * Error Handler Hook
 *
 * Provides error handling utilities for functional components
 * that can't use error boundaries directly.
 */

import { useCallback, useState, useEffect } from 'react';

import { useToast } from '@/hooks/use-toast';

export interface ErrorInfo {
  message: string;
  stack?: string;
  component?: string;
  action?: string;
  timestamp: string;
  errorId: string;
}

export interface UseErrorHandlerOptions {
  showToast?: boolean;
  logToConsole?: boolean;
  reportToService?: boolean;
  component?: string;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}) {
  const {
    showToast = true,
    logToConsole = true,
    reportToService = true,
    component = 'Unknown Component',
  } = options;

  const { toast } = useToast();
  const [lastError, setLastError] = useState<ErrorInfo | null>(null);

  const reportError = useCallback((errorInfo: ErrorInfo) => {
    if (reportToService) {
      // In a real app, send this to your error tracking service
      console.error('Error Report:', errorInfo);

      // Example: Send to Sentry, LogRocket, or custom endpoint
      // Sentry.captureException(new Error(errorInfo.message), { extra: errorInfo });
    }
  }, [reportToService]);

  const handleError = useCallback((
    error: Error | string,
    action?: string,
    additionalInfo?: Record<string, unknown>,
  ) => {
    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    const errorInfo: ErrorInfo = {
      message: errorMessage,
      stack: errorStack,
      component,
      action,
      timestamp: new Date().toISOString(),
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      ...additionalInfo,
    };

    setLastError(errorInfo);

    if (logToConsole) {
      console.error(`[${component}] Error:`, errorInfo);
    }

    if (showToast) {
      toast({
        title: 'An error occurred',
        description: errorMessage,
        variant: 'destructive',
      });
    }

    reportError(errorInfo);

    return errorInfo;
  }, [component, logToConsole, showToast, toast, reportError]);

  const handleAsyncError = useCallback(async <T>(
    asyncFn: () => Promise<T>,
    action?: string,
    fallbackValue?: T,
  ): Promise<T | undefined> => {
    try {
      return await asyncFn();
    } catch (error) {
      handleError(error as Error, action);
      return fallbackValue;
    }
  }, [handleError]);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const wrapFunction = useCallback(<T extends (...args: unknown[]) => any>(
    fn: T,
    action?: string,
  ): T => {
    return ((...args: Parameters<T>) => {
      try {
        const result = fn(...args);

        // Handle async functions
        if (result && typeof result.then === 'function') {
          return result.catch((error: Error) => {
            handleError(error, action);
            throw error; // Re-throw to maintain promise chain
          });
        }

        return result;
      } catch (error) {
        handleError(error as Error, action);
        throw error; // Re-throw to maintain normal error flow
      }
    }) as T;
  }, [handleError]);

  return {
    handleError,
    handleAsyncError,
    clearError,
    wrapFunction,
    lastError,
  };
}

// Specialized hooks for common use cases
export function useApiErrorHandler(apiName?: string) {
  return useErrorHandler({
    component: `API: ${apiName || 'Unknown'}`,
    showToast: true,
    logToConsole: true,
    reportToService: true,
  });
}

export function useComponentErrorHandler(componentName: string) {
  return useErrorHandler({
    component: componentName,
    showToast: false, // Components usually handle their own UI feedback
    logToConsole: true,
    reportToService: true,
  });
}

export function useFormErrorHandler(formName?: string) {
  return useErrorHandler({
    component: `Form: ${formName || 'Unknown'}`,
    showToast: true,
    logToConsole: true,
    reportToService: false, // Form errors are usually user errors, not system errors
  });
}

// Error boundary hook for catching unhandled promise rejections
export function useGlobalErrorHandler() {
  const { handleError } = useErrorHandler({
    component: 'Global Error Handler',
    showToast: true,
    logToConsole: true,
    reportToService: true,
  });

  // Set up global error handlers
  useEffect(() => {
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      handleError(
        new Error(event.reason?.message || 'Unhandled Promise Rejection'),
        'Unhandled Promise Rejection',
        { reason: event.reason },
      );
    };

    const handleGlobalError = (event: ErrorEvent) => {
      handleError(
        new Error(event.message),
        'Global Error',
        {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      );
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleGlobalError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleGlobalError);
    };
  }, [handleError]);

  return { handleError };
}

export default useErrorHandler;
