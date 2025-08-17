/**
 * Zod Validation Schemas for Configuration
 * Provides runtime validation for all configuration objects
 */

import { z } from 'zod';

// Environment schema
export const EnvironmentSchema = z.enum(['development', 'staging', 'production']);

// Base configuration schema
export const BaseConfigSchema = z.object({
  environment: EnvironmentSchema,
  version: z.string().min(1),
  debug: z.boolean(),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']),
});

// Service-specific schemas
export const DocumentChunkingConfigSchema = z.object({
  chunkSize: z.number().min(100).max(10000),
  chunkOverlap: z.number().min(0).max(1000),
  maxChunks: z.number().min(1).max(1000),
  preserveFormatting: z.boolean(),
  splitStrategy: z.enum(['sentence', 'paragraph', 'token']),
});

export const EmbeddingGenerationConfigSchema = z.object({
  provider: z.enum(['openai', 'huggingface', 'local']),
  model: z.string().min(1),
  dimensions: z.number().min(1).max(4096),
  batchSize: z.number().min(1).max(100),
  timeout: z.number().min(1000).max(300000), // 1s to 5min
  retryAttempts: z.number().min(0).max(10),
});

export const MivaaToRagTransformerConfigSchema = z.object({
  transformationRules: z.array(z.string()),
  outputFormat: z.enum(['json', 'markdown', 'xml']),
  validateOutput: z.boolean(),
  preserveMetadata: z.boolean(),
});

export const ValidationIntegrationConfigSchema = z.object({
  enableValidation: z.boolean(),
  validationRules: z.array(z.string()),
  strictMode: z.boolean(),
  errorHandling: z.enum(['throw', 'log', 'ignore']),
});

export const BatchProcessingConfigSchema = z.object({
  batchSize: z.number().min(1).max(1000),
  maxConcurrency: z.number().min(1).max(100),
  queueTimeout: z.number().min(1000).max(3600000), // 1s to 1h
  retryPolicy: z.object({
    maxRetries: z.number().min(0).max(10),
    backoffMultiplier: z.number().min(1).max(10),
    initialDelay: z.number().min(100).max(60000), // 100ms to 1min
  }),
});

// Performance configuration schema
export const PerformanceConfigSchema = z.object({
  caching: z.object({
    enabled: z.boolean(),
    ttl: z.number().min(1000).max(86400000), // 1s to 24h
    maxSize: z.number().min(1).max(10000),
    strategy: z.enum(['lru', 'fifo', 'lfu']),
  }),
  rateLimit: z.object({
    enabled: z.boolean(),
    requestsPerMinute: z.number().min(1).max(10000),
    burstLimit: z.number().min(1).max(1000),
  }),
  monitoring: z.object({
    enabled: z.boolean(),
    metricsInterval: z.number().min(1000).max(300000), // 1s to 5min
    alertThresholds: z.object({
      errorRate: z.number().min(0).max(1), // 0-100%
      responseTime: z.number().min(1).max(60000), // 1ms to 1min
      memoryUsage: z.number().min(0).max(1), // 0-100%
    }),
  }),
});

// External dependencies schema
export const ExternalDependenciesConfigSchema = z.object({
  apis: z.object({
    timeout: z.number().min(1000).max(300000), // 1s to 5min
    retryAttempts: z.number().min(0).max(10),
    circuitBreaker: z.object({
      enabled: z.boolean(),
      failureThreshold: z.number().min(1).max(100),
      resetTimeout: z.number().min(1000).max(300000), // 1s to 5min
    }),
  }),
  databases: z.object({
    connectionPool: z.object({
      min: z.number().min(1).max(100),
      max: z.number().min(1).max(1000),
      acquireTimeout: z.number().min(1000).max(60000), // 1s to 1min
      idleTimeout: z.number().min(1000).max(3600000), // 1s to 1h
    }),
    queryTimeout: z.number().min(1000).max(300000), // 1s to 5min
  }),
  storage: z.object({
    provider: z.enum(['local', 's3', 'gcs', 'azure']),
    bucket: z.string().optional(),
    region: z.string().optional(),
    encryption: z.boolean(),
  }),
});

// Services configuration schema
export const ServicesConfigSchema = z.object({
  documentChunking: DocumentChunkingConfigSchema,
  embeddingGeneration: EmbeddingGenerationConfigSchema,
  mivaaToRagTransformer: MivaaToRagTransformerConfigSchema,
  validationIntegration: ValidationIntegrationConfigSchema,
  batchProcessing: BatchProcessingConfigSchema,
});

// Hot reload configuration schema
export const HotReloadConfigSchema = z.object({
  enabled: z.boolean(),
  watchPaths: z.array(z.string()),
  debounceMs: z.number().min(100).max(10000), // 100ms to 10s
});

// Main application configuration schema
export const AppConfigSchema = BaseConfigSchema.extend({
  services: ServicesConfigSchema,
  performance: PerformanceConfigSchema,
  externalDependencies: ExternalDependenciesConfigSchema,
  hotReload: HotReloadConfigSchema,
});

// Configuration validation result schema
export const ConfigValidationResultSchema = z.object({
  isValid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
});

// Environment variable schema for validation
export const EnvVarsSchema = z.object({
  NODE_ENV: z.string().default('development'),
  LOG_LEVEL: z.string().default('info'),
  DEBUG: z.string().default('false'),

  // API Configuration
  OPENAI_API_KEY: z.string().optional(),
  HUGGINGFACE_API_KEY: z.string().optional(),

  // Database Configuration
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),

  // Storage Configuration
  STORAGE_PROVIDER: z.string().default('local'),
  AWS_REGION: z.string().optional(),
  AWS_S3_BUCKET: z.string().optional(),

  // Performance Configuration
  CACHE_TTL: z.string().default('3600000'), // 1 hour
  RATE_LIMIT_RPM: z.string().default('1000'),

  // Service Configuration
  CHUNK_SIZE: z.string().default('1000'),
  EMBEDDING_BATCH_SIZE: z.string().default('10'),
  MAX_CONCURRENCY: z.string().default('5'),
});

// Type exports for TypeScript inference
export type EnvironmentType = z.infer<typeof EnvironmentSchema>;
export type BaseConfigType = z.infer<typeof BaseConfigSchema>;
export type DocumentChunkingConfigType = z.infer<typeof DocumentChunkingConfigSchema>;
export type EmbeddingGenerationConfigType = z.infer<typeof EmbeddingGenerationConfigSchema>;
export type MivaaToRagTransformerConfigType = z.infer<typeof MivaaToRagTransformerConfigSchema>;
export type ValidationIntegrationConfigType = z.infer<typeof ValidationIntegrationConfigSchema>;
export type BatchProcessingConfigType = z.infer<typeof BatchProcessingConfigSchema>;
export type PerformanceConfigType = z.infer<typeof PerformanceConfigSchema>;
export type ExternalDependenciesConfigType = z.infer<typeof ExternalDependenciesConfigSchema>;
export type ServicesConfigType = z.infer<typeof ServicesConfigSchema>;
export type HotReloadConfigType = z.infer<typeof HotReloadConfigSchema>;
export type AppConfigType = z.infer<typeof AppConfigSchema>;
export type ConfigValidationResultType = z.infer<typeof ConfigValidationResultSchema>;
export type EnvVarsType = z.infer<typeof EnvVarsSchema>;
