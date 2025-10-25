/**
 * Production Environment Configuration
 * Optimized for production deployment with security and performance focus
 */

import { AppConfig } from '../types';

export const productionConfig: AppConfig = {
  // Base configuration
  environment: 'production',
  version: '1.0.0',
  debug: false,
  logLevel: 'warn',

  // Service configurations
  services: {
    documentChunking: {
      chunkSize: 2000,
      chunkOverlap: 100,
      maxChunks: 500,
      preserveFormatting: true,
      splitStrategy: 'sentence',
    },
    embeddingGeneration: {
      provider: 'openai',
      model: 'text-embedding-ada-002',
      dimensions: 1536,
      batchSize: 20,
      timeout: 60000,
      retryAttempts: 5,
    },
    mivaaToRagTransformer: {
      transformationRules: [
        'basic-cleanup',
        'metadata-extraction',
        'content-optimization',
        'security-sanitization',
      ],
      outputFormat: 'json',
      validateOutput: true,
      preserveMetadata: true,
    },
    validationIntegration: {
      enableValidation: true,
      validationRules: [
        'schema-validation',
        'content-validation',
        'security-validation',
        'performance-validation',
      ],
      strictMode: true,
      errorHandling: 'throw',
    },
    batchProcessing: {
      batchSize: 50,
      maxConcurrency: 10,
      queueTimeout: 300000, // 5 minutes
      retryPolicy: {
        maxRetries: 5,
        backoffMultiplier: 2,
        initialDelay: 2000,
      },
    },
    mivaaIntegration: {
      baseUrl: process.env.MIVAA_GATEWAY_URL || 'https://v1api.materialshub.gr',
      apiKey: process.env.MIVAA_API_KEY,
      timeout: 60000,
      retryAttempts: 5,
      retryDelay: 2000,
      retryBackoffMultiplier: 2,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 10,
        resetTimeout: 300000, // 5 minutes
      },
    },
  },

  // Performance configuration
  performance: {
    caching: {
      enabled: true,
      ttl: 3600000, // 1 hour
      maxSize: 1000,
      strategy: 'lru',
    },
    rateLimit: {
      enabled: true,
      requestsPerMinute: 500,
      burstLimit: 50,
    },
    monitoring: {
      enabled: true,
      metricsInterval: 60000, // 1 minute
      alertThresholds: {
        errorRate: 0.05, // 5%
        responseTime: 2000, // 2 seconds
        memoryUsage: 0.7, // 70%
      },
    },
  },

  // External dependencies
  externalDependencies: {
    apis: {
      timeout: 60000,
      retryAttempts: 5,
      circuitBreaker: {
        enabled: true,
        failureThreshold: 10,
        resetTimeout: 300000, // 5 minutes
      },
    },
    databases: {
      connectionPool: {
        min: 5,
        max: 50,
        acquireTimeout: 60000,
        idleTimeout: 600000, // 10 minutes
      },
      queryTimeout: 60000,
    },
    storage: {
      provider: 's3', // Changed from 'supabase' to fix type error
      encryption: true,
    },
  },

  // Hot reload configuration
  hotReload: {
    enabled: false, // Disabled in production
    watchPaths: [],
    debounceMs: 100, // Minimum value required by schema (not used when disabled)
  },
};
