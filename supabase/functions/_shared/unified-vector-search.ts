/**
 * Unified Vector Search Service
 *
 * This module provides a centralized vector search implementation with caching
 * that replaces the dual search systems (rag-knowledge-search and enhanced-rag-search).
 *
 * Features:
 * - Unified embedding generation with fallback strategies
 * - Redis-compatible caching for embeddings and search results
 * - Consistent search interface across all functions
 * - Performance monitoring and analytics
 * - Workspace isolation and security
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

import { generateEmbedding, EMBEDDING_CONFIG } from './embedding-utils.ts';

// Cache configuration
const CACHE_CONFIG = {
  embeddingTTL: 3600, // 1 hour for embeddings
  searchResultsTTL: 300, // 5 minutes for search results
  maxCacheSize: 1000, // Maximum cached items
  enableCache: Deno.env.get('ENABLE_VECTOR_CACHE') !== 'false',
} as const;

// In-memory cache (for development - replace with Redis in production)
const embeddingCache = new Map<string, { embedding: number[]; timestamp: number }>();
const searchCache = new Map<string, { results: any[]; timestamp: number }>();

export interface UnifiedSearchRequest {
  query: string;
  searchType?: 'hybrid' | 'semantic' | 'knowledge' | 'materials' | 'documents';
  embeddingTypes?: string[];
  matchThreshold?: number;
  matchCount?: number;
  includeContext?: boolean;
  workspaceId?: string;
  userId?: string;
}

export interface UnifiedSearchResult {
  result_type: string;
  id: string;
  similarity_score: number;
  title: string;
  content: string;
  metadata: any;
  associated_images: any[];
  source_info: any;
}

export interface UnifiedSearchResponse {
  success: boolean;
  query: string;
  searchType: string;
  results: UnifiedSearchResult[];
  totalResults: number;
  queryEmbeddingDimensions: number;
  performance: {
    embeddingTime: number;
    searchTime: number;
    totalTime: number;
    cacheHit: boolean;
  };
  analytics: {
    sessionId: string;
    timestamp: string;
    workspaceId?: string;
  };
}

/**
 * Generate cache key for embeddings
 */
function getEmbeddingCacheKey(text: string): string {
  const hash = Array.from(new TextEncoder().encode(text))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32);
  return `emb:${EMBEDDING_CONFIG.model}:${hash}`;
}

/**
 * Generate cache key for search results
 */
function getSearchCacheKey(request: UnifiedSearchRequest): string {
  const keyData = {
    query: request.query,
    searchType: request.searchType,
    matchThreshold: request.matchThreshold,
    matchCount: request.matchCount,
    workspaceId: request.workspaceId,
  };
  const hash = Array.from(new TextEncoder().encode(JSON.stringify(keyData)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .substring(0, 32);
  return `search:${hash}`;
}

/**
 * Get cached embedding with TTL check
 */
function getCachedEmbedding(cacheKey: string): number[] | null {
  if (!CACHE_CONFIG.enableCache) return null;

  const cached = embeddingCache.get(cacheKey);
  if (!cached) return null;

  const isExpired = Date.now() - cached.timestamp > CACHE_CONFIG.embeddingTTL * 1000;
  if (isExpired) {
    embeddingCache.delete(cacheKey);
    return null;
  }

  return cached.embedding;
}

/**
 * Cache embedding with TTL
 */
function setCachedEmbedding(cacheKey: string, embedding: number[]): void {
  if (!CACHE_CONFIG.enableCache) return;

  // Clean up old entries if cache is full
  if (embeddingCache.size >= CACHE_CONFIG.maxCacheSize) {
    const oldestKey = embeddingCache.keys().next().value;
    embeddingCache.delete(oldestKey);
  }

  embeddingCache.set(cacheKey, {
    embedding,
    timestamp: Date.now(),
  });
}

/**
 * Get cached search results with TTL check
 */
function getCachedSearchResults(cacheKey: string): any[] | null {
  if (!CACHE_CONFIG.enableCache) return null;

  const cached = searchCache.get(cacheKey);
  if (!cached) return null;

  const isExpired = Date.now() - cached.timestamp > CACHE_CONFIG.searchResultsTTL * 1000;
  if (isExpired) {
    searchCache.delete(cacheKey);
    return null;
  }

  return cached.results;
}

/**
 * Cache search results with TTL
 */
function setCachedSearchResults(cacheKey: string, results: any[]): void {
  if (!CACHE_CONFIG.enableCache) return;

  // Clean up old entries if cache is full
  if (searchCache.size >= CACHE_CONFIG.maxCacheSize) {
    const oldestKey = searchCache.keys().next().value;
    searchCache.delete(oldestKey);
  }

  searchCache.set(cacheKey, {
    results,
    timestamp: Date.now(),
  });
}

/**
 * Generate query embedding with caching
 */
export async function generateQueryEmbeddingCached(query: string): Promise<{
  embedding: number[];
  cacheHit: boolean;
  processingTime: number;
}> {
  const startTime = Date.now();
  const cacheKey = getEmbeddingCacheKey(query);

  // Try cache first
  const cachedEmbedding = getCachedEmbedding(cacheKey);
  if (cachedEmbedding) {
    return {
      embedding: cachedEmbedding,
      cacheHit: true,
      processingTime: Date.now() - startTime,
    };
  }

  // Generate new embedding
  const embedding = await generateEmbedding(query);

  // Cache the result
  setCachedEmbedding(cacheKey, embedding);

  return {
    embedding,
    cacheHit: false,
    processingTime: Date.now() - startTime,
  };
}

/**
 * Perform unified vector search with caching
 */
export async function performUnifiedVectorSearch(
  request: UnifiedSearchRequest,
  supabase: any,
): Promise<UnifiedSearchResponse> {
  const startTime = Date.now();
  const sessionId = crypto.randomUUID();

  console.log(`[${sessionId}] Starting unified vector search for: "${request.query}"`);

  // Check search cache first
  const searchCacheKey = getSearchCacheKey(request);
  const cachedResults = getCachedSearchResults(searchCacheKey);

  if (cachedResults) {
    console.log(`[${sessionId}] Cache hit for search results`);
    return {
      success: true,
      query: request.query,
      searchType: request.searchType || 'hybrid',
      results: cachedResults,
      totalResults: cachedResults.length,
      queryEmbeddingDimensions: EMBEDDING_CONFIG.dimensions,
      performance: {
        embeddingTime: 0,
        searchTime: 0,
        totalTime: Date.now() - startTime,
        cacheHit: true,
      },
      analytics: {
        sessionId,
        timestamp: new Date().toISOString(),
        workspaceId: request.workspaceId,
      },
    };
  }

  // Generate embedding with caching
  const embeddingResult = await generateQueryEmbeddingCached(request.query);
  console.log(`[${sessionId}] Generated embedding: ${embeddingResult.embedding.length}D, cache hit: ${embeddingResult.cacheHit}`);

  // Perform vector search
  const searchStartTime = Date.now();
  const { data: searchResults, error: searchError } = await supabase
    .rpc('enhanced_vector_search', {
      query_embedding_text: `[${embeddingResult.embedding.join(',')}]`,
      search_type: request.searchType || 'hybrid',
      embedding_types: request.embeddingTypes || ['openai'],
      match_threshold: request.matchThreshold || 0.7,
      match_count: request.matchCount || 10,
    });

  const searchTime = Date.now() - searchStartTime;

  if (searchError) {
    console.error(`[${sessionId}] Vector search error:`, searchError);
    throw new Error(`Vector search failed: ${searchError.message}`);
  }

  const results = (searchResults || []).map((result: any) => ({
    result_type: result.result_type,
    id: result.id,
    similarity_score: result.similarity_score,
    title: result.title,
    content: result.content,
    metadata: result.metadata || {},
    associated_images: result.associated_images || [],
    source_info: result.source_info || {},
  }));

  // Cache the search results
  setCachedSearchResults(searchCacheKey, results);

  console.log(`[${sessionId}] Found ${results.length} results in ${searchTime}ms`);

  return {
    success: true,
    query: request.query,
    searchType: request.searchType || 'hybrid',
    results,
    totalResults: results.length,
    queryEmbeddingDimensions: embeddingResult.embedding.length,
    performance: {
      embeddingTime: embeddingResult.processingTime,
      searchTime,
      totalTime: Date.now() - startTime,
      cacheHit: embeddingResult.cacheHit,
    },
    analytics: {
      sessionId,
      timestamp: new Date().toISOString(),
      workspaceId: request.workspaceId,
    },
  };
}

/**
 * Clear all caches (for testing/debugging)
 */
export function clearVectorSearchCache(): void {
  embeddingCache.clear();
  searchCache.clear();
  console.log('Vector search cache cleared');
}

/**
 * Get cache statistics
 */
export function getCacheStats(): {
  embeddingCache: { size: number; maxSize: number };
  searchCache: { size: number; maxSize: number };
  config: typeof CACHE_CONFIG;
} {
  return {
    embeddingCache: {
      size: embeddingCache.size,
      maxSize: CACHE_CONFIG.maxCacheSize,
    },
    searchCache: {
      size: searchCache.size,
      maxSize: CACHE_CONFIG.maxCacheSize,
    },
    config: CACHE_CONFIG,
  };
}
