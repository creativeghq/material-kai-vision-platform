/**
 * Centralized Embedding Configuration
 * 
 * This file provides a single source of truth for all embedding model configurations
 * across the Material Kai Vision Platform. It ensures consistency between frontend
 * services, Supabase functions, and MIVAA integration.
 * 
 * Environment Variables Required:
 * - EMBEDDING_MODEL: The OpenAI embedding model to use (default: text-embedding-ada-002)
 * - EMBEDDING_DIMENSIONS: The vector dimensions (default: 1536)
 * - OPENAI_API_KEY: OpenAI API key for embedding generation
 * - EMBEDDING_BATCH_SIZE: Batch size for bulk operations (default: 100)
 * - EMBEDDING_CACHE_TTL: Cache TTL in seconds (default: 3600)
 */

export interface EmbeddingModelConfig {
  model: string;
  dimensions: number;
  maxTokens: number;
  costPerToken: number;
  description: string;
  status: 'active' | 'deprecated' | 'experimental';
}

export interface EmbeddingConfig {
  // Primary configuration
  model: string;
  dimensions: number;
  maxTokens: number;
  batchSize: number;
  cacheTTL: number;
  
  // Performance settings
  maxRetries: number;
  retryDelay: number;
  requestTimeout: number;
  
  // Validation functions
  validateDimensions: (embedding: number[]) => boolean;
  validateModel: (model: string) => boolean;
  
  // Model compatibility matrix
  supportedModels: Record<string, EmbeddingModelConfig>;
}

/**
 * Default embedding configuration
 * Uses text-embedding-ada-002 for MIVAA compatibility and proven stability
 */
export const EMBEDDING_CONFIG: EmbeddingConfig = {
  // Primary embedding model for all platform operations
  model: process.env.EMBEDDING_MODEL || 'text-embedding-ada-002',
  dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '1536'),
  maxTokens: 8191,
  batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE || '100'),
  cacheTTL: parseInt(process.env.EMBEDDING_CACHE_TTL || '3600'),
  
  // Performance settings
  maxRetries: 3,
  retryDelay: 1000, // 1 second
  requestTimeout: 30000, // 30 seconds
  
  // Validation functions
  validateDimensions: (embedding: number[]): boolean => {
    const expectedDimensions = parseInt(process.env.EMBEDDING_DIMENSIONS || '1536');
    return embedding.length === expectedDimensions;
  },
  
  validateModel: (model: string): boolean => {
    return Object.keys(EMBEDDING_CONFIG.supportedModels).includes(model);
  },
  
  // Model compatibility matrix
  supportedModels: {
    'text-embedding-ada-002': {
      model: 'text-embedding-ada-002',
      dimensions: 1536,
      maxTokens: 8191,
      costPerToken: 0.0001,
      description: 'OpenAI text-embedding-ada-002 model - MIVAA compatible, stable, cost-effective',
      status: 'active'
    },
    'text-embedding-3-small': {
      model: 'text-embedding-3-small',
      dimensions: 1536,
      maxTokens: 8191,
      costPerToken: 0.00002,
      description: 'OpenAI text-embedding-3-small model - newer, cheaper, configurable dimensions',
      status: 'active'
    },
    'text-embedding-3-large': {
      model: 'text-embedding-3-large',
      dimensions: 3072,
      maxTokens: 8191,
      costPerToken: 0.00013,
      description: 'OpenAI text-embedding-3-large model - highest performance, full dimensions',
      status: 'active'
    },
    'text-embedding-3-large-768': {
      model: 'text-embedding-3-large',
      dimensions: 768,
      maxTokens: 8191,
      costPerToken: 0.00013,
      description: 'OpenAI text-embedding-3-large model - reduced dimensions for compatibility',
      status: 'experimental'
    }
  }
} as const;

/**
 * Get the current embedding model configuration
 */
export function getCurrentModelConfig(): EmbeddingModelConfig {
  const currentModel = EMBEDDING_CONFIG.model;
  const config = EMBEDDING_CONFIG.supportedModels[currentModel];
  
  if (!config) {
    throw new Error(`Unsupported embedding model: ${currentModel}`);
  }
  
  return config;
}

/**
 * Validate embedding configuration on startup
 */
export function validateEmbeddingConfig(): void {
  const currentModel = EMBEDDING_CONFIG.model;
  const currentDimensions = EMBEDDING_CONFIG.dimensions;
  
  // Check if model is supported
  if (!EMBEDDING_CONFIG.validateModel(currentModel)) {
    throw new Error(`Unsupported embedding model: ${currentModel}. Supported models: ${Object.keys(EMBEDDING_CONFIG.supportedModels).join(', ')}`);
  }
  
  // Check dimension compatibility
  const modelConfig = EMBEDDING_CONFIG.supportedModels[currentModel];
  if (currentModel === 'text-embedding-3-small' && currentDimensions > 1536) {
    throw new Error(`text-embedding-3-small supports maximum 1536 dimensions, got ${currentDimensions}`);
  }
  
  if (currentModel === 'text-embedding-3-large' && currentDimensions > 3072) {
    throw new Error(`text-embedding-3-large supports maximum 3072 dimensions, got ${currentDimensions}`);
  }
  
  // Warn about non-standard dimensions
  if (currentModel === 'text-embedding-ada-002' && currentDimensions !== 1536) {
    console.warn(`⚠️ Using non-standard dimensions (${currentDimensions}) for text-embedding-ada-002. Standard is 1536.`);
  }
  
  if (currentModel === 'text-embedding-3-small' && currentDimensions !== 1536) {
    console.warn(`⚠️ Using non-standard dimensions (${currentDimensions}) for text-embedding-3-small. Standard is 1536.`);
  }
  
  if (currentModel === 'text-embedding-3-large' && currentDimensions !== 3072 && currentDimensions !== 768) {
    console.warn(`⚠️ Using non-standard dimensions (${currentDimensions}) for text-embedding-3-large. Standard is 3072, reduced is 768.`);
  }
  
  console.log(`✅ Embedding configuration validated: ${currentModel} with ${currentDimensions} dimensions`);
}

/**
 * Get embedding API headers for OpenAI requests
 */
export function getEmbeddingHeaders(): Record<string, string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }
  
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'User-Agent': 'Material-Kai-Vision-Platform/1.0'
  };
}

/**
 * Create embedding request payload
 */
export function createEmbeddingPayload(input: string | string[]): object {
  return {
    model: EMBEDDING_CONFIG.model,
    input: input,
    dimensions: EMBEDDING_CONFIG.dimensions,
    encoding_format: 'float'
  };
}

/**
 * Utility to check if current configuration is MIVAA compatible
 */
export function isMivaaCompatible(): boolean {
  return EMBEDDING_CONFIG.model === 'text-embedding-ada-002' && EMBEDDING_CONFIG.dimensions === 1536;
}

/**
 * Get migration recommendations if current config is not optimal
 */
export function getMigrationRecommendations(): string[] {
  const recommendations: string[] = [];
  
  if (!isMivaaCompatible()) {
    recommendations.push('Consider using text-embedding-ada-002 with 1536 dimensions for MIVAA compatibility');
  }
  
  if (EMBEDDING_CONFIG.model === 'text-embedding-3-large' && EMBEDDING_CONFIG.dimensions === 3072) {
    recommendations.push('Consider reducing dimensions to 1536 for better performance and MIVAA compatibility');
  }
  
  if (EMBEDDING_CONFIG.model === 'text-embedding-3-small' && EMBEDDING_CONFIG.dimensions === 512) {
    recommendations.push('Consider upgrading to 1536 dimensions for better semantic understanding');
  }
  
  return recommendations;
}

// Validate configuration on module load
try {
  validateEmbeddingConfig();
} catch (error) {
  console.error('❌ Embedding configuration validation failed:', error);
  // Don't throw in production, just log the error
  if (process.env.NODE_ENV !== 'production') {
    throw error;
  }
}