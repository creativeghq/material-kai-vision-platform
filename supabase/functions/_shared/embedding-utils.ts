/**
 * Shared MIVAA Embedding Utilities for Supabase Functions
 *
 * This module provides centralized embedding generation utilities through MIVAA gateway
 * that ensure consistency across all Supabase Edge Functions. It uses the same configuration
 * standards as the frontend application but routes through MIVAA for centralized AI management.
 *
 * Environment Variables Required:
 * - MIVAA_GATEWAY_URL: Main app URL for MIVAA gateway access
 * - MIVAA_API_KEY: API key for MIVAA authentication
 * - EMBEDDING_MODEL: The embedding model to use (default: text-embedding-3-small)
 * - EMBEDDING_DIMENSIONS: The vector dimensions (default: 1536)
 */

export interface EmbeddingResponse {
  embedding: number[];
  model: string;
  dimensions: number;
  usage?: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

export interface EmbeddingError {
  error: string;
  code?: string;
  details?: any;
}

export interface SemanticAnalysisRequest {
  image_data: string;
  analysis_type?: string;
  prompt?: string;
  options?: {
    temperature?: number;
    max_tokens?: number;
  };
}

export interface SemanticAnalysisResponse {
  analysis: string;
  confidence: number;
  model_used: string;
  processing_time_ms: number;
}

/**
 * Get environment variable with fallback
 */
function getEnv(key: string, fallback: string = ''): string {
  // @ts-ignore - Deno is available in Supabase Edge Functions
  return Deno.env.get(key) || fallback;
}

/**
 * Configuration for MIVAA integration and embedding generation
 */
export const MIVAA_CONFIG = {
  gatewayUrl: getEnv('MIVAA_GATEWAY_URL', 'http://localhost:3000'),
  apiKey: getEnv('MIVAA_API_KEY', ''),
  timeout: 30000,
  maxRetries: 3,
  retryDelay: 1000,
} as const;

// Unified embedding configuration for consistency across platform
export const EMBEDDING_CONFIG = {
  model: getEnv('EMBEDDING_MODEL', 'text-embedding-ada-002'), // Changed to ada-002 for consistency
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
 * Generate standard embedding using MIVAA gateway
 *
 * @param text - The text to generate embeddings for
 * @returns Promise<number[]> - The embedding vector
 * @throws Error if embedding generation fails
 */
export async function generateStandardEmbedding(text: string): Promise<number[]> {
  if (!MIVAA_CONFIG.apiKey) {
    throw new Error('MIVAA_API_KEY environment variable is required');
  }

  // Validate and truncate text if necessary
  const truncatedText = text.length > 8000 ? text.substring(0, 8000) : text;

  let lastError: Error | null = null;

  // Retry logic
  for (let attempt = 1; attempt <= EMBEDDING_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔄 Generating embedding via MIVAA (attempt ${attempt}/${EMBEDDING_CONFIG.maxRetries})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MIVAA_CONFIG.timeout);

      const response = await fetch(`${MIVAA_CONFIG.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MIVAA_CONFIG.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0',
        },
        body: JSON.stringify({
          action: 'generate_embedding',
          payload: {
            text: truncatedText,
            model: EMBEDDING_CONFIG.model,
            dimensions: EMBEDDING_CONFIG.dimensions,
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`MIVAA gateway error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`MIVAA embedding error: ${result.error?.message || 'Unknown error'}`);
      }

      const embedding = result.data.embedding;

      // Validate embedding dimensions
      if (embedding.length !== EMBEDDING_CONFIG.dimensions) {
        throw new Error(`Invalid embedding dimensions: expected ${EMBEDDING_CONFIG.dimensions}, got ${embedding.length}`);
      }

      console.log(`✅ Embedding generated via MIVAA successfully: ${embedding.length} dimensions`);
      return embedding;

    } catch (error) {
      lastError = error as Error;
      console.error(`❌ MIVAA embedding generation attempt ${attempt} failed:`, error);

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

  throw new Error(`Failed to generate embedding via MIVAA after ${EMBEDDING_CONFIG.maxRetries} attempts. Last error: ${lastError?.message}`);
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
 * Generate semantic analysis for images using MIVAA TogetherAI/LLaMA Vision
 *
 * @param imageData - Base64 image data or image URL
 * @param analysisType - Type of analysis to perform
 * @returns Promise<string> - Generated semantic description
 */
export async function generateSemanticAnalysis(
  imageData: string,
  analysisType: string = 'material_identification'
): Promise<string> {
  if (!MIVAA_CONFIG.apiKey) {
    throw new Error('MIVAA_API_KEY environment variable is required');
  }

  const prompt = `Analyze this material image and provide a concise semantic description focusing on:
  - Material type and classification
  - Visual appearance and surface characteristics
  - Color, texture, and pattern properties
  - Potential use cases and applications
  
  Provide a clear, searchable description in 2-3 sentences.`;

  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MIVAA_CONFIG.maxRetries; attempt++) {
    try {
      console.log(`🔄 Generating semantic analysis via MIVAA (attempt ${attempt}/${MIVAA_CONFIG.maxRetries})`);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), MIVAA_CONFIG.timeout);

      const response = await fetch(`${MIVAA_CONFIG.gatewayUrl}/api/mivaa/gateway`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${MIVAA_CONFIG.apiKey}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Material-Kai-Vision-Platform-Supabase/1.0',
        },
        body: JSON.stringify({
          action: 'semantic_analysis',
          payload: {
            image_data: imageData,
            analysis_type: analysisType,
            prompt: prompt,
            options: {
              temperature: 0.1,
              max_tokens: 200,
            },
          },
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(`MIVAA gateway error: ${response.status} - ${errorData.error?.message || 'Unknown error'}`);
      }

      const result = await response.json();
      if (!result.success) {
        throw new Error(`MIVAA semantic analysis error: ${result.error?.message || 'Unknown error'}`);
      }

      console.log(`✅ Semantic analysis generated via MIVAA successfully`);
      return result.data.analysis;

    } catch (error) {
      lastError = error as Error;
      console.error(`❌ MIVAA semantic analysis attempt ${attempt} failed:`, error);

      // Don't retry on certain errors
      if (error instanceof Error) {
        if (error.message.includes('401') || error.message.includes('403')) {
          throw error; // Authentication errors shouldn't be retried
        }
      }

      // Wait before retrying (except on last attempt)
      if (attempt < MIVAA_CONFIG.maxRetries) {
        await new Promise(resolve => setTimeout(resolve, MIVAA_CONFIG.retryDelay * attempt));
      }
    }
  }

  throw new Error(`Failed to generate semantic analysis via MIVAA after ${MIVAA_CONFIG.maxRetries} attempts. Last error: ${lastError?.message}`);
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
    isMivaaEnabled: Boolean(MIVAA_CONFIG.apiKey),
    mivaaGatewayUrl: MIVAA_CONFIG.gatewayUrl,
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
