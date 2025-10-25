/**
 * Embedding Utilities
 *
 * Helper functions for:
 * - Fetching embeddings from database
 * - Calculating cosine similarity
 * - Caching utilities
 * - Embedding validation
 */

import { supabase } from '@/integrations/supabase/client';

/**
 * Fetch image CLIP embedding from database
 */
export async function getImageClipEmbedding(imageId: string): Promise<number[] | null> {
  try {
    const { data, error } = await supabase
      .from('embeddings')
      .select('embedding_vector')
      .eq('entity_id', imageId)
      .eq('entity_type', 'image')
      .eq('embedding_type', 'visual_clip_512')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }

    return data?.embedding_vector || null;
  } catch (error) {
    console.error(`Error retrieving CLIP embedding for image ${imageId}:`, error);
    return null;
  }
}

/**
 * Fetch product CLIP embedding from database
 */
export async function getProductClipEmbedding(productId: string): Promise<number[] | null> {
  try {
    const { data, error } = await supabase
      .from('embeddings')
      .select('embedding_vector')
      .eq('entity_id', productId)
      .eq('entity_type', 'product')
      .eq('embedding_type', 'visual_clip_512')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }

    return data?.embedding_vector || null;
  } catch (error) {
    console.error(`Error retrieving CLIP embedding for product ${productId}:`, error);
    return null;
  }
}

/**
 * Fetch any embedding from database
 */
export async function getEmbedding(
  entityId: string,
  entityType: 'product' | 'chunk' | 'image',
  embeddingType: string
): Promise<number[] | null> {
  try {
    const { data, error } = await supabase
      .from('embeddings')
      .select('embedding_vector')
      .eq('entity_id', entityId)
      .eq('entity_type', entityType)
      .eq('embedding_type', embeddingType)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Not found
      }
      throw error;
    }

    return data?.embedding_vector || null;
  } catch (error) {
    console.error(`Error retrieving ${embeddingType} embedding for ${entityId}:`, error);
    return null;
  }
}

/**
 * Calculate cosine similarity between two embeddings
 *
 * Returns a value between -1 and 1, where:
 * - 1 means identical direction (perfect similarity)
 * - 0 means orthogonal (no similarity)
 * - -1 means opposite direction
 *
 * For normalized embeddings (like CLIP), values are typically 0-1
 */
export function calculateCosineSimilarity(vec1: number[], vec2: number[]): number {
  if (!vec1 || !vec2 || vec1.length === 0 || vec2.length === 0) {
    return 0;
  }

  if (vec1.length !== vec2.length) {
    console.warn(`Vector dimensions don't match: ${vec1.length} vs ${vec2.length}`);
    return 0;
  }

  // Calculate dot product
  const dotProduct = vec1.reduce((sum, val, i) => sum + val * vec2[i], 0);

  // Calculate magnitudes
  const magnitude1 = Math.sqrt(vec1.reduce((sum, val) => sum + val * val, 0));
  const magnitude2 = Math.sqrt(vec2.reduce((sum, val) => sum + val * val, 0));

  // Avoid division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  // Return cosine similarity
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Calculate Euclidean distance between two embeddings
 *
 * Returns the L2 distance. Smaller values indicate more similar embeddings.
 */
export function calculateEuclideanDistance(vec1: number[], vec2: number[]): number {
  if (!vec1 || !vec2 || vec1.length === 0 || vec2.length === 0) {
    return Infinity;
  }

  if (vec1.length !== vec2.length) {
    console.warn(`Vector dimensions don't match: ${vec1.length} vs ${vec2.length}`);
    return Infinity;
  }

  const sumSquaredDifferences = vec1.reduce((sum, val, i) => {
    const diff = val - vec2[i];
    return sum + diff * diff;
  }, 0);

  return Math.sqrt(sumSquaredDifferences);
}

/**
 * Normalize embedding vector to unit length
 */
export function normalizeEmbedding(embedding: number[]): number[] {
  if (!embedding || embedding.length === 0) {
    return [];
  }

  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

  if (magnitude === 0) {
    return embedding;
  }

  return embedding.map(val => val / magnitude);
}

/**
 * Validate embedding vector
 */
export function isValidEmbedding(embedding: any): boolean {
  if (!Array.isArray(embedding)) {
    return false;
  }

  if (embedding.length === 0) {
    return false;
  }

  return embedding.every(val => typeof val === 'number' && isFinite(val));
}

/**
 * Get embedding statistics
 */
export function getEmbeddingStats(embedding: number[]): {
  mean: number;
  std: number;
  min: number;
  max: number;
  magnitude: number;
} {
  if (!embedding || embedding.length === 0) {
    return { mean: 0, std: 0, min: 0, max: 0, magnitude: 0 };
  }

  const mean = embedding.reduce((a, b) => a + b, 0) / embedding.length;
  const variance = embedding.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / embedding.length;
  const std = Math.sqrt(variance);
  const min = Math.min(...embedding);
  const max = Math.max(...embedding);
  const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));

  return { mean, std, min, max, magnitude };
}

/**
 * Simple in-memory cache for embeddings
 */
export class EmbeddingCache {
  private cache: Map<string, { embedding: number[]; timestamp: number }> = new Map();
  private readonly TTL_MS = 1000 * 60 * 60; // 1 hour

  set(key: string, embedding: number[]): void {
    this.cache.set(key, {
      embedding,
      timestamp: Date.now(),
    });
  }

  get(key: string): number[] | null {
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL_MS) {
      this.cache.delete(key);
      return null;
    }

    return entry.embedding;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  clear(): void {
    this.cache.clear();
  }

  size(): number {
    return this.cache.size;
  }
}

// Export singleton cache instance
export const embeddingCache = new EmbeddingCache();

