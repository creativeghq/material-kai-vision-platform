/**
 * Development Environment Configuration
 * Optimized for local development with debugging and hot reload enabled
 */

import { AppConfig } from '../types';

export const developmentConfig: AppConfig = {
  // Base configuration
  environment: 'development',
  version: '1.0.0-dev',
  debug: true,
  logLevel: 'debug',

  // Service configurations
  services: {
    documentChunking: {
      chunkSize: 1000,
      chunkOverlap: 200,
      maxChunks: 100,
      preserveFormatting: true,
      splitStrategy: 'paragraph',
    },
    embeddingGeneration: {
      provider: 'openai',
      model: 'text-embedding-ada-002',
      dimensions: 1536,
      batchSize: 5,
      timeout: 30000,
      retryAttempts: 3,
    },
    mivaaToRagTransformer: {
      transformationRules: ['basic-cleanup', 'metadata-extraction'],
      outputFormat: 'json',
      validateOutput: true,
      preserveMetadata: true,
    },
    validationIntegration: {
      enableValidation: true,
      validationRules: ['schema-validation', 'content-validation'],
      strictMode: false,
      errorHandling: 'log',
    },
    batchProcessing: {
      batchSize: 10,
      maxConcurrency: 3,
      queueTimeout: 60000,
      retryPolicy: {
        maxRetries: 3,
        backoffMultiplier: 2,
        initialDelay: 1000,
      },
    },
  },

  // Performance configuration
  performance: {
    caching: {
      enabled: true,
      ttl: 300000, // 5 minutes
      maxSize: 100,
      strategy: 'lru',
    },
    rateLimit: {
      enabled: false, // Disabled for development
      requestsPerMinute: 1000,
      burstLimit: 100,
    },
    monitoring: {
      enabled: true,
      metricsInterval: 30000, // 30 seconds
      alertThresholds: {
        errorRate: 0.1, // 10%
        responseTime: 5000, // 5 seconds
        memoryUsage: 0.8, // 80%
      },
    },
  },

  // External dependencies
  externalDependencies: {
    apis: {
      timeout: 30000,
      retryAttempts: 3,
      circuitBreaker: {
        enabled: false, // Disabled for development
        failureThreshold: 5,
        resetTimeout: 60000,
      },
    },
    databases: {
      connectionPool: {
        min: 2,
        max: 10,
        acquireTimeout: 30000,
        idleTimeout: 300000,
      },
      queryTimeout: 30000,
    },
    storage: {
      provider: 'local',
      encryption: false, // Disabled for development
    },
  },

  // Hot reload configuration
  hotReload: {
    enabled: true,
    watchPaths: [
      'src/config/**/*.ts',
      'src/config/**/*.json',
      '.env.development',
    ],
    debounceMs: 1000,
  },
};
