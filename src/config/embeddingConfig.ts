/**
 * Unified Embedding Configuration
 * 
 * This configuration ensures consistency across all services that generate
 * or use embeddings in the Material Kai Vision Platform.
 */

export interface EmbeddingModelConfig {
  name: string;
  provider: 'openai' | 'huggingface' | 'mivaa';
  dimensions: number;
  maxTokens: number;
  costPerToken: number;
  normalization: 'l2' | 'none';
  batchSize: number;
}

export interface UnifiedEmbeddingConfig {
  primary: EmbeddingModelConfig;
  fallback: EmbeddingModelConfig[];
  textPreprocessing: {
    maxLength: number;
    truncateStrategy: 'head' | 'tail' | 'middle';
    normalization: {
      lowercase: boolean;
      removeSpecialChars: boolean;
      removeExtraWhitespace: boolean;
      removeNewlines: boolean;
    };
  };
  caching: {
    enabled: boolean;
    ttl: number;
    keyStrategy: 'content-hash' | 'content-model-hash';
  };
  validation: {
    minTextLength: number;
    maxTextLength: number;
    validateDimensions: boolean;
    validateNormalization: boolean;
  };
}

/**
 * Default embedding configuration for the platform
 */
export const DEFAULT_EMBEDDING_CONFIG: UnifiedEmbeddingConfig = {
  primary: {
    name: 'text-embedding-ada-002',
    provider: 'openai',
    dimensions: 1536,
    maxTokens: 8191,
    costPerToken: 0.0001,
    normalization: 'l2',
    batchSize: 100,
  },
  fallback: [],
  textPreprocessing: {
    maxLength: 8000, // Leave room for tokenization overhead
    truncateStrategy: 'tail',
    normalization: {
      lowercase: false, // Preserve case for material names
      removeSpecialChars: false, // Keep technical symbols
      removeExtraWhitespace: true,
      removeNewlines: false, // Preserve document structure
    },
  },
  caching: {
    enabled: true,
    ttl: 86400, // 24 hours
    keyStrategy: 'content-model-hash',
  },
  validation: {
    minTextLength: 10,
    maxTextLength: 8000,
    validateDimensions: true,
    validateNormalization: true,
  },
};

/**
 * Text preprocessing utility for consistent text handling
 */
export class TextPreprocessor {
  private config: UnifiedEmbeddingConfig['textPreprocessing'];

  constructor(config: UnifiedEmbeddingConfig['textPreprocessing'] = DEFAULT_EMBEDDING_CONFIG.textPreprocessing) {
    this.config = config;
  }

  /**
   * Normalize text according to configuration
   */
  normalize(text: string): string {
    let normalized = text;

    if (this.config.normalization.removeExtraWhitespace) {
      normalized = normalized.replace(/\s+/g, ' ');
    }

    if (this.config.normalization.removeNewlines) {
      normalized = normalized.replace(/\n+/g, ' ');
    }

    if (this.config.normalization.removeSpecialChars) {
      normalized = normalized.replace(/[^\w\s]/g, '');
    }

    if (this.config.normalization.lowercase) {
      normalized = normalized.toLowerCase();
    }

    return normalized.trim();
  }

  /**
   * Truncate text according to configuration
   */
  truncate(text: string, maxLength?: number): string {
    const limit = maxLength || this.config.maxLength;
    
    if (text.length <= limit) {
      return text;
    }

    switch (this.config.truncateStrategy) {
      case 'head':
        return text.substring(0, limit);
      case 'tail':
        return text.substring(text.length - limit);
      case 'middle':
        const halfLimit = Math.floor(limit / 2);
        return text.substring(0, halfLimit) + '...' + text.substring(text.length - halfLimit);
      default:
        return text.substring(0, limit);
    }
  }

  /**
   * Preprocess text for embedding generation
   */
  preprocess(text: string): string {
    const normalized = this.normalize(text);
    return this.truncate(normalized);
  }

  /**
   * Validate text before processing
   */
  validate(text: string): { valid: boolean; error?: string } {
    if (!text || typeof text !== 'string') {
      return { valid: false, error: 'Text must be a non-empty string' };
    }

    if (text.length < DEFAULT_EMBEDDING_CONFIG.validation.minTextLength) {
      return { valid: false, error: `Text too short (minimum ${DEFAULT_EMBEDDING_CONFIG.validation.minTextLength} characters)` };
    }

    if (text.length > DEFAULT_EMBEDDING_CONFIG.validation.maxTextLength) {
      return { valid: false, error: `Text too long (maximum ${DEFAULT_EMBEDDING_CONFIG.validation.maxTextLength} characters)` };
    }

    return { valid: true };
  }
}

/**
 * Embedding validation utilities
 */
export class EmbeddingValidator {
  /**
   * Validate embedding dimensions
   */
  static validateDimensions(embedding: number[], expectedDimensions: number): boolean {
    return embedding.length === expectedDimensions;
  }

  /**
   * Validate embedding normalization
   */
  static validateNormalization(embedding: number[], tolerance: number = 0.01): boolean {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return Math.abs(magnitude - 1.0) < tolerance;
  }

  /**
   * Normalize embedding vector
   */
  static normalizeEmbedding(embedding: number[]): number[] {
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude === 0) return embedding;
    return embedding.map(val => val / magnitude);
  }

  /**
   * Validate embedding output
   */
  static validateEmbedding(
    embedding: number[], 
    config: EmbeddingModelConfig
  ): { valid: boolean; error?: string; normalized?: number[] } {
    // Check dimensions
    if (!this.validateDimensions(embedding, config.dimensions)) {
      return { 
        valid: false, 
        error: `Invalid dimensions: expected ${config.dimensions}, got ${embedding.length}` 
      };
    }

    // Check for invalid values
    if (embedding.some(val => !isFinite(val))) {
      return { valid: false, error: 'Embedding contains invalid values (NaN or Infinity)' };
    }

    // Normalize if required
    let normalizedEmbedding = embedding;
    if (config.normalization === 'l2') {
      if (!this.validateNormalization(embedding)) {
        normalizedEmbedding = this.normalizeEmbedding(embedding);
      }
    }

    return { valid: true, normalized: normalizedEmbedding };
  }
}

/**
 * Cache key generation for embeddings
 */
export class EmbeddingCacheKey {
  /**
   * Generate cache key based on content and model
   */
  static generate(text: string, modelName: string, strategy: 'content-hash' | 'content-model-hash' = 'content-model-hash'): string {
    const crypto = require('crypto');
    
    switch (strategy) {
      case 'content-hash':
        return crypto.createHash('sha256').update(text).digest('hex');
      case 'content-model-hash':
        return crypto.createHash('sha256').update(`${modelName}:${text}`).digest('hex');
      default:
        return crypto.createHash('sha256').update(`${modelName}:${text}`).digest('hex');
    }
  }
}

/**
 * Export singleton instances
 */
export const textPreprocessor = new TextPreprocessor();
export const embeddingConfig = DEFAULT_EMBEDDING_CONFIG;
