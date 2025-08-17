import { z } from 'zod';

/**
 * Validation schema for chunk size configuration
 */
const ChunkSizeConfigSchema = z.object({
  maxTokens: z.number().int().min(100, 'Max tokens must be at least 100').max(8000, 'Max tokens cannot exceed 8000'),
  overlap: z.number().int().min(0, 'Overlap must be non-negative').max(500, 'Overlap cannot exceed 500'),
  minChunkSize: z.number().int().min(50, 'Min chunk size must be at least 50').max(1000, 'Min chunk size cannot exceed 1000'),
}).refine(
  (data) => data.overlap < data.maxTokens / 2,
  {
    message: 'Overlap must be less than half of max tokens',
    path: ['overlap'],
  },
).refine(
  (data) => data.minChunkSize <= data.maxTokens,
  {
    message: 'Min chunk size must not exceed max tokens',
    path: ['minChunkSize'],
  },
);

/**
 * Validation schema for embedding configuration
 */
const EmbeddingConfigSchema = z.object({
  model: z.enum(['text-embedding-ada-002', 'text-embedding-3-small', 'text-embedding-3-large'], {
    errorMap: () => ({ message: 'Invalid embedding model' }),
  }),
  dimensions: z.number().int().min(256, 'Dimensions must be at least 256').max(3072, 'Dimensions cannot exceed 3072').optional(),
  batchSize: z.number().int().min(1, 'Batch size must be at least 1').max(100, 'Batch size cannot exceed 100').default(10),
  timeout: z.number().int().min(5000, 'Timeout must be at least 5 seconds').max(300000, 'Timeout cannot exceed 5 minutes').default(30000),
});

/**
 * Validation schema for output format configuration
 */
const OutputFormatSchema = z.object({
  format: z.enum(['json', 'jsonl', 'csv'], {
    errorMap: () => ({ message: 'Format must be json, jsonl, or csv' }),
  }),
  includeMetadata: z.boolean().default(true),
  includeEmbeddings: z.boolean().default(true),
  compression: z.enum(['none', 'gzip', 'brotli']).default('none'),
  encoding: z.enum(['utf8', 'utf16le', 'base64']).default('utf8'),
});

/**
 * Validation schema for processing options
 */
const ProcessingOptionsSchema = z.object({
  preserveFormatting: z.boolean().default(true),
  extractTables: z.boolean().default(true),
  extractImages: z.boolean().default(true),
  includePageNumbers: z.boolean().default(true),
  removeHeaders: z.boolean().default(false),
  removeFooters: z.boolean().default(false),
  normalizeWhitespace: z.boolean().default(true),
  filterEmptyChunks: z.boolean().default(true),
  minContentLength: z.number().int().min(0, 'Min content length must be non-negative').max(1000, 'Min content length cannot exceed 1000').default(10),
});

/**
 * Validation schema for quality thresholds
 */
const QualityThresholdsSchema = z.object({
  minConfidence: z.number().min(0, 'Min confidence must be non-negative').max(1, 'Min confidence cannot exceed 1').default(0.7),
  maxErrorRate: z.number().min(0, 'Max error rate must be non-negative').max(1, 'Max error rate cannot exceed 1').default(0.1),
  minTextDensity: z.number().min(0, 'Min text density must be non-negative').max(1, 'Min text density cannot exceed 1').default(0.3),
  requireValidEncoding: z.boolean().default(true),
});

/**
 * Validation schema for performance limits
 */
const PerformanceLimitsSchema = z.object({
  maxProcessingTime: z.number().int().min(1000, 'Max processing time must be at least 1 second').max(3600000, 'Max processing time cannot exceed 1 hour').default(300000), // 5 minutes
  maxMemoryUsage: z.number().int().min(100, 'Max memory usage must be at least 100MB').max(8192, 'Max memory usage cannot exceed 8GB').default(2048), // 2GB in MB
  maxConcurrentJobs: z.number().int().min(1, 'Max concurrent jobs must be at least 1').max(10, 'Max concurrent jobs cannot exceed 10').default(3),
  retryAttempts: z.number().int().min(0, 'Retry attempts must be non-negative').max(5, 'Retry attempts cannot exceed 5').default(2),
  retryDelay: z.number().int().min(1000, 'Retry delay must be at least 1 second').max(60000, 'Retry delay cannot exceed 1 minute').default(5000),
});

/**
 * Main validation schema for transformation configuration
 */
export const TransformationConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Configuration name is required').max(100, 'Configuration name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (x.y.z)').default('1.0.0'),
  chunkSize: ChunkSizeConfigSchema,
  embedding: EmbeddingConfigSchema,
  outputFormat: OutputFormatSchema,
  processing: ProcessingOptionsSchema,
  quality: QualityThresholdsSchema,
  performance: PerformanceLimitsSchema,
  customFields: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().datetime('Invalid creation timestamp').optional(),
  updatedAt: z.string().datetime('Invalid update timestamp').optional(),
  isActive: z.boolean().default(true),
}).refine(
  (data) => {
    // Custom validation: ensure embedding dimensions are compatible with model
    if (data.embedding.model === 'text-embedding-ada-002' && data.embedding.dimensions && data.embedding.dimensions !== 1536) {
      return false;
    }
    if (data.embedding.model === 'text-embedding-3-small' && data.embedding.dimensions && data.embedding.dimensions > 1536) {
      return false;
    }
    if (data.embedding.model === 'text-embedding-3-large' && data.embedding.dimensions && data.embedding.dimensions > 3072) {
      return false;
    }
    return true;
  },
  {
    message: 'Embedding dimensions not compatible with selected model',
    path: ['embedding', 'dimensions'],
  },
).refine(
  (data) => {
    // Custom validation: ensure performance limits are reasonable
    const estimatedMemoryPerChunk = data.chunkSize.maxTokens * 4; // Rough estimate: 4 bytes per token
    const maxChunksInMemory = Math.floor(data.performance.maxMemoryUsage * 1024 * 1024 / estimatedMemoryPerChunk);
    return maxChunksInMemory >= data.embedding.batchSize;
  },
  {
    message: 'Memory limit too low for the configured chunk size and batch size',
    path: ['performance', 'maxMemoryUsage'],
  },
);

/**
 * Type inference from the schema
 */
export type ValidatedTransformationConfig = z.infer<typeof TransformationConfigSchema>;

/**
 * Validation function with detailed error reporting
 */
export function validateTransformationConfig(data: unknown): {
  success: boolean;
  data?: ValidatedTransformationConfig;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
} {
  const result = TransformationConfigSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((error: z.ZodIssue) => ({
    path: error.path.join('.'),
    message: error.message,
    code: error.code,
  }));

  return {
    success: false,
    errors,
  };
}

/**
 * Base schema without refinements for partial validation
 */
const BaseTransformationConfigSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Configuration name is required').max(100, 'Configuration name too long'),
  description: z.string().max(500, 'Description too long').optional(),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Version must follow semantic versioning (x.y.z)').default('1.0.0'),
  chunkSize: ChunkSizeConfigSchema,
  embedding: EmbeddingConfigSchema,
  outputFormat: OutputFormatSchema,
  processing: ProcessingOptionsSchema,
  quality: QualityThresholdsSchema,
  performance: PerformanceLimitsSchema,
  customFields: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().datetime('Invalid creation timestamp').optional(),
  updatedAt: z.string().datetime('Invalid update timestamp').optional(),
  isActive: z.boolean().default(true),
});

/**
 * Partial validation for updates (all fields optional)
 */
export const PartialTransformationConfigSchema = BaseTransformationConfigSchema.partial();

/**
 * Validation function for partial updates
 */
export function validatePartialTransformationConfig(data: unknown): {
  success: boolean;
  data?: z.infer<typeof PartialTransformationConfigSchema>;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
} {
  const result = PartialTransformationConfigSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((error: z.ZodIssue) => ({
    path: error.path.join('.'),
    message: error.message,
    code: error.code,
  }));

  return {
    success: false,
    errors,
  };
}

/**
 * Validation schema for transformation job request
 */
export const TransformationJobRequestSchema = z.object({
  documentId: z.string().min(1, 'Document ID is required'),
  configId: z.string().min(1, 'Configuration ID is required').optional(),
  config: TransformationConfigSchema.optional(),
  priority: z.enum(['low', 'normal', 'high']).default('normal'),
  tags: z.array(z.string()).max(10, 'Too many tags').optional(),
  metadata: z.record(z.string(), z.any()).optional(),
}).refine(
  (data) => data.configId || data.config,
  {
    message: 'Either configId or config must be provided',
    path: ['config'],
  },
);

/**
 * Validation function for transformation job requests
 */
export function validateTransformationJobRequest(data: unknown): {
  success: boolean;
  data?: z.infer<typeof TransformationJobRequestSchema>;
  errors?: Array<{
    path: string;
    message: string;
    code: string;
  }>;
} {
  const result = TransformationJobRequestSchema.safeParse(data);

  if (result.success) {
    return {
      success: true,
      data: result.data,
    };
  }

  const errors = result.error.errors.map((error: z.ZodIssue) => ({
    path: error.path.join('.'),
    message: error.message,
    code: error.code,
  }));

  return {
    success: false,
    errors,
  };
}
