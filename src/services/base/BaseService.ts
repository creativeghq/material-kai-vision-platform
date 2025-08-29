import { Singleton } from '../../core/patterns/Singleton';

/**
 * Standard Service Configuration Interface
 * All services should implement this interface for their configuration
 */
export interface ServiceConfig {
  name: string;
  version: string;
  environment: 'development' | 'production' | 'test';
  enabled: boolean;
  timeout?: number;
  retries?: number;
  rateLimit?: {
    requestsPerMinute: number;
    burstLimit?: number;
  };
  healthCheck?: {
    enabled: boolean;
    interval?: number;
    timeout?: number;
  };
}

/**
 * Standard Service Health Status
 */
export interface ServiceHealth {
  status: 'healthy' | 'unhealthy' | 'degraded';
  latency?: number;
  error?: string;
  lastCheck?: Date;
  uptime?: number;
}

/**
 * Standard Service Metrics
 */
export interface ServiceMetrics {
  serviceName: string;
  environment: string;
  uptime: number;
  requestCount: number;
  errorCount: number;
  averageLatency: number;
  lastActivity?: Date;
  rateLimitingEnabled: boolean;
}

/**
 * Base Service Class
 *
 * Provides standardized functionality for all services including:
 * - Singleton pattern implementation
 * - Configuration management
 * - Health monitoring
 * - Error handling
 * - Metrics collection
 * - Rate limiting
 * - Lifecycle management
 */
export abstract class BaseService<TConfig extends ServiceConfig = ServiceConfig> extends Singleton {
  protected config: TConfig;
  protected isInitialized: boolean = false;
  protected startTime: Date = new Date();
  protected requestCount: number = 0;
  protected errorCount: number = 0;
  protected latencySum: number = 0;
  protected lastActivity?: Date;
  protected rateLimitTracker: Map<string, number[]> = new Map();

  constructor(config: TConfig) {
    super();
    this.config = config;
  }

  /**
   * Initialize the service
   * Must be implemented by subclasses
   */
  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      await this.doInitialize();
      this.isInitialized = true;
      console.log(`Service ${this.config.name} initialized successfully`);
    } catch (error) {
      console.error(`Failed to initialize service ${this.config.name}:`, error);
      throw error;
    }
  }

  /**
   * Cleanup service resources
   * Override in subclasses if needed
   */
  public async cleanup(): Promise<void> {
    this.isInitialized = false;
    this.rateLimitTracker.clear();
    console.log(`Service ${this.config.name} cleaned up`);
  }

  /**
   * Get service configuration
   */
  public getConfig(): TConfig {
    return { ...this.config };
  }

  /**
   * Update service configuration
   */
  public updateConfig(updates: Partial<TConfig>): void {
    this.config = { ...this.config, ...updates };
  }

  /**
   * Check if service is enabled and initialized
   */
  public isReady(): boolean {
    return this.config.enabled && this.isInitialized;
  }

  /**
   * Get service health status
   */
  public async getHealth(): Promise<ServiceHealth> {
    if (!this.isReady()) {
      return {
        status: 'unhealthy',
        error: 'Service not initialized or disabled',
      };
    }

    try {
      const start = Date.now();
      await this.doHealthCheck();
      const latency = Date.now() - start;

      return {
        status: 'healthy',
        latency,
        lastCheck: new Date(),
        uptime: Date.now() - this.startTime.getTime(),
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        lastCheck: new Date(),
      };
    }
  }

  /**
   * Get service metrics
   */
  public getMetrics(): ServiceMetrics {
    const uptime = Date.now() - this.startTime.getTime();
    const averageLatency = this.requestCount > 0 ? this.latencySum / this.requestCount : 0;

    return {
      serviceName: this.config.name,
      environment: this.config.environment,
      uptime,
      requestCount: this.requestCount,
      errorCount: this.errorCount,
      averageLatency,
      lastActivity: this.lastActivity || undefined,
      rateLimitingEnabled: !!this.config.rateLimit,
    };
  }

  /**
   * Execute a service operation with standard error handling and metrics
   */
  protected async executeOperation<T>(
    operation: () => Promise<T>,
    operationName: string,
  ): Promise<T> {
    if (!this.isReady()) {
      throw new Error(`Service ${this.config.name} is not ready`);
    }

    const start = Date.now();
    this.requestCount++;
    this.lastActivity = new Date();

    try {
      // Check rate limiting
      await this.checkRateLimit(operationName);

      // Execute operation
      const result = await operation();

      // Record metrics
      const latency = Date.now() - start;
      this.latencySum += latency;

      return result;
    } catch (error) {
      this.errorCount++;
      throw this.handleError(error, operationName);
    }
  }

  /**
   * Standard error handling
   */
  protected handleError(error: unknown, context: string): Error {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const serviceError = new Error(`${this.config.name} service error in ${context}: ${errorMessage}`);

    console.error(`Service ${this.config.name} error:`, {
      context,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return serviceError;
  }

  /**
   * Rate limiting check
   */
  protected async checkRateLimit(operation: string): Promise<void> {
    if (!this.config.rateLimit || this.config.rateLimit.requestsPerMinute <= 0) {
      return;
    }

    const now = Date.now();
    const windowMs = 60 * 1000; // 1 minute
    const maxRequests = this.config.rateLimit.requestsPerMinute;

    // Get or create request history for this operation
    let requests = this.rateLimitTracker.get(operation) || [];

    // Remove requests outside the current window
    requests = requests.filter(timestamp => now - timestamp < windowMs);

    // Check if we're at the limit
    if (requests.length >= maxRequests) {
      const oldestRequest = Math.min(...requests);
      const waitTime = windowMs - (now - oldestRequest);

      if (waitTime > 0) {
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }

    // Add current request
    requests.push(now);
    this.rateLimitTracker.set(operation, requests);
  }

  /**
   * Abstract methods to be implemented by subclasses
   */
  protected abstract doInitialize(): Promise<void>;
  protected abstract doHealthCheck(): Promise<void>;
}

export default BaseService;
