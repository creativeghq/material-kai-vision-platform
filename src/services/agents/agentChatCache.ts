/**
 * Agent Chat Cache Service
 *
 * Implements semantic caching for agent chat responses.
 * Uses query normalization and similarity matching for cache hits.
 */

import { CacheService, defaultCacheConfigs } from '../cache/cacheService';

// Dedicated cache instance for agent chat with longer TTL
const agentChatCache = new CacheService({
  maxSize: 200,
  defaultTtl: 30 * 60 * 1000, // 30 minutes
  strategy: 'lru',
  enableMetrics: true,
});

interface CachedAgentResponse {
  text: string;
  agentId: string;
  model?: string;
  products?: any[];
  timestamp: number;
  queryHash: string;
}

/**
 * Normalize query for cache key generation
 * - Lowercase
 * - Remove extra whitespace
 * - Remove punctuation
 * - Sort words for semantic similarity
 */
function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generate a cache key from query and context
 */
function generateCacheKey(
  query: string,
  agentId: string,
  workspaceId?: string,
): string {
  const normalized = normalizeQuery(query);
  // Include workspace to ensure cache isolation
  return `agent:${agentId}:${workspaceId || 'default'}:${normalized}`;
}

/**
 * Check if two queries are semantically similar enough for cache hit
 * Uses simple word overlap for now - could be enhanced with embeddings
 */
function isSimilarQuery(query1: string, query2: string, threshold = 0.8): boolean {
  const words1 = new Set(normalizeQuery(query1).split(' '));
  const words2 = new Set(normalizeQuery(query2).split(' '));

  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);

  const similarity = intersection.size / union.size;
  return similarity >= threshold;
}

/**
 * Get cached response if available
 */
export function getCachedResponse(
  query: string,
  agentId: string,
  workspaceId?: string,
): CachedAgentResponse | null {
  const cacheKey = generateCacheKey(query, agentId, workspaceId);
  return agentChatCache.get<CachedAgentResponse>(cacheKey);
}

/**
 * Cache an agent response
 */
export function cacheResponse(
  query: string,
  agentId: string,
  response: {
    text: string;
    model?: string;
    products?: any[];
  },
  workspaceId?: string,
  ttl?: number,
): void {
  const cacheKey = generateCacheKey(query, agentId, workspaceId);

  agentChatCache.set<CachedAgentResponse>(
    cacheKey,
    {
      text: response.text,
      agentId,
      model: response.model,
      products: response.products,
      timestamp: Date.now(),
      queryHash: normalizeQuery(query),
    },
    ttl,
  );
}

/**
 * Invalidate cache for a specific agent or workspace
 */
export function invalidateAgentCache(agentId?: string, workspaceId?: string): number {
  // Get all entries and filter by prefix
  const prefix = agentId
    ? `agent:${agentId}:${workspaceId || ''}`
    : 'agent:';

  // Note: CacheService doesn't have prefix deletion, so we'd need to track keys
  // For now, clear all agent cache
  agentChatCache.clear();
  return 0;
}

/**
 * Get cache metrics
 */
export function getAgentCacheMetrics() {
  return agentChatCache.getMetrics();
}

/**
 * Clean expired entries
 */
export function cleanExpiredCache(): number {
  return agentChatCache.cleanExpired();
}

export { agentChatCache, normalizeQuery, generateCacheKey, isSimilarQuery };

