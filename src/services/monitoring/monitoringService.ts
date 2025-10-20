/**
 * Monitoring Service
 *
 * Centralized monitoring and error tracking service that can integrate
 * with various monitoring providers (Sentry, LogRocket, DataDog, etc.)
 */

export interface MonitoringConfig {
  enabled: boolean;
  environment: string;
  version: string;
  userId?: string;
  sessionId?: string;
  providers: {
    sentry?: {
      dsn: string;
      enabled: boolean;
    };
    logRocket?: {
      appId: string;
      enabled: boolean;
    };
    customEndpoint?: {
      url: string;
      apiKey: string;
      enabled: boolean;
    };
  };
}

export interface ErrorEvent {
  message: string;
  stack?: string;
  level: 'error' | 'warning' | 'info' | 'debug';
  tags?: Record<string, string>;
  extra?: Record<string, any>;
  user?: {
    id?: string;
    email?: string;
    username?: string;
  };
  timestamp: string;
  errorId: string;
  component?: string;
  action?: string;
  url: string;
  userAgent: string;
}

export interface PerformanceEvent {
  name: string;
  duration: number;
  startTime: number;
  endTime: number;
  tags?: Record<string, string>;
  metrics?: Record<string, number>;
  timestamp: string;
}

export interface UserEvent {
  action: string;
  category: string;
  label?: string;
  value?: number;
  properties?: Record<string, any>;
  timestamp: string;
}

class MonitoringService {
  private config: MonitoringConfig;
  private isInitialized = false;

  constructor() {
    this.config = {
      enabled: false,
      environment: 'development',
      version: '1.0.0',
      providers: {},
    };
  }

  /**
   * Initialize the monitoring service
   */
  public initialize(config: Partial<MonitoringConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };

    if (!this.config.enabled) {
      console.log('Monitoring service disabled');
      return;
    }

    // Initialize Sentry if configured
    if (this.config.providers.sentry?.enabled) {
      this.initializeSentry();
    }

    // Initialize LogRocket if configured
    if (this.config.providers.logRocket?.enabled) {
      this.initializeLogRocket();
    }

    // Set up global error handlers
    this.setupGlobalErrorHandlers();

    // Set up performance monitoring
    this.setupPerformanceMonitoring();

    this.isInitialized = true;
    console.log('Monitoring service initialized', {
      environment: this.config.environment,
      version: this.config.version,
    });
  }

  /**
   * Initialize Sentry (placeholder - would use real Sentry SDK)
   */
  private initializeSentry(): void {
    console.log('Sentry monitoring initialized (placeholder)');
    // In a real implementation:
    // import * as Sentry from '@sentry/react';
    // Sentry.init({
    //   dsn: this.config.providers.sentry!.dsn,
    //   environment: this.config.environment,
    //   release: this.config.version,
    // });
  }

  /**
   * Initialize LogRocket (placeholder - would use real LogRocket SDK)
   */
  private initializeLogRocket(): void {
    console.log('LogRocket monitoring initialized (placeholder)');
    // In a real implementation:
    // import LogRocket from 'logrocket';
    // LogRocket.init(this.config.providers.logRocket!.appId);
  }

  /**
   * Set up global error handlers
   */
  private setupGlobalErrorHandlers(): void {
    // Unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.captureError(new Error(event.reason?.message || 'Unhandled Promise Rejection'), {
        level: 'error',
        tags: { type: 'unhandled_rejection' },
        extra: { reason: event.reason },
      });
    });

    // Global JavaScript errors
    window.addEventListener('error', (event) => {
      this.captureError(new Error(event.message), {
        level: 'error',
        tags: { type: 'global_error' },
        extra: {
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
        },
      });
    });
  }

  /**
   * Set up performance monitoring
   */
  private setupPerformanceMonitoring(): void {
    // Monitor page load performance
    if ('performance' in window && 'getEntriesByType' in performance) {
      window.addEventListener('load', () => {
        setTimeout(() => {
          const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
          if (navigation) {
            this.capturePerformance({
              name: 'page_load',
              duration: navigation.loadEventEnd - navigation.fetchStart,
              startTime: navigation.fetchStart,
              endTime: navigation.loadEventEnd,
              metrics: {
                domContentLoaded: navigation.domContentLoadedEventEnd - navigation.fetchStart,
                firstPaint: this.getFirstPaint(),
                firstContentfulPaint: this.getFirstContentfulPaint(),
              },
            });
          }
        }, 0);
      });
    }
  }

  /**
   * Get First Paint timing
   */
  private getFirstPaint(): number {
    const paintEntries = performance.getEntriesByType('paint');
    const firstPaint = paintEntries.find(entry => entry.name === 'first-paint');
    return firstPaint ? firstPaint.startTime : 0;
  }

  /**
   * Get First Contentful Paint timing
   */
  private getFirstContentfulPaint(): number {
    const paintEntries = performance.getEntriesByType('paint');
    const firstContentfulPaint = paintEntries.find(entry => entry.name === 'first-contentful-paint');
    return firstContentfulPaint ? firstContentfulPaint.startTime : 0;
  }

  /**
   * Capture an error
   */
  public captureError(
    error: Error | string,
    options: Partial<Omit<ErrorEvent, 'message' | 'timestamp' | 'errorId' | 'url' | 'userAgent'>> = {},
  ): string {
    if (!this.config.enabled) return '';

    const errorMessage = typeof error === 'string' ? error : error.message;
    const errorStack = typeof error === 'string' ? undefined : error.stack;

    const errorEvent: ErrorEvent = {
      message: errorMessage,
      stack: errorStack,
      level: options.level || 'error',
      tags: options.tags || {},
      extra: options.extra || {},
      user: options.user,
      timestamp: new Date().toISOString(),
      errorId: `error_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      component: options.component,
      action: options.action,
      url: window.location.href,
      userAgent: navigator.userAgent,
    };

    // Send to configured providers
    this.sendToProviders('error', errorEvent);

    return errorEvent.errorId;
  }

  /**
   * Capture a performance event
   */
  public capturePerformance(event: Omit<PerformanceEvent, 'timestamp'>): void {
    if (!this.config.enabled) return;

    const performanceEvent: PerformanceEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.sendToProviders('performance', performanceEvent);
  }

  /**
   * Capture a user event
   */
  public captureUserEvent(event: Omit<UserEvent, 'timestamp'>): void {
    if (!this.config.enabled) return;

    const userEvent: UserEvent = {
      ...event,
      timestamp: new Date().toISOString(),
    };

    this.sendToProviders('user', userEvent);
  }

  /**
   * Set user context
   */
  public setUser(user: { id?: string; email?: string; username?: string }): void {
    this.config.userId = user.id;

    // Update user context in providers
    console.log('User context updated:', user);
  }

  /**
   * Add breadcrumb
   */
  public addBreadcrumb(message: string, category: string, level: 'info' | 'warning' | 'error' = 'info'): void {
    if (!this.config.enabled) return;

    console.log(`[${level.toUpperCase()}] ${category}: ${message}`);

    // In a real implementation, this would add breadcrumbs to Sentry/LogRocket
  }

  /**
   * Send events to configured providers
   */
  private sendToProviders(type: 'error' | 'performance' | 'user', event: any): void {
    // Console logging for development
    if (this.config.environment === 'development') {
      console.log(`[Monitoring] ${type}:`, event);
    }

    // Send to custom endpoint if configured
    if (this.config.providers.customEndpoint?.enabled) {
      this.sendToCustomEndpoint(type, event);
    }

    // Send to Sentry (placeholder)
    if (this.config.providers.sentry?.enabled) {
      console.log(`[Sentry] ${type}:`, event);
      // In real implementation: Sentry.captureException(event);
    }

    // Send to LogRocket (placeholder)
    if (this.config.providers.logRocket?.enabled) {
      console.log(`[LogRocket] ${type}:`, event);
      // In real implementation: LogRocket.captureException(event);
    }
  }

  /**
   * Send to custom monitoring endpoint
   */
  private async sendToCustomEndpoint(type: string, event: any): Promise<void> {
    const endpoint = this.config.providers.customEndpoint;
    if (!endpoint) return;

    try {
      await fetch(endpoint.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${endpoint.apiKey}`,
        },
        body: JSON.stringify({
          type,
          event,
          environment: this.config.environment,
          version: this.config.version,
          sessionId: this.config.sessionId,
        }),
      });
    } catch (error) {
      console.error('Failed to send monitoring data:', error);
    }
  }

  /**
   * Create a performance timer
   */
  public startTimer(name: string): () => void {
    const startTime = performance.now();

    return () => {
      const endTime = performance.now();
      this.capturePerformance({
        name,
        duration: endTime - startTime,
        startTime,
        endTime,
      });
    };
  }

  /**
   * Get monitoring status
   */
  public getStatus(): { initialized: boolean; enabled: boolean; config: MonitoringConfig } {
    return {
      initialized: this.isInitialized,
      enabled: this.config.enabled,
      config: this.config,
    };
  }
}

// Export singleton instance
export const monitoringService = new MonitoringService();

// Export default
export default monitoringService;
