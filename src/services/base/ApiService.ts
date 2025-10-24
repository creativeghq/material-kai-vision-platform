import { z } from 'zod';

import { ApiConfigManager } from '../../config';
import type {
  ApiConfig,
  ReplicateApiConfig,
  SupabaseApiConfig,
} from '../../config/apiConfig';

/**
 * Base API Service Class
 *
 * Provides a unified interface for all API interactions while preserving
 * each API's unique requirements and parameter schemas.
 */
export abstract class ApiService<TConfig extends ApiConfig = ApiConfig> {
  protected config: TConfig;
  protected rateLimitTracker: Map<string, number> = new Map();

  constructor(
    protected apiName: string,
    protected environment: 'development' | 'production' | 'test' = 'development',
  ) {
    const apiConfig = ApiConfigManager.getApiConfig<TConfig>(apiName);
    if (!apiConfig) {
      throw new Error(`API configuration not found for: ${apiName}`);
    }
    this.config = apiConfig;
  }

  /**
   * Get the current API configuration
   */
  public getConfig(): TConfig {
    return this.config;
  }

  /**
   * Get environment-specific settings
   */
  public getEnvironmentConfig(): { baseUrl: string; apiKey?: string } {
    const envConfig = this.config.environment[this.environment as keyof typeof this.config.environment];
    if (!envConfig || typeof envConfig !== 'object') {
      throw new Error(`Invalid environment configuration for ${this.environment}`);
    }
    return envConfig as { baseUrl: string; apiKey?: string };
  }

  /**
   * Validate parameters against the API's schema
   */
  protected validateParameters<T>(schema: z.ZodSchema<T>, params: unknown): T {
    try {
      return schema.parse(params);
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errorMessages = error.issues.map((err: z.ZodIssue) =>
          `${err.path.join('.')}: ${err.message}`,
        ).join(', ');
        throw new Error(`Parameter validation failed for ${this.apiName}: ${errorMessages}`);
      }
      throw error;
    }
  }

  /**
   * Check rate limiting before making API calls
   */
  protected async checkRateLimit(endpoint: string): Promise<void> {
    const rateLimitConfig = this.config.rateLimit;
    if (!rateLimitConfig || rateLimitConfig.requestsPerMinute <= 0) return;

    const now = Date.now();
    const lastCall = this.rateLimitTracker.get(endpoint) || 0;
    const timeSinceLastCall = now - lastCall;
    const minInterval = (60 * 1000) / rateLimitConfig.requestsPerMinute;

    if (timeSinceLastCall < minInterval) {
      const waitTime = minInterval - timeSinceLastCall;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    this.rateLimitTracker.set(endpoint, Date.now());
  }

  /**
   * Standard error handling for API responses
   */
  protected handleApiError(error: unknown, context: string): never {
    console.error(`API Error in ${this.apiName} (${context}):`, error);

    // Extract meaningful error information
    let errorMessage = `${this.apiName} API error`;

    if (error && typeof error === 'object' && 'response' in error) {
      // HTTP error response
      const errorResponse = error.response as { status: number; data?: { message?: string }; statusText?: string };
      errorMessage = errorResponse.data?.message || errorResponse.statusText || errorMessage;
    } else if (error && typeof error === 'object' && 'message' in error) {
      // Network or other error
      errorMessage = (error as { message: string }).message;
    }

    throw new Error(`${errorMessage} (${context})`);
  }

  /**
   * Get headers for API requests
   */
  protected getHeaders(): Record<string, string> {
    const envConfig = this.getEnvironmentConfig();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': `MaterialKaiVisionPlatform/1.0 (${this.apiName})`,
    };

    // Add API key if available
    if (envConfig?.apiKey) {
      // Different APIs use different header formats
      if (this.apiName.includes('replicate')) {
        headers['Authorization'] = `Token ${envConfig.apiKey}`;
      } else if (this.apiName.includes('openai')) {
        headers['Authorization'] = `Bearer ${envConfig.apiKey}`;
      } else if (this.apiName.includes('supabase')) {
        headers['Authorization'] = `Bearer ${envConfig.apiKey}`;
        headers['apikey'] = envConfig.apiKey;
      } else {
        // Default format
        headers['Authorization'] = `Bearer ${envConfig.apiKey}`;
      }
    }

    return headers;
  }

  /**
   * Build complete URL for API endpoints
   */
  protected buildUrl(endpoint: string): string {
    const envConfig = this.getEnvironmentConfig();
    const baseUrl = envConfig?.baseUrl?.replace(/\/$/, '') || ''; // Remove trailing slash
    const cleanEndpoint = endpoint.replace(/^\//, ''); // Remove leading slash
    return `${baseUrl}/${cleanEndpoint}`;
  }

  /**
   * Abstract method for making API calls - must be implemented by subclasses
   */
  public abstract call<TParams, TResponse>(
    endpoint: string,
    params: TParams,
    options?: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      timeout?: number;
      retries?: number;
    }
  ): Promise<TResponse>;

  /**
   * Health check for the API service
   */
  public async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    latency?: number;
    error?: string;
  }> {
    try {
      const start = Date.now();
      const envConfig = this.getEnvironmentConfig();

      // Simple ping to base URL
      const response = await fetch(envConfig?.baseUrl || '', {
        method: 'HEAD',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });

      const latency = Date.now() - start;

      return {
        status: response.ok ? 'healthy' : 'unhealthy',
        latency,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get API usage statistics
   */
  public getUsageStats(): {
    apiName: string;
    environment: string;
    rateLimitingEnabled: boolean;
    lastCallTimes: Record<string, number>;
    configuredEndpoints: string[];
  } {
    const lastCallTimes: Record<string, number> = {};
    this.rateLimitTracker.forEach((time, endpoint) => {
      lastCallTimes[endpoint] = time;
    });

    const rateLimitConfig = this.config.rateLimit;
    const hasRateLimit = rateLimitConfig && rateLimitConfig.requestsPerMinute > 0;

    return {
      apiName: this.apiName,
      environment: this.environment,
      rateLimitingEnabled: hasRateLimit || false,
      lastCallTimes,
      configuredEndpoints: [], // Will be populated based on specific API type
    };
  }
}

/**
 * Specialized service for Replicate API
 */
export class ReplicateApiService extends ApiService<ReplicateApiConfig> {
  constructor(environment: 'development' | 'production' | 'test' = 'development') {
    super('replicate', environment);
  }

  public async call<TParams, TResponse>(
    modelId: string,
    params: TParams,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      timeout?: number;
      retries?: number;
    } = {},
  ): Promise<TResponse> {
    const { method = 'POST', timeout = 30000, retries = 3 } = options;

    // Get model configuration
    const modelConfig = this.config.models[modelId];
    if (!modelConfig) {
      throw new Error(`Model configuration not found: ${modelId}`);
    }

    // Validate parameters against model schema
    const validatedParams = this.validateParameters(modelConfig.inputSchema, params);

    // Check rate limiting
    await this.checkRateLimit(modelId);

    // Build request
    const url = this.buildUrl('/v1/predictions');
    const requestBody = {
      version: modelConfig.version,
      input: validatedParams,
    };

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.getHeaders(),
          body: JSON.stringify(requestBody),
          signal: AbortSignal.timeout(timeout),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        return result as TResponse;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < retries) {
          // Exponential backoff
          const delay = Math.pow(2, attempt) * 1000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.handleApiError(lastError, `${modelId} after ${retries + 1} attempts`);
  }

  /**
   * Get prediction status for Replicate
   */
  public async getPredictionStatus(predictionId: string): Promise<unknown> {
    const url = this.buildUrl(`/v1/predictions/${predictionId}`);

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: this.getHeaders(),
        signal: AbortSignal.timeout(10000),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      this.handleApiError(error, `getPredictionStatus(${predictionId})`);
    }
  }
}

/**
 * Specialized service for Supabase Edge Functions
 */
export class SupabaseApiService extends ApiService<SupabaseApiConfig> {
  constructor(environment: 'development' | 'production' | 'test' = 'development') {
    super('supabase', environment);
  }

  public async call<TParams, TResponse>(
    functionName: string,
    params: TParams,
    options: {
      method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
      timeout?: number;
      retries?: number;
    } = {},
  ): Promise<TResponse> {
    const { method = 'POST', timeout = 60000, retries = 2 } = options;

    // Get function configuration
    const functionConfig = this.config.functions[functionName];
    if (!functionConfig) {
      throw new Error(`Function configuration not found: ${functionName}`);
    }

    // Validate parameters against function schema
    const validatedParams = this.validateParameters(functionConfig.inputSchema, params);

    // Check rate limiting
    await this.checkRateLimit(functionName);

    // Build request
    const url = this.buildUrl(`/functions/v1/${functionName}`);

    let lastError: Error;

    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          method,
          headers: this.getHeaders(),
          body: JSON.stringify(validatedParams),
          signal: AbortSignal.timeout(timeout),
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const result = await response.json();
        return result as TResponse;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < retries) {
          // Linear backoff for Supabase
          const delay = (attempt + 1) * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    this.handleApiError(lastError, `${functionName} after ${retries + 1} attempts`);
  }
}

/**
 * Factory function to create appropriate API service instances
 */
export class ApiServiceFactory {
  private static instances: Map<string, ApiService> = new Map();

  public static getService<T extends ApiService>(
    apiName: string,
    environment: 'development' | 'production' | 'test' = 'development',
  ): T {
    const key = `${apiName}-${environment}`;

    if (this.instances.has(key)) {
      return this.instances.get(key) as T;
    }

    let service: ApiService;

    switch (apiName) {
      case 'replicate':
        service = new ReplicateApiService(environment);
        break;
      case 'supabase':
        service = new SupabaseApiService(environment);
        break;
      default:
        throw new Error(`Unknown API service: ${apiName}`);
    }

    this.instances.set(key, service);
    return service as T;
  }

  public static clearCache(): void {
    this.instances.clear();
  }

  public static getActiveServices(): string[] {
    return Array.from(this.instances.keys());
  }
}

export default ApiService;
