/**
 * Centralized Caching Service
 *
 * Provides a unified interface for all caching operations across the application.
 * Supports multiple cache strategies and automatic cache invalidation.
 */

export interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  accessCount: number;
  lastAccessed: number;
}

export interface CacheConfig {
  maxSize: number;
  defaultTtl: number;
  strategy: 'lru' | 'fifo' | 'lfu';
  enableMetrics: boolean;
}

export interface CacheMetrics {
  hits: number;
  misses: number;
  evictions: number;
  totalRequests: number;
  hitRate: number;
  memoryUsage: number;
}

export class CacheService {
  private cache = new Map<string, CacheEntry>();
  private accessOrder: string[] = [];
  private metrics: CacheMetrics = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalRequests: 0,
    hitRate: 0,
    memoryUsage: 0,
  };

  constructor(private config: CacheConfig) {}

  /**
   * Get value from cache
   */
  get<T>(key: string): T | null {
    this.metrics.totalRequests++;

    const entry = this.cache.get(key);
    if (!entry) {
      this.metrics.misses++;
      this.updateHitRate();
      return null;
    }

    // Check if entry has expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.metrics.misses++;
      this.updateHitRate();
      return null;
    }

    // Update access information
    entry.accessCount++;
    entry.lastAccessed = Date.now();
    this.updateAccessOrder(key);

    this.metrics.hits++;
    this.updateHitRate();
    return entry.data as T;
  }

  /**
   * Set value in cache
   */
  set<T>(key: string, data: T, ttl?: number): void {
    const actualTtl = ttl || this.config.defaultTtl;

    // Check if we need to evict entries
    if (this.cache.size >= this.config.maxSize && !this.cache.has(key)) {
      this.evictEntry();
    }

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: actualTtl,
      accessCount: 1,
      lastAccessed: Date.now(),
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.updateMemoryUsage();
  }

  /**
   * Delete value from cache
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);
    if (deleted) {
      this.removeFromAccessOrder(key);
      this.updateMemoryUsage();
    }
    return deleted;
  }

  /**
   * Check if key exists in cache
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      return false;
    }

    return true;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.resetMetrics();
  }

  /**
   * Get cache statistics
   */
  getMetrics(): CacheMetrics {
    this.updateMemoryUsage();
    return { ...this.metrics };
  }

  /**
   * Get cache size
   */
  size(): number {
    return this.cache.size;
  }

  /**
   * Clean expired entries
   */
  cleanExpired(): number {
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.updateMemoryUsage();
    }

    return cleaned;
  }

  /**
   * Get or set pattern - fetch data if not in cache
   */
  async getOrSet<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const data = await fetcher();
    this.set(key, data, ttl);
    return data;
  }

  /**
   * Invalidate cache entries by pattern
   */
  invalidatePattern(pattern: string): number {
    let invalidated = 0;
    const regex = new RegExp(pattern);

    for (const key of this.cache.keys()) {
      if (regex.test(key)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        invalidated++;
      }
    }

    if (invalidated > 0) {
      this.updateMemoryUsage();
    }

    return invalidated;
  }

  /**
   * Check if cache entry is expired
   */
  private isExpired(entry: CacheEntry): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  /**
   * Evict entry based on strategy
   */
  private evictEntry(): void {
    let keyToEvict: string | undefined;

    switch (this.config.strategy) {
      case 'lru':
        keyToEvict = this.accessOrder[0];
        break;
      case 'fifo':
        keyToEvict = this.accessOrder[0];
        break;
      case 'lfu':
        keyToEvict = this.findLeastFrequentlyUsed();
        break;
    }

    if (keyToEvict) {
      this.cache.delete(keyToEvict);
      this.removeFromAccessOrder(keyToEvict);
      this.metrics.evictions++;
    }
  }

  /**
   * Find least frequently used key
   */
  private findLeastFrequentlyUsed(): string | undefined {
    let minAccessCount = Infinity;
    let leastUsedKey: string | undefined;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.accessCount < minAccessCount) {
        minAccessCount = entry.accessCount;
        leastUsedKey = key;
      }
    }

    return leastUsedKey;
  }

  /**
   * Update access order for LRU/FIFO strategies
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Update hit rate metric
   */
  private updateHitRate(): void {
    this.metrics.hitRate = this.metrics.totalRequests > 0
      ? this.metrics.hits / this.metrics.totalRequests
      : 0;
  }

  /**
   * Update memory usage estimate
   */
  private updateMemoryUsage(): void {
    let totalSize = 0;
    for (const entry of this.cache.values()) {
      totalSize += this.estimateEntrySize(entry);
    }
    this.metrics.memoryUsage = totalSize;
  }

  /**
   * Estimate size of cache entry in bytes
   */
  private estimateEntrySize(entry: CacheEntry): number {
    try {
      return JSON.stringify(entry).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default estimate if serialization fails
    }
  }

  /**
   * Reset metrics
   */
  private resetMetrics(): void {
    this.metrics = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalRequests: 0,
      hitRate: 0,
      memoryUsage: 0,
    };
  }
}

/**
 * Default cache configurations
 */
export const defaultCacheConfigs = {
  small: {
    maxSize: 100,
    defaultTtl: 5 * 60 * 1000, // 5 minutes
    strategy: 'lru' as const,
    enableMetrics: true,
  },
  medium: {
    maxSize: 500,
    defaultTtl: 15 * 60 * 1000, // 15 minutes
    strategy: 'lru' as const,
    enableMetrics: true,
  },
  large: {
    maxSize: 1000,
    defaultTtl: 60 * 60 * 1000, // 1 hour
    strategy: 'lru' as const,
    enableMetrics: true,
  },
} as const;

/**
 * Global cache instances
 */
export const globalCaches = {
  api: new CacheService(defaultCacheConfigs.medium),
  embeddings: new CacheService(defaultCacheConfigs.large),
  ui: new CacheService(defaultCacheConfigs.small),
  ml: new CacheService(defaultCacheConfigs.large),
} as const;
