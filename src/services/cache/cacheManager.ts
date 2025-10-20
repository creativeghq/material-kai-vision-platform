/**
 * Cache Manager
 *
 * Centralized management for all cache instances across the application.
 * Provides cache coordination, cleanup, and monitoring capabilities.
 */

import { CacheService, CacheMetrics, globalCaches } from './cacheService';

export interface CacheManagerConfig {
  cleanupInterval: number; // milliseconds
  enableAutoCleanup: boolean;
  enableMetricsCollection: boolean;
  metricsInterval: number; // milliseconds
}

export interface GlobalCacheMetrics {
  api: CacheMetrics;
  embeddings: CacheMetrics;
  ui: CacheMetrics;
  ml: CacheMetrics;
  total: {
    totalEntries: number;
    totalMemoryUsage: number;
    averageHitRate: number;
    totalRequests: number;
  };
}

export class CacheManager {
  private cleanupTimer?: NodeJS.Timeout;
  private metricsTimer?: NodeJS.Timeout;
  private isInitialized = false;

  constructor(private config: CacheManagerConfig) {}

  /**
   * Initialize cache manager
   */
  initialize(): void {
    if (this.isInitialized) {
      console.warn('Cache manager already initialized');
      return;
    }

    console.log('🗄️ Initializing Cache Manager...');

    if (this.config.enableAutoCleanup) {
      this.startCleanupTimer();
    }

    if (this.config.enableMetricsCollection) {
      this.startMetricsCollection();
    }

    this.isInitialized = true;
    console.log('✅ Cache Manager initialized successfully');
  }

  /**
   * Shutdown cache manager
   */
  shutdown(): void {
    if (!this.isInitialized) return;

    console.log('🛑 Shutting down Cache Manager...');

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = undefined;
    }

    this.isInitialized = false;
    console.log('✅ Cache Manager shutdown complete');
  }

  /**
   * Get specific cache instance
   */
  getCache(name: keyof typeof globalCaches): CacheService {
    return globalCaches[name];
  }

  /**
   * Clear all caches
   */
  clearAll(): void {
    console.log('🧹 Clearing all caches...');

    Object.values(globalCaches).forEach(cache => {
      cache.clear();
    });

    console.log('✅ All caches cleared');
  }

  /**
   * Clean expired entries from all caches
   */
  cleanExpired(): { [K in keyof typeof globalCaches]: number } {
    const results = {} as any;

    for (const [name, cache] of Object.entries(globalCaches)) {
      results[name] = cache.cleanExpired();
    }

    const totalCleaned = Object.values(results).reduce((sum: number, count: any) => sum + (count as number), 0);
    if (totalCleaned > 0) {
      console.log(`🧹 Cleaned ${totalCleaned} expired cache entries`);
    }

    return results;
  }

  /**
   * Get comprehensive metrics for all caches
   */
  getGlobalMetrics(): GlobalCacheMetrics {
    const metrics: GlobalCacheMetrics = {
      api: globalCaches.api.getMetrics(),
      embeddings: globalCaches.embeddings.getMetrics(),
      ui: globalCaches.ui.getMetrics(),
      ml: globalCaches.ml.getMetrics(),
      total: {
        totalEntries: 0,
        totalMemoryUsage: 0,
        averageHitRate: 0,
        totalRequests: 0,
      },
    };

    // Calculate totals
    const cacheMetrics = [metrics.api, metrics.embeddings, metrics.ui, metrics.ml];

    metrics.total.totalEntries = Object.values(globalCaches).reduce(
      (sum, cache) => sum + cache.size(),
      0,
    );

    metrics.total.totalMemoryUsage = cacheMetrics.reduce(
      (sum, metric) => sum + metric.memoryUsage,
      0,
    );

    metrics.total.totalRequests = cacheMetrics.reduce(
      (sum, metric) => sum + metric.totalRequests,
      0,
    );

    // Calculate average hit rate weighted by requests
    if (metrics.total.totalRequests > 0) {
      const weightedHitRate = cacheMetrics.reduce(
        (sum, metric) => sum + (metric.hitRate * metric.totalRequests),
        0,
      );
      metrics.total.averageHitRate = weightedHitRate / metrics.total.totalRequests;
    }

    return metrics;
  }

  /**
   * Invalidate cache entries by pattern across all caches
   */
  invalidatePattern(pattern: string): { [K in keyof typeof globalCaches]: number } {
    const results = {} as any;

    for (const [name, cache] of Object.entries(globalCaches)) {
      results[name] = cache.invalidatePattern(pattern);
    }

    const totalInvalidated = Object.values(results).reduce((sum: number, count: any) => sum + (count as number), 0);
    if (totalInvalidated > 0) {
      console.log(`🗑️ Invalidated ${totalInvalidated} cache entries matching pattern: ${pattern}`);
    }

    return results;
  }

  /**
   * Get cache health status
   */
  getHealthStatus(): {
    healthy: boolean;
    issues: string[];
    metrics: GlobalCacheMetrics;
  } {
    const metrics = this.getGlobalMetrics();
    const issues: string[] = [];

    // Check for potential issues
    if (metrics.total.averageHitRate < 0.5) {
      issues.push('Low cache hit rate (< 50%)');
    }

    if (metrics.total.totalMemoryUsage > 100 * 1024 * 1024) { // 100MB
      issues.push('High memory usage (> 100MB)');
    }

    // Check individual cache health
    Object.entries(globalCaches).forEach(([name, cache]) => {
      const cacheMetrics = cache.getMetrics();

      if (cacheMetrics.evictions > cacheMetrics.hits * 0.1) {
        issues.push(`High eviction rate in ${name} cache`);
      }
    });

    return {
      healthy: issues.length === 0,
      issues,
      metrics,
    };
  }

  /**
   * Optimize cache configurations based on usage patterns
   */
  optimizeCaches(): void {
    console.log('🔧 Optimizing cache configurations...');

    // Log optimization suggestions
    Object.entries(globalCaches).forEach(([name, cache]) => {
      const cacheMetrics = cache.getMetrics();

      if (cacheMetrics.hitRate < 0.3) {
        console.log(`💡 Consider increasing TTL for ${name} cache (low hit rate: ${(cacheMetrics.hitRate * 100).toFixed(1)}%)`);
      }

      if (cacheMetrics.evictions > cacheMetrics.hits * 0.2) {
        console.log(`💡 Consider increasing size for ${name} cache (high eviction rate)`);
      }
    });

    console.log('✅ Cache optimization analysis complete');
  }

  /**
   * Start automatic cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanExpired();
    }, this.config.cleanupInterval);

    console.log(`🕒 Auto-cleanup enabled (interval: ${this.config.cleanupInterval}ms)`);
  }

  /**
   * Start metrics collection timer
   */
  private startMetricsCollection(): void {
    this.metricsTimer = setInterval(() => {
      const metrics = this.getGlobalMetrics();

      // Log metrics if there's significant activity
      if (metrics.total.totalRequests > 0) {
        console.log('📊 Cache Metrics:', {
          entries: metrics.total.totalEntries,
          hitRate: `${(metrics.total.averageHitRate * 100).toFixed(1)}%`,
          memoryMB: `${(metrics.total.totalMemoryUsage / (1024 * 1024)).toFixed(2)}MB`,
          requests: metrics.total.totalRequests,
        });
      }
    }, this.config.metricsInterval);

    console.log(`📊 Metrics collection enabled (interval: ${this.config.metricsInterval}ms)`);
  }
}

/**
 * Default cache manager configuration
 */
export const defaultCacheManagerConfig: CacheManagerConfig = {
  cleanupInterval: 5 * 60 * 1000, // 5 minutes
  enableAutoCleanup: true,
  enableMetricsCollection: true,
  metricsInterval: 10 * 60 * 1000, // 10 minutes
};

/**
 * Global cache manager instance
 */
export const cacheManager = new CacheManager(defaultCacheManagerConfig);

/**
 * Initialize cache manager on module load
 */
if (typeof window !== 'undefined') {
  // Browser environment
  cacheManager.initialize();

  // Cleanup on page unload
  window.addEventListener('beforeunload', () => {
    cacheManager.shutdown();
  });
} else {
  // Server environment
  cacheManager.initialize();

  // Cleanup on process exit
  process.on('exit', () => {
    cacheManager.shutdown();
  });

  process.on('SIGINT', () => {
    cacheManager.shutdown();
    process.exit(0);
  });
}

/**
 * Export cache utilities for easy access
 */
export const cache = {
  api: globalCaches.api,
  embeddings: globalCaches.embeddings,
  ui: globalCaches.ui,
  ml: globalCaches.ml,
  manager: cacheManager,
} as const;
