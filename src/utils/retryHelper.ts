/**
 * Retry Helper Utility
 *
 * Provides configurable retry logic with exponential backoff for handling
 * transient failures in external service calls.
 */

// Define error types that can be retried
interface RetryableError extends Error {
  code?: string;
  response?: {
    status: number;
  };
}

export interface RetryOptions {
  maxAttempts: number;
  delay: number;
  backoffMultiplier?: number;
  maxDelay?: number;
  retryCondition?: (error: unknown) => boolean;
}

export class RetryHelper {
  /**
   * Execute a function with retry logic and exponential backoff
   */
  static async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions,
  ): Promise<T> {
    const {
      maxAttempts,
      delay,
      backoffMultiplier = 2,
      maxDelay = 30000,
      retryCondition = RetryHelper.defaultRetryCondition,
    } = options;

    let lastError: unknown;
    let currentDelay = delay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;

        // Don't retry on the last attempt
        if (attempt === maxAttempts) {
          break;
        }

        // Check if we should retry this error
        if (!retryCondition(error)) {
          throw error;
        }

        // Wait before retrying
        await RetryHelper.sleep(currentDelay);

        // Increase delay for next attempt (exponential backoff)
        currentDelay = Math.min(currentDelay * backoffMultiplier, maxDelay);
      }
    }

    throw lastError;
  }

  /**
   * Default retry condition - retries on network errors and 5xx status codes
   */
  private static defaultRetryCondition(error: unknown): boolean {
    // Type guard to check if error has the expected properties
    const retryableError = error as RetryableError;

    // Network errors
    if (
      retryableError.code === 'ECONNRESET' ||
      retryableError.code === 'ENOTFOUND' ||
      retryableError.code === 'ECONNREFUSED' ||
      retryableError.code === 'ETIMEDOUT'
    ) {
      return true;
    }

    // HTTP 5xx errors
    if (retryableError.response && retryableError.response.status >= 500) {
      return true;
    }

    // HTTP 429 (Too Many Requests)
    if (retryableError.response && retryableError.response.status === 429) {
      return true;
    }

    return false;
  }

  /**
   * Sleep for the specified number of milliseconds
   */
  private static sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
