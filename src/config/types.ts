/**
 * Core Configuration Types
 * Defines TypeScript interfaces for the centralized configuration system
 */

// Environment types
export type Environment = 'development' | 'staging' | 'production';

// Base configuration interface
export interface BaseConfig {
  environment: Environment;
  version: string;
  debug: boolean;
  logLevel: 'error' | 'warn' | 'info' | 'debug';
}

// Service-specific configuration interfaces
export interface DocumentChunkingConfig {
  chunkSize: number;
  chunkOverlap: number;
  maxChunks: number;
  preserveFormatting: boolean;
  splitStrategy: 'sentence' | 'paragraph' | 'token';
}

export interface EmbeddingGenerationConfig {
  provider: 'openai' | 'huggingface' | 'local';
  model: string;
  dimensions: number;
  batchSize: number;
  timeout: number;
  retryAttempts: number;
}

export interface MivaaToRagTransformerConfig {
  transformationRules: string[];
  outputFormat: 'json' | 'markdown' | 'xml';
  validateOutput: boolean;
  preserveMetadata: boolean;
}

export interface ValidationIntegrationConfig {
  enableValidation: boolean;
  validationRules: string[];
  strictMode: boolean;
  errorHandling: 'throw' | 'log' | 'ignore';
}

export interface BatchProcessingConfig {
  batchSize: number;
  maxConcurrency: number;
  queueTimeout: number;
  retryPolicy: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
  };
}

// Performance configuration
export interface PerformanceConfig {
  caching: {
    enabled: boolean;
    ttl: number;
    maxSize: number;
    strategy: 'lru' | 'fifo' | 'lfu';
  };
  rateLimit: {
    enabled: boolean;
    requestsPerMinute: number;
    burstLimit: number;
  };
  monitoring: {
    enabled: boolean;
    metricsInterval: number;
    alertThresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
    };
  };
}

// External dependencies configuration
export interface ExternalDependenciesConfig {
  apis: {
    timeout: number;
    retryAttempts: number;
    circuitBreaker: {
      enabled: boolean;
      failureThreshold: number;
      resetTimeout: number;
    };
  };
  databases: {
    connectionPool: {
      min: number;
      max: number;
      acquireTimeout: number;
      idleTimeout: number;
    };
    queryTimeout: number;
  };
  storage: {
    provider: 'local' | 's3' | 'gcs' | 'azure';
    bucket?: string;
    region?: string;
    encryption: boolean;
  };
}

// Main configuration interface
export interface AppConfig extends BaseConfig {
  services: {
    documentChunking: DocumentChunkingConfig;
    embeddingGeneration: EmbeddingGenerationConfig;
    mivaaToRagTransformer: MivaaToRagTransformerConfig;
    validationIntegration: ValidationIntegrationConfig;
    batchProcessing: BatchProcessingConfig;
  };
  performance: PerformanceConfig;
  externalDependencies: ExternalDependenciesConfig;
  hotReload: {
    enabled: boolean;
    watchPaths: string[];
    debounceMs: number;
  };
}

// Configuration validation result
export interface ConfigValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// Configuration factory interface
export interface ConfigFactory {
  create(environment: Environment): Promise<AppConfig>;
  validate(config: Partial<AppConfig>): ConfigValidationResult;
  reload(): Promise<void>;
}