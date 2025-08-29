/**
 * Centralized Error Logging System
 * Provides structured logging with correlation tracking and context preservation
 */

import { AppError, ErrorSeverity, ErrorCategory } from './AppError';

export interface LogEntry {
  timestamp: string;
  level: 'error' | 'warn' | 'info' | 'debug';
  correlationId: string;
  service: string;
  operation: string;
  message: string;
  metadata?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
    code?: string;
    category?: ErrorCategory;
    severity?: ErrorSeverity;
  };
}

/**
 * Centralized error logger with structured output and correlation tracking
 */
export class ErrorLogger {
  private static instance: ErrorLogger;
  private logs: LogEntry[] = [];
  private maxLogs = 1000; // Keep last 1000 log entries in memory

  private constructor() {}

  public static getInstance(): ErrorLogger {
    if (!ErrorLogger.instance) {
      ErrorLogger.instance = new ErrorLogger();
    }
    return ErrorLogger.instance;
  }

  /**
   * Log an error with full context
   */
  public logError(error: AppError | Error, context?: Record<string, unknown>): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'error',
      correlationId: error instanceof AppError ? error.correlationId : this.generateCorrelationId(),
      service: error instanceof AppError ? error.context.service : 'unknown',
      operation: error instanceof AppError ? error.context.operation : 'unknown',
      message: error.message,
      metadata: context || undefined,
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack || undefined,
        ...(error instanceof AppError && {
          code: error.code,
          category: error.category,
          severity: error.severity,
        }),
      },
    };

    this.addLogEntry(entry);
    this.outputToConsole(entry);
  }

  /**
   * Log a warning with context
   */
  public logWarning(message: string, context: { service: string; operation: string; metadata?: Record<string, unknown> }): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'warn',
      correlationId: this.generateCorrelationId(),
      service: context.service,
      operation: context.operation,
      message,
      metadata: context.metadata || undefined,
    };

    this.addLogEntry(entry);
    this.outputToConsole(entry);
  }

  /**
   * Log an info message with context
   */
  public logInfo(message: string, context: { service: string; operation: string; metadata?: Record<string, unknown> }): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      correlationId: this.generateCorrelationId(),
      service: context.service,
      operation: context.operation,
      message,
      metadata: context.metadata || undefined,
    };

    this.addLogEntry(entry);
    this.outputToConsole(entry);
  }

  /**
   * Log a debug message with context
   */
  public logDebug(message: string, context: { service: string; operation: string; metadata?: Record<string, unknown> }): void {
    // Only log debug messages in development
    if (process.env.NODE_ENV === 'development') {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'debug',
        correlationId: this.generateCorrelationId(),
        service: context.service,
        operation: context.operation,
        message,
        metadata: context.metadata || undefined,
      };

      this.addLogEntry(entry);
      this.outputToConsole(entry);
    }
  }

  /**
   * Get recent logs for debugging
   */
  public getRecentLogs(count = 50): LogEntry[] {
    return this.logs.slice(-count);
  }

  /**
   * Get logs by correlation ID for tracing
   */
  public getLogsByCorrelationId(correlationId: string): LogEntry[] {
    return this.logs.filter(log => log.correlationId === correlationId);
  }

  /**
   * Get logs by service for service-specific debugging
   */
  public getLogsByService(service: string): LogEntry[] {
    return this.logs.filter(log => log.service === service);
  }

  /**
   * Clear all logs (useful for testing)
   */
  public clearLogs(): void {
    this.logs = [];
  }

  /**
   * Export logs for external analysis
   */
  public exportLogs(): LogEntry[] {
    return [...this.logs];
  }

  private addLogEntry(entry: LogEntry): void {
    this.logs.push(entry);

    // Keep only the most recent logs to prevent memory issues
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }
  }

  private outputToConsole(entry: LogEntry): void {
    const logMessage = `[${entry.timestamp}] [${entry.level.toUpperCase()}] [${entry.correlationId}] ${entry.service}:${entry.operation} - ${entry.message}`;

    switch (entry.level) {
      case 'error':
        console.error(logMessage, entry.error, entry.metadata);
        break;
      case 'warn':
        console.warn(logMessage, entry.metadata);
        break;
      case 'info':
        console.info(logMessage, entry.metadata);
        break;
      case 'debug':
        console.debug(logMessage, entry.metadata);
        break;
    }
  }

  private generateCorrelationId(): string {
    return `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export singleton instance for easy access
export const errorLogger = ErrorLogger.getInstance();
