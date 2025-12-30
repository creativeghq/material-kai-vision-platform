/**
 * Centralized Logging Service
 *
 * Provides structured logging with environment-aware behavior:
 * - Development: Logs to console
 * - Production: Can be extended to send to monitoring services (Sentry, LogRocket, etc.)
 *
 * @example
 * ```typescript
 * import { logger } from '@/services/logger.service';
 * 
 * logger.info('User logged in', { userId: '123' });
 * logger.error('Failed to fetch data', error, { endpoint: '/api/data' });
 * logger.debug('Processing item', { itemId: 'abc' });
 * ```
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogMetadata {
  [key: string]: unknown;
  service?: string;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  error?: Error;
  service?: string;
}

export interface LoggerConfig {
  minLevel?: LogLevel;
  enableConsole?: boolean;
  enableRemote?: boolean;
  serviceName?: string;
  bufferSize?: number;
}

class LoggerService {
  private isProduction: boolean;
  private isDevelopment: boolean;
  private logBuffer: LogEntry[] = [];
  private maxBufferSize: number = 100;
  private config: LoggerConfig;

  constructor() {
    // Check both Vite and Node.js environment indicators
    this.isProduction = import.meta.env?.PROD || process.env.NODE_ENV === 'production';
    this.isDevelopment = import.meta.env?.DEV || process.env.NODE_ENV === 'development';
    
    // Default configuration
    this.config = {
      minLevel: this.isDevelopment ? LogLevel.DEBUG : LogLevel.INFO,
      enableConsole: true,
      enableRemote: this.isProduction,
      serviceName: 'MaterialKAI',
      bufferSize: 100,
    };
    
    this.maxBufferSize = this.config.bufferSize || 100;
  }

  /**
   * Update logger configuration
   */
  configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
    if (config.bufferSize) {
      this.maxBufferSize = config.bufferSize;
      this.trimBuffer();
    }
  }

  /**
   * Get recent logs from buffer
   */
  getRecentLogs(count?: number): LogEntry[] {
    const limit = count || this.logBuffer.length;
    return this.logBuffer.slice(-limit).reverse();
  }

  /**
   * Clear log buffer
   */
  clearBuffer(): void {
    this.logBuffer = [];
  }

  /**
   * Clear all logs (alias for clearBuffer)
   */
  clearAllLogs(): void {
    this.clearBuffer();
  }

  /**
   * Clear logs older than a specific timestamp
   */
  clearOldLogs(timestampMs: number): void {
    this.logBuffer = this.logBuffer.filter(log => {
      const logTime = new Date(log.timestamp).getTime();
      return logTime >= timestampMs;
    });
  }

  /**
   * Get buffer size
   */
  getBufferSize(): number {
    return this.logBuffer.length;
  }

  /**
   * Trim buffer to max size
   */
  private trimBuffer(): void {
    if (this.logBuffer.length > this.maxBufferSize) {
      this.logBuffer = this.logBuffer.slice(-this.maxBufferSize);
    }
  }

  /**
   * Add log entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    this.logBuffer.push(entry);
    this.trimBuffer();
  }

  /**
   * Log informational messages
   */
  info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, undefined, metadata);
  }

  /**
   * Log warning messages
   */
  warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, undefined, metadata);
  }

  /**
   * Log error messages
   */
  error(message: string, error?: Error | unknown, metadata?: LogMetadata): void {
    const errorObj = error instanceof Error ? error : undefined;
    const errorMetadata = error instanceof Error ? undefined : (error as LogMetadata);

    this.log(LogLevel.ERROR, message, errorObj, {
      ...metadata,
      ...errorMetadata,
    });
  }

  /**
   * Log debug messages (only in development)
   */
  debug(message: string, metadata?: LogMetadata): void {
    if (this.isDevelopment) {
      this.log(LogLevel.DEBUG, message, undefined, metadata);
    }
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    error?: Error,
    metadata?: LogMetadata,
  ): void {
    // Check minimum log level
    if (level < (this.config.minLevel || LogLevel.DEBUG)) {
      return;
    }

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      metadata,
      error,
      service: this.config.serviceName,
    };

    // Add to buffer
    this.addToBuffer(entry);

    // In development, log to console with formatting
    if (this.isDevelopment && this.config.enableConsole) {
      this.logToConsole(entry);
    }

    // In production, you can extend this to send to monitoring services
    if (this.isProduction && this.config.enableRemote) {
      this.logToMonitoringService(entry);
    }
  }

  /**
   * Get log level name
   */
  private getLevelName(level: LogLevel): string {
    switch (level) {
      case LogLevel.DEBUG:
        return 'DEBUG';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.WARN:
        return 'WARN';
      case LogLevel.ERROR:
        return 'ERROR';
      default:
        return 'UNKNOWN';
    }
  }

  /**
   * Log to console with appropriate formatting
   */
  private logToConsole(entry: LogEntry): void {
    const prefix = `[${entry.timestamp}] [${this.getLevelName(entry.level)}]`;

    switch (entry.level) {
      case LogLevel.DEBUG:
        console.debug(prefix, entry.message, entry.metadata || '');
        break;
      case LogLevel.INFO:
        console.info(prefix, entry.message, entry.metadata || '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, entry.message, entry.metadata || '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, entry.message, entry.error || '', entry.metadata || '');
        if (entry.error?.stack) {
          console.error('Stack trace:', entry.error.stack);
        }
        break;
    }
  }

  /**
   * Send logs to monitoring service in production
   * Sends to both Sentry and backend database
   */
  private logToMonitoringService(entry: LogEntry): void {
    // Only log errors and warnings in production to reduce noise
    if (entry.level === LogLevel.ERROR || entry.level === LogLevel.WARN) {
      // Send to Sentry
      this.sendToSentry(entry);

      // Send to backend database
      this.sendToBackend(entry);
    }
  }

  /**
   * Send log entry to Sentry
   */
  private sendToSentry(entry: LogEntry): void {
    try {
      // Dynamically import Sentry to avoid bundling if not used
      import('@sentry/react').then((Sentry) => {
        if (entry.error) {
          Sentry.captureException(entry.error, {
            level: this.mapLogLevelToSentry(entry.level),
            tags: {
              source: 'frontend',
              service: entry.service || 'unknown',
            },
            extra: entry.metadata,
          });
        } else {
          Sentry.captureMessage(entry.message, {
            level: this.mapLogLevelToSentry(entry.level),
            tags: {
              source: 'frontend',
              service: entry.service || 'unknown',
            },
            extra: entry.metadata,
          });
        }
      }).catch(() => {
        // Sentry not available, silently fail
      });
    } catch (error) {
      // Don't let logging errors break the app
    }
  }

  /**
   * Send log entry to backend database
   */
  private sendToBackend(entry: LogEntry): void {
    try {
      const logData = {
        level: this.mapLogLevelToBackend(entry.level),
        message: entry.message,
        logger_name: entry.service || 'frontend',
        context: {
          ...entry.metadata,
          timestamp: entry.timestamp,
          environment: import.meta.env.MODE,
          error: entry.error ? {
            name: entry.error.name,
            message: entry.error.message,
            stack: entry.error.stack,
          } : undefined,
        },
        url: typeof window !== 'undefined' ? window.location.href : undefined,
        user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      // Send to backend (non-blocking)
      fetch('/api/admin/logs/frontend', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(logData),
        keepalive: true,
      }).catch(() => {
        // Silently fail - don't want logging to break the app
      });
    } catch (error) {
      // Don't let logging errors break the app
    }
  }

  /**
   * Map LogLevel enum to Sentry severity level
   */
  private mapLogLevelToSentry(level: LogLevel): 'error' | 'warning' | 'info' | 'debug' {
    switch (level) {
      case LogLevel.ERROR:
        return 'error';
      case LogLevel.WARN:
        return 'warning';
      case LogLevel.INFO:
        return 'info';
      case LogLevel.DEBUG:
        return 'debug';
      default:
        return 'info';
    }
  }

  /**
   * Map LogLevel enum to backend log level string
   */
  private mapLogLevelToBackend(level: LogLevel): string {
    switch (level) {
      case LogLevel.ERROR:
        return 'ERROR';
      case LogLevel.WARN:
        return 'WARNING';
      case LogLevel.INFO:
        return 'INFO';
      case LogLevel.DEBUG:
        return 'DEBUG';
      default:
        return 'INFO';
    }
  }

  /**
   * Create a scoped logger for a specific module/service
   */
  createLogger(scope: string) {
    return {
      info: (message: string, metadata?: LogMetadata) =>
        this.info(`[${scope}] ${message}`, { ...metadata, service: scope }),
      warn: (message: string, metadata?: LogMetadata) =>
        this.warn(`[${scope}] ${message}`, { ...metadata, service: scope }),
      error: (message: string, error?: Error | unknown, metadata?: LogMetadata) =>
        this.error(`[${scope}] ${message}`, error, { ...metadata, service: scope }),
      debug: (message: string, metadata?: LogMetadata) =>
        this.debug(`[${scope}] ${message}`, { ...metadata, service: scope }),
    };
  }
}

// Export singleton instance
export const logger = new LoggerService();

// Helper function to create scoped loggers
export const createLogger = (scope: string) => logger.createLogger(scope);

// Export type for scoped loggers
export type ScopedLogger = ReturnType<typeof logger.createLogger>;
