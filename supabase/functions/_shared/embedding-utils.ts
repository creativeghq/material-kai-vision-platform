/**
 * Shared Embedding Utilities for Supabase Functions
 *
 * This module provides centralized embedding generation utilities that ensure
 * consistency across all Supabase Edge Functions. It uses the same configuration
 * standards as the frontend application.
 *
 * Environment Variables Required:
 * - EMBEDDING_MODEL: The OpenAI embedding model to use (default: text-embedding-ada-002)
 * - EMBEDDING_DIMENSIONS: The vector dimensions (default: 1536)
 * - OPENAI_API_KEY: OpenAI API key for embedding generation
 */

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingError {
  error: string;
  code?: string;
  details?: any;
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, fallback: string = ''): string {
  // @ts-ignore - Deno is available in Supabase Edge Functions
  return Deno.env.get(key) || fallback;
}

/**
 * Configuration for embedding generation
 */
export const EMBEDDING_CONFIG = {
  model: getEnv('EMBEDDING_MODEL', 'text-embedding-ada-002'),
  dimensions: parseInt(getEnv('EMBEDDING_DIMENSIONS', '1536')),
  maxTokens: 8191,
  maxRetries: 3,
  retryDelay: 1000,
  requestTimeout: 30000,

  // Supported models and their configurations
  supportedModels: {
    'text-embedding-ada-002': { maxDimensions: 1536, defaultDimensions: 1536 },
    'text-embedding-3-small': { maxDimensions: 1536, defaultDimensions: 1536 },
    'text-embedding-3-large': { maxDimensions: 3072, defaultDimensions: 3072 },
  },
} as const;

/**
 * Validate embedding configuration
 */
function validateConfig(): void {
  const model = EMBEDDING_CONFIG.model;
  const dimensions = EMBEDDING_CONFIG.dimensions;

  if (!EMBEDDING_CONFIG.supportedModels[model as keyof typeof EMBEDDING_CONFIG.supportedModels]) {
    throw new Error(`Unsupported embedding model: ${model}`);
  }

  const modelConfig = EMBEDDING_CONFIG.supportedModels[model as keyof typeof EMBEDDING_CONFIG.supportedModels];
  if (dimensions > modelConfig.maxDimensions) {
    throw new Error(`Model ${model} supports maximum ${modelConfig.maxDimensions} dimensions, got ${dimensions}`);
  }

  console.log(`✅ Embedding config validated: ${model} with ${dimensions} dimensions`);
}

/**
 * Generate standard embedding using the configured model and dimensions
 *
 * @param text - The text to generate embeddings for
 * @returns Promise<number[]> - The embedding vector
 * @throws Error if embedding generation fails
 */
export async function generateStandardEmbedding(text: string): Promise<number[]> {
  const openAIApiKey = Deno.env.get('OPENAI_API_KEY');
  if (!openAIApiKey) {
    throw new Error('OPENAI_API_KEY environment variable is required');
  }

  // Validate and truncate text if necessary
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

  let lastError: Error | null = null;

  // Retry logic
  for (let attempt = 1; attempt <= EMBEDDING_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔄 Generating embedding (attempt ${attempt}/${EMBEDDING_CONFIG.maxRetries})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EMBEDDING_CONFIG.requestTimeout);

      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAIApiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0',
        },
        body: JSON.stringify({
          model: EMBEDDING_CONFIG.model,
          input: truncatedText,
          dimensions: EMBEDDING_CONFIG.dimensions,
          encoding_format: 'float',
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const data = await response.json();
      const embedding = data.data[0].embedding;

      // Validate embedding dimensions
      if (embedding.length !== EMBEDDING_CONFIG.dimensions) {
        throw new Error(`Invalid embedding dimensions: expected ${EMBEDDING_CONFIG.dimensions}, got ${embedding.length}`);
      }

      console.log(`✅ Embedding generated successfully: ${embedding.length} dimensions`);
      return embedding;

    } catch (error) {
      lastError = error as Error;
      console.error(`❌ Embedding generation attempt ${attempt} failed:`, error);

      // Don't retry on certain errors
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          throw error; // Authentication errors shouldn't be retried
        }
        if (error.message.includes('Invalid embedding dimensions')) {
          throw error; // Configuration errors shouldn't be retried
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < EMBEDDING_CONFIG.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, EMBEDDING_CONFIG.retryDelay * attempt));
      }
    }
  }

  throw new Error(`Failed to generate embedding after ${EMBEDDING_CONFIG.maxRetries} attempts. Last error: ${lastError?.message}`);
}

/**
 * Generate embeddings for multiple texts in batch
 *
 * @param texts - Array of texts to generate embeddings for
 * @param batchSize - Number of texts to process in each batch (default: 10)
 * @returns Promise<number[][]> - Array of embedding vectors
 */
export async function generateBatchEmbeddings(texts: string[], batchSize: number = 10): Promise<number[][]> {
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    console.log(`🔄 Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(texts.length / batchSize)}`);

    const batchPromises = batch.map(text => generateStandardEmbedding(text));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Small delay between batches to avoid rate limiting
    if (i + batchSize < texts.length) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  return results;
}

/**
 * Calculate cosine similarity between two embeddings
 *
 * @param embedding1 - First embedding vector
 * @param embedding2 - Second embedding vector
 * @returns number - Cosine similarity score (0-1)
 */
export function calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error('Embeddings must have the same dimensions');
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }

  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

/**
 * Format embedding for database storage (as comma-separated string)
 *
 * @param embedding - The embedding vector
 * @returns string - Formatted embedding string
 */
export function formatEmbeddingForDB(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}

/**
 * Parse embedding from database storage format
 *
 * @param embeddingString - The stored embedding string
 * @returns number[] - Parsed embedding vector
 */
export function parseEmbeddingFromDB(embeddingString: string): number[] {
  try {
    // Remove brackets and split by comma
    const cleanString = embeddingString.replace(/^\[|\]$/g, '');
    return cleanString.split(',').map(num => parseFloat(num.trim()));
  } catch (error) {
    throw new Error(`Failed to parse embedding from database: ${error}`);
  }
}

/**
 * Validate that an embedding meets the current configuration requirements
 *
 * @param embedding - The embedding to validate
 * @returns boolean - True if valid
 */
export function validateEmbedding(embedding: number[]): boolean {
  if (!Array.isArray(embedding)) {
    return false;
  }

  if (embedding.length !== EMBEDDING_CONFIG.dimensions) {
    return false;
  }

  // Check that all values are finite numbers
  return embedding.every(val => typeof val === 'number' && isFinite(val));
}

/**
 * Get current embedding configuration info
 *
 * @returns object - Current configuration details
 */
export function getEmbeddingInfo() {
  return {
    model: EMBEDDING_CONFIG.model,
    dimensions: EMBEDDING_CONFIG.dimensions,
    maxTokens: EMBEDDING_CONFIG.maxTokens,
    supportedModels: Object.keys(EMBEDDING_CONFIG.supportedModels),
    isMivaaCompatible: EMBEDDING_CONFIG.model === 'text-embedding-ada-002' && EMBEDDING_CONFIG.dimensions === 1536,
  };
}

/**
 * Create a standardized error response for embedding operations
 *
 * @param message - Error message
 * @param code - Optional error code
 * @param details - Optional error details
 * @returns Response - Standardized error response
 */
export function createEmbeddingErrorResponse(message: string, code?: string, details?: any): Response {
  const errorResponse: EmbeddingError = {
    error: message,
    ...(code && { code }),
    ...(details && { details }),
  };

  return new Response(JSON.stringify(errorResponse), {
    status: 500,
    headers: { 'Content-Type': 'application/json' },
  });
}

// Validate configuration on module load
try {
  validateConfig();
} catch (error) {
  console.error('❌ Embedding configuration validation failed:', error);
  // In Edge Functions, we want to fail fast on configuration errors
  throw error;
}

// Log configuration info
console.log('📊 Embedding Utils Initialized:', getEmbeddingInfo());
