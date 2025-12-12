/**
 * Centralized Logging Service
 * 
 * Replaces direct console.* calls with a structured logging system
 * that can be configured, filtered, and routed to external monitoring services.
 * 
 * Usage:
 * import { logger } from '@/services/logger.service';
 * logger.info('User logged in', { userId: '123' });
 * logger.error('API call failed', error, { endpoint: '/api/users' });
 */

import { env } from '@/config/environment';

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogMetadata {
  [key: string]: unknown;
}

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  metadata?: LogMetadata;
  error?: Error;
  service?: string;
  userId?: string;
}

export interface LoggerConfig {
  minLevel: LogLevel;
  enableConsole: boolean;
  enableRemote: boolean;
  remoteEndpoint?: string;
  serviceName: string;
}

/**
 * Logger Class
 * Provides structured logging with multiple output targets
 */
class Logger {
  private config: LoggerConfig;
  private buffer: LogEntry[] = [];
  private readonly MAX_BUFFER_SIZE = 100;

  constructor(config?: Partial<LoggerConfig>) {
    this.config = {
      minLevel: env.isProduction ? LogLevel.INFO : LogLevel.DEBUG,
      enableConsole: env.features.enableLogging,
      enableRemote: env.isProduction && env.features.enableAnalytics,
      serviceName: 'MaterialKAI',
      ...config,
    };
  }

  /**
   * Update logger configuration
   */
  public configure(config: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Log debug message (development only)
   */
  public debug(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.DEBUG, message, metadata);
  }

  /**
   * Log info message
   */
  public info(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.INFO, message, metadata);
  }

  /**
   * Log warning message
   */
  public warn(message: string, metadata?: LogMetadata): void {
    this.log(LogLevel.WARN, message, metadata);
  }

  /**
   * Log error message
   */
  public error(message: string, error?: Error | unknown, metadata?: LogMetadata): void {
    const errorObj = error instanceof Error ? error : undefined;
    const combinedMetadata = {
      ...metadata,
      ...(error && !(error instanceof Error) ? { errorData: error } : {}),
    };

    this.log(LogLevel.ERROR, message, combinedMetadata, errorObj);
  }

  /**
   * Core logging method
   */
  private log(
    level: LogLevel,
    message: string,
    metadata?: LogMetadata,
    error?: Error
  ): void {
    // Check if log level meets minimum threshold
    if (level < this.config.minLevel) {
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

    // Output to console if enabled
    if (this.config.enableConsole) {
      this.consoleOutput(entry);
    }

    // Send to remote logging service if enabled
    if (this.config.enableRemote && level >= LogLevel.WARN) {
      this.remoteOutput(entry);
    }
  }

  /**
   * Output to console with appropriate formatting
   */
  private consoleOutput(entry: LogEntry): void {
    const { level, message, metadata, error } = entry;
    const prefix = `[${this.getLevelLabel(level)}] ${entry.timestamp}:`;

    switch (level) {
      case LogLevel.DEBUG:
        console.debug(prefix, message, metadata || '');
        break;
      case LogLevel.INFO:
        console.info(prefix, message, metadata || '');
        break;
      case LogLevel.WARN:
        console.warn(prefix, message, metadata || '');
        break;
      case LogLevel.ERROR:
        console.error(prefix, message, metadata || '', error || '');
        if (error?.stack) {
          console.error('Stack trace:', error.stack);
        }
        break;
    }
  }

  /**
   * Send log to remote monitoring service
   */
  private async remoteOutput(entry: LogEntry): Promise<void> {
    try {
      // Only send in production and if endpoint is configured
      if (!this.config.remoteEndpoint || !env.isProduction) {
        return;
      }

      // Serialize the log entry
      const payload = {
        ...entry,
        error: entry.error
          ? {
              message: entry.error.message,
              stack: entry.error.stack,
              name: entry.error.name,
            }
          : undefined,
      };

      // Send to remote endpoint (non-blocking)
      fetch(this.config.remoteEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }).catch((err) => {
        // Silently fail - don't break app if logging fails
        console.error('Failed to send log to remote service:', err);
      });
    } catch (err) {
      // Silently fail - logging shouldn't break the app
    }
  }

  /**
   * Add entry to buffer
   */
  private addToBuffer(entry: LogEntry): void {
    this.buffer.push(entry);
    
    // Keep buffer size under control
    if (this.buffer.length > this.MAX_BUFFER_SIZE) {
      this.buffer = this.buffer.slice(-this.MAX_BUFFER_SIZE);
    }
  }

  /**
   * Get human-readable label for log level
   */
  private getLevelLabel(level: LogLevel): string {
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
   * Get recent logs from buffer
   */
  public getRecentLogs(count = 50): LogEntry[] {
    return this.buffer.slice(-count);
  }

  /**
   * Clear log buffer
   */
  public clearBuffer(): void {
    this.buffer = [];
  }

  /**
   * Create a scoped logger for a specific service/component
   */
  public createScoped(serviceName: string): ScopedLogger {
    return new ScopedLogger(this, serviceName);
  }
}

/**
 * Scoped Logger
 * Automatically adds service context to all logs
 */
class ScopedLogger {
  constructor(
    private parent: Logger,
    private serviceName: string
  ) {}

  public debug(message: string, metadata?: LogMetadata): void {
    this.parent.debug(message, { ...metadata, service: this.serviceName });
  }

  public info(message: string, metadata?: LogMetadata): void {
    this.parent.info(message, { ...metadata, service: this.serviceName });
  }

  public warn(message: string, metadata?: LogMetadata): void {
    this.parent.warn(message, { ...metadata, service: this.serviceName });
  }

  public error(message: string, error?: Error | unknown, metadata?: LogMetadata): void {
    this.parent.error(message, error, { ...metadata, service: this.serviceName });
  }
}

/**
 * Singleton logger instance
 */
export const logger = new Logger();

/**
 * Export scoped logger creator
 */
export function createLogger(serviceName: string): ScopedLogger {
  return logger.createScoped(serviceName);
}

/**
 * Types are exported inline with their definitions above
 */
