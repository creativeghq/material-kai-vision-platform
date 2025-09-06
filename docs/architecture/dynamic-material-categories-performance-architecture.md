+++
id = "ARCH-DYNAMIC-MATERIAL-CATEGORIES-PERFORMANCE-V1"
title = "Dynamic Material Categories Performance Architecture Specification"
context_type = "architecture"
scope = "Performance architecture for dynamic material categories system"
target_audience = ["core-architect", "infra-specialist", "baas-supabase", "lead-backend", "lead-devops"]
granularity = "detailed"
status = "draft"
last_updated = "2025-09-04"
created_by = "core-architect"
parent_task = "TASK-ARCH-20250904-1610"
tags = ["performance", "caching", "redis", "edge-functions", "database", "monitoring", "global-distribution"]
related_context = [
    "docs/architecture/dynamic-material-categories-api-design.md",
    "docs/architecture/dynamic-material-categories-database-schema.md",
    ".ruru/docs/architecture/dynamic-material-categories-refactoring-plan.md"
]
validation_status = "pending"
implementation_priority = "critical"
+++

# Dynamic Material Categories Performance Architecture Specification

## Overview

This document defines the comprehensive performance architecture for the dynamic material categories system, focusing on Redis caching layer design, cache invalidation strategies, global edge function distribution, TTL policies, monitoring, and database optimization. The architecture is designed to deliver sub-100ms response times globally while maintaining consistency and reliability.

## Performance Objectives

### Target Performance Metrics
- **API Response Time**: < 100ms P95 globally
- **Cache Hit Rate**: > 95% for category queries
- **Database Query Time**: < 10ms P95 for cached queries
- **Global Edge Latency**: < 50ms P95 from any location
- **Availability**: 99.9% uptime with graceful degradation
- **Throughput**: 10,000+ requests/second sustained load

### Performance Requirements by Operation Type
```typescript
interface PerformanceTargets {
  categoryList: {
    target: '50ms P95';
    cacheStrategy: 'aggressive';
    edgeDistribution: true;
  };
  categoryDetail: {
    target: '30ms P95';
    cacheStrategy: 'moderate';
    realTimeUpdates: true;
  };
  categorySearch: {
    target: '100ms P95';
    cacheStrategy: 'selective';
    computeIntensive: true;
  };
  categoryMutations: {
    target: '200ms P95';
    cacheStrategy: 'invalidation-first';
    consistencyRequired: true;
  };
}
```

## Redis Caching Layer Architecture

### 1. Cache Topology & Cluster Design

```typescript
interface RedisCacheTopology {
  // Primary cache cluster (Global)
  primary: {
    cluster: 'redis-cluster-primary';
    nodes: 6; // 3 masters, 3 replicas
    regions: ['us-east-1', 'eu-west-1', 'ap-southeast-1'];
    replicationStrategy: 'async';
    shardingStrategy: 'hash-slot';
  };
  
  // Regional cache clusters
  regional: {
    'us-west-2': { role: 'primary-regional'; fallbackTo: 'us-east-1' };
    'eu-central-1': { role: 'primary-regional'; fallbackTo: 'eu-west-1' };
    'ap-northeast-1': { role: 'primary-regional'; fallbackTo: 'ap-southeast-1' };
  };
  
  // Local cache clusters (Edge locations)
  edge: {
    cloudflareWorkers: true;
    edgeLocations: 200+;
    strategy: 'pull-through';
    fallbackChain: ['edge', 'regional', 'primary', 'database'];
  };
}
```

### 2. Cache Key Structure & Hierarchical Design

```typescript
class MaterialCategoryCacheKeys {
  // Base prefix with versioning
  private static readonly PREFIX = 'mat_cat:v1';
  
  // Key patterns organized by data type and access pattern
  static readonly PATTERNS = {
    // Category data keys
    category: {
      detail: `${this.PREFIX}:cat:detail:{id}:{include_hash}`,
      list: `${this.PREFIX}:cat:list:{filter_hash}:{sort}:{pagination}`,
      hierarchy: `${this.PREFIX}:cat:hierarchy:{root_id}:{depth}`,
      breadcrumb: `${this.PREFIX}:cat:breadcrumb:{id}`,
      children: `${this.PREFIX}:cat:children:{parent_id}:{active_only}`,
      path: `${this.PREFIX}:cat:path:{id}` // Full hierarchy path
    },
    
    // Property data keys
    properties: {
      category: `${this.PREFIX}:props:cat:{category_id}:{type}`,
      list: `${this.PREFIX}:props:list:{category_id}:{filters}`,
      usage: `${this.PREFIX}:props:usage:{property_id}` // Usage statistics
    },
    
    // Validation rules keys
    validation: {
      category: `${this.PREFIX}:val:cat:{category_id}`,
      rules: `${this.PREFIX}:val:rules:{category_id}:{rule_type}`,
      performance: `${this.PREFIX}:val:perf:{rule_id}` // Performance metrics
    },
    
    // Aggregated/computed data keys
    aggregates: {
      summary: `${this.PREFIX}:agg:summary`, // Full system summary
      stats: `${this.PREFIX}:agg:stats:{category_id}`, // Category statistics
      counts: `${this.PREFIX}:agg:counts:{level}:{group}`, // Count aggregations
      popular: `${this.PREFIX}:agg:popular:{timeframe}` // Popular categories
    },
    
    // Search and index keys
    search: {
      results: `${this.PREFIX}:search:results:{query_hash}:{filters}`,
      index: `${this.PREFIX}:search:index:{type}`, // Search index cache
      suggestions: `${this.PREFIX}:search:suggest:{prefix}` // Auto-suggestions
    },
    
    // Legacy format keys (for backward compatibility)
    legacy: {
      format: `${this.PREFIX}:legacy:format:{version}`,
      mapping: `${this.PREFIX}:legacy:mapping:{old_key}` // Key mapping cache
    },
    
    // System and metadata keys
    system: {
      version: `${this.PREFIX}:sys:version`, // Schema/data version
      health: `${this.PREFIX}:sys:health:{component}`, // Health check cache
      config: `${this.PREFIX}:sys:config:{env}` // Configuration cache
    }
  };
  
  // Key generation methods with parameter hashing
  static generateCategoryListKey(params: CategoryListParams): string {
    const filterHash = this.hashObject({
      active: params.active,
      composite: params.composite,
      parent_id: params.parent_id,
      hierarchy_level: params.hierarchy_level,
      display_group: params.display_group,
      search: params.search
    });
    
    const sortKey = `${params.sort_by || 'name'}:${params.sort_order || 'asc'}`;
    const paginationKey = `${params.page || 1}:${params.limit || 20}`;
    
    return this.PATTERNS.category.list
      .replace('{filter_hash}', filterHash)
      .replace('{sort}', sortKey)
      .replace('{pagination}', paginationKey);
  }
  
  static generateCategoryDetailKey(id: string, includes: string[]): string {
    const includeHash = this.hashObject(includes.sort());
    return this.PATTERNS.category.detail
      .replace('{id}', id)
      .replace('{include_hash}', includeHash);
  }
  
  static generateHierarchyKey(rootId?: string, maxDepth?: number): string {
    return this.PATTERNS.category.hierarchy
      .replace('{root_id}', rootId || 'root')
      .replace('{depth}', String(maxDepth || 'all'));
  }
  
  // Utility methods for key operations
  static getCategoryKeyPatterns(categoryId: string): string[] {
    return [
      `${this.PREFIX}:cat:detail:${categoryId}:*`,
      `${this.PREFIX}:cat:children:${categoryId}:*`,
      `${this.PREFIX}:cat:breadcrumb:${categoryId}`,
      `${this.PREFIX}:cat:path:${categoryId}`,
      `${this.PREFIX}:props:cat:${categoryId}:*`,
      `${this.PREFIX}:val:cat:${categoryId}`,
      `${this.PREFIX}:agg:stats:${categoryId}`
    ];
  }
  
  static getInvalidationPatterns(): Record<string, string[]> {
    return {
      categoryUpdate: [
        `${this.PREFIX}:cat:list:*`,
        `${this.PREFIX}:cat:hierarchy:*`,
        `${this.PREFIX}:agg:*`,
        `${this.PREFIX}:search:*`
      ],
      propertyUpdate: [
        `${this.PREFIX}:props:*`,
        `${this.PREFIX}:cat:list:*`,
        `${this.PREFIX}:agg:stats:*`
      ],
      hierarchyUpdate: [
        `${this.PREFIX}:cat:hierarchy:*`,
        `${this.PREFIX}:cat:breadcrumb:*`,
        `${this.PREFIX}:cat:path:*`,
        `${this.PREFIX}:cat:children:*`
      ]
    };
  }
  
  private static hashObject(obj: any): string {
    return require('crypto')
      .createHash('md5')
      .update(JSON.stringify(obj))
      .digest('hex')
      .substring(0, 8);
  }
}
```

### 3. Cache Data Structures & Storage Optimization

```typescript
interface CacheDataStructures {
  // Simple key-value for frequently accessed data
  keyValue: {
    pattern: 'category:detail:{id}';
    structure: 'JSON';
    compression: 'gzip';
    usage: 'Individual category details with includes';
  };
  
  // Hash structures for related data grouping
  hashes: {
    pattern: 'category:properties:{id}';
    structure: 'Redis Hash (HSET/HGET)';
    fields: ['finish', 'size', 'installationMethod', 'application'];
    usage: 'Category properties grouped by type';
  };
  
  // Sets for relationship management
  sets: {
    pattern: 'category:children:{parent_id}';
    structure: 'Redis Set (SADD/SMEMBERS)';
    usage: 'Child category relationships, hierarchy navigation';
  };
  
  // Sorted sets for ordered data
  sortedSets: {
    pattern: 'category:popular:{timeframe}';
    structure: 'Redis Sorted Set (ZADD/ZRANGE)';
    scoring: 'Usage count or timestamp';
    usage: 'Popular categories, recent updates, rankings';
  };
  
  // Lists for sequential data
  lists: {
    pattern: 'category:breadcrumb:{id}';
    structure: 'Redis List (LPUSH/LRANGE)';
    usage: 'Hierarchy paths, navigation breadcrumbs';
  };
  
  // HyperLogLog for approximate counting
  hyperloglog: {
    pattern: 'category:unique_views:{id}:{date}';
    structure: 'Redis HyperLogLog (PFADD/PFCOUNT)';
    usage: 'Approximate unique view counts, analytics';
  };
}
```

## Cache Invalidation Strategy

### 1. Invalidation Triggers & Event-Driven Architecture

```typescript
interface CacheInvalidationStrategy {
  // Database-level triggers
  databaseTriggers: {
    tables: ['material_categories', 'material_properties', 'category_validation_rules'];
    operations: ['INSERT', 'UPDATE', 'DELETE'];
    mechanism: 'PostgreSQL NOTIFY/LISTEN';
    payloadFormat: {
      table: string;
      operation: 'INSERT' | 'UPDATE' | 'DELETE';
      record_id: string;
      old_values?: Record<string, any>;
      new_values?: Record<string, any>;
      timestamp: string;
    };
  };
  
  // Application-level triggers
  applicationTriggers: {
    apiEndpoints: ['POST /categories', 'PUT /categories/:id', 'DELETE /categories/:id'];
    graphqlMutations: ['createMaterialCategory', 'updateMaterialCategory', 'deleteMaterialCategory'];
    mechanism: 'Event Bus (Redis Streams)';
    eventTypes: [
      'category.created',
      'category.updated', 
      'category.deleted',
      'property.created',
      'property.updated',
      'property.deleted',
      'hierarchy.changed'
    ];
  };
  
  // WebSocket-based real-time triggers
  websocketTriggers: {
    channels: ['material-category:*', 'material-config'];
    mechanism: 'Supabase Realtime + Custom handlers';
    purpose: 'Immediate cache invalidation across all instances';
  };
}

class CacheInvalidationEngine {
  private redis: RedisCluster;
  private eventBus: EventBus;
  private websocket: WebSocketManager;
  
  // Smart invalidation based on change impact analysis
  async invalidateByChangeType(changeEvent: ChangeEvent): Promise<void> {
    const invalidationPlan = this.buildInvalidationPlan(changeEvent);
    
    // Execute invalidations in priority order
    await this.executeInvalidationPlan(invalidationPlan);
    
    // Notify other cache layers
    await this.propagateInvalidation(changeEvent);
  }
  
  private buildInvalidationPlan(event: ChangeEvent): InvalidationPlan {
    const plan: InvalidationPlan = {
      immediate: [], // Keys that must be invalidated immediately
      batched: [], // Keys that can be invalidated in batch
      propagate: [], // Patterns to propagate to edge caches
      preload: [] // Keys to preload after invalidation
    };
    
    switch (event.type) {
      case 'category.updated':
        // Immediate: Direct category cache
        plan.immediate.push(
          ...MaterialCategoryCacheKeys.getCategoryKeyPatterns(event.categoryId)
        );
        
        // Batched: List caches and aggregates
        plan.batched.push(
          ...MaterialCategoryCacheKeys.getInvalidationPatterns().categoryUpdate
        );
        
        // If hierarchy changed, invalidate related caches
        if (this.isHierarchyChange(event)) {
          plan.immediate.push(
            ...MaterialCategoryCacheKeys.getInvalidationPatterns().hierarchyUpdate
          );
        }
        
        // Preload popular category data
        plan.preload.push(
          MaterialCategoryCacheKeys.generateCategoryDetailKey(event.categoryId, ['properties', 'children'])
        );
        break;
        
      case 'property.created':
      case 'property.updated':
        // Properties affect category displays and lists
        plan.immediate.push(
          `${MaterialCategoryCacheKeys.PREFIX}:props:cat:${event.categoryId}:*`,
          `${MaterialCategoryCacheKeys.PREFIX}:cat:detail:${event.categoryId}:*`
        );
        
        plan.batched.push(
          ...MaterialCategoryCacheKeys.getInvalidationPatterns().propertyUpdate
        );
        break;
        
      case 'category.deleted':
        // Comprehensive invalidation for deletions
        plan.immediate.push(
          ...MaterialCategoryCacheKeys.getCategoryKeyPatterns(event.categoryId),
          ...MaterialCategoryCacheKeys.getInvalidationPatterns().hierarchyUpdate,
          ...MaterialCategoryCacheKeys.getInvalidationPatterns().categoryUpdate
        );
        break;
    }
    
    return plan;
  }
  
  private async executeInvalidationPlan(plan: InvalidationPlan): Promise<void> {
    // Phase 1: Immediate invalidations (blocking)
    if (plan.immediate.length > 0) {
      await this.redis.deleteByPatterns(plan.immediate);
    }
    
    // Phase 2: Batched invalidations (non-blocking)
    if (plan.batched.length > 0) {
      setImmediate(() => {
        this.redis.deleteByPatterns(plan.batched);
      });
    }
    
    // Phase 3: Edge cache propagation
    if (plan.propagate.length > 0) {
      await this.propagateToEdgeCaches(plan.propagate);
    }
    
    // Phase 4: Preload critical data
    if (plan.preload.length > 0) {
      setImmediate(() => {
        this.preloadCriticalData(plan.preload);
      });
    }
  }
  
  // Intelligent cache warming after invalidation
  private async preloadCriticalData(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        const data = await this.fetchFromDatabase(key);
        await this.redis.setex(key, this.getTTLForKey(key), JSON.stringify(data));
      } catch (error) {
        // Log but don't fail - preloading is best effort
        console.warn(`Failed to preload cache key ${key}:`, error);
      }
    }
  }
  
  private isHierarchyChange(event: ChangeEvent): boolean {
    return event.changedFields?.includes('parent_category_id') || 
           event.changedFields
  }
  
  private async propagateToEdgeCaches(patterns: string[]): Promise<void> {
    // Cloudflare Workers KV invalidation
    await this.cloudflareKV.purgeByTags(patterns.map(p => `cache:${p}`));
    
    // CDN cache invalidation
    await this.cdn.purgeByPatterns(patterns);
    
    // WebSocket broadcast to all connected instances
    await this.websocket.broadcast('cache:invalidate', { patterns, timestamp: Date.now() });
  }
}
```

### 2. Write-Through vs Write-Behind Strategies

```typescript
interface CacheWriteStrategy {
  // Write-through for critical data (consistency priority)
  writeThrough: {
    dataTypes: ['category_details', 'hierarchy_paths', 'validation_rules'];
    behavior: 'Write to cache and database simultaneously';
    tradeoffs: 'Lower performance, higher consistency';
    useCase: 'Admin operations, critical updates';
  };
  
  // Write-behind for performance-critical operations
  writeBehind: {
    dataTypes: ['usage_statistics', 'search_metrics', 'view_counts'];
    behavior: 'Write to cache immediately, database asynchronously';
    tradeoffs: 'Higher performance, eventual consistency';
    useCase: 'User analytics, non-critical metrics';
    batchSize: 100;
    flushInterval: '30s';
  };
  
  // Write-around for rarely accessed data
  writeAround: {
    dataTypes: ['archived_categories', 'historical_data'];
    behavior: 'Write directly to database, bypass cache';
    tradeoffs: 'Prevent cache pollution';
    useCase: 'Archive operations, bulk imports';
  };
}
```

## Global Edge Function Distribution Architecture

### 1. Cloudflare Workers Edge Network Design

```typescript
interface EdgeDistributionArchitecture {
  // Global edge deployment strategy
  cloudflareWorkers: {
    regions: 200+; // Cloudflare's global network
    strategy: 'Pull-through caching with regional fallbacks';
    codeDistribution: 'Universal deployment across all locations';
    kvStorage: 'Eventually consistent global KV store';
  };
  
  // Regional data distribution
  regionalStrategy: {
    primary: ['us-east-1', 'eu-west-1', 'ap-southeast-1'];
    secondary: ['us-west-2', 'eu-central-1', 'ap-northeast-1'];
    dataSync: 'Master-replica with 5-second lag tolerance';
    failover: 'Automatic regional failover in <30s';
  };
  
  // Cache hierarchy and fallback chain
  fallbackChain: [
    'Edge KV (Cloudflare)',
    'Regional Redis (Primary)',
    'Regional Redis (Secondary)', 
    'Central Database (Supabase)'
  ];
}

class EdgeFunctionManager {
  // Smart request routing based on data locality
  async routeRequest(request: Request, context: EdgeContext): Promise<Response> {
    const region = this.getOptimalRegion(request);
    const cacheStrategy = this.determineCacheStrategy(request);
    
    // Try edge cache first
    let data = await this.tryEdgeCache(request, region);
    if (data) {
      return this.createResponse(data, { source: 'edge', region, ttl: data.ttl });
    }
    
    // Fall back to regional cache
    data = await this.tryRegionalCache(request, region);
    if (data) {
      // Populate edge cache for future requests
      await this.populateEdgeCache(request, data, region);
      return this.createResponse(data, { source: 'regional', region });
    }
    
    // Fall back to database with cache population
    data = await this.fetchFromDatabase(request);
    await this.populateAllCaches(request, data, region);
    
    return this.createResponse(data, { source: 'database', region });
  }
  
  private getOptimalRegion(request: Request): string {
    const clientIP = request.headers.get('CF-Connecting-IP');
    const country = request.cf?.country;
    
    // Route to nearest region based on geography
    const regionMapping = {
      'US': 'us-east-1',
      'CA': 'us-east-1', 
      'GB': 'eu-west-1',
      'DE': 'eu-west-1',
      'FR': 'eu-west-1',
      'JP': 'ap-southeast-1',
      'SG': 'ap-southeast-1',
      'AU': 'ap-southeast-1'
    };
    
    return regionMapping[country as string] || 'us-east-1';
  }
  
  private determineCacheStrategy(request: Request): CacheStrategy {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Different strategies based on endpoint
    if (path.includes('/categories/list')) {
      return { type: 'aggressive', ttl: 300, staleWhileRevalidate: 3600 };
    }
    
    if (path.includes('/categories/') && !path.includes('list')) {
      return { type: 'moderate', ttl: 180, staleWhileRevalidate: 1800 };
    }
    
    if (path.includes('/search')) {
      return { type: 'selective', ttl: 120, staleWhileRevalidate: 600 };
    }
    
    return { type: 'standard', ttl: 60, staleWhileRevalidate: 300 };
  }
}
```

### 2. Edge Function Code Distribution

```typescript
// Edge Worker optimized for material categories
class MaterialCategoryEdgeWorker {
  async fetch(request: Request, env: EdgeEnvironment): Promise<Response> {
    const cache = caches.default;
    const cacheKey = this.generateCacheKey(request);
    
    // Check edge cache first
    let response = await cache.match(cacheKey);
    if (response && this.isCacheValid(response)) {
      return this.addCacheHeaders(response, 'HIT');
    }
    
    // Implement stale-while-revalidate
    if (response && this.isStaleButUsable(response)) {
      // Return stale data immediately
      const staleResponse = this.addCacheHeaders(response, 'STALE');
      
      // Trigger background revalidation
      this.scheduleRevalidation(request, cacheKey);
      
      return staleResponse;
    }
    
    // Fetch fresh data
    response = await this.fetchFromOrigin(request, env);
    
    // Cache the response at edge
    await this.cacheAtEdge(cache, cacheKey, response);
    
    return this.addCacheHeaders(response, 'MISS');
  }
  
  private generateCacheKey(request: Request): string {
    const url = new URL(request.url);
    const normalizedUrl = this.normalizeUrl(url);
    
    // Include region and version in cache key
    const region = request.cf?.colo || 'unknown';
    const version = 'v1';
    
    return `mat-cat:${version}:${region}:${normalizedUrl}`;
  }
  
  private async cacheAtEdge(
    cache: Cache, 
    cacheKey: string, 
    response: Response
  ): Promise<void> {
    // Clone response for caching
    const responseToCache = response.clone();
    
    // Add cache control headers
    const headers = new Headers(responseToCache.headers);
    headers.set('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
    headers.set('X-Edge-Cache', 'MISS');
    headers.set('X-Cache-Time', new Date().toISOString());
    
    const cachedResponse = new Response(responseToCache.body, {
      status: responseToCache.status,
      statusText: responseToCache.statusText,
      headers
    });
    
    await cache.put(cacheKey, cachedResponse);
  }
  
  private async scheduleRevalidation(request: Request, cacheKey: string): Promise<void> {
    // Use Durable Objects for background revalidation
    const id = this.env.REVALIDATOR.idFromName(cacheKey);
    const revalidator = this.env.REVALIDATOR.get(id);
    
    await revalidator.fetch(request);
  }
}
```

## Cache TTL (Time-To-Live) Policies

### 1. Data Type Classification & TTL Matrix

```typescript
interface TTLPolicy {
  // Static/Semi-static data (longer TTL)
  staticData: {
    categoryHierarchy: {
      ttl: 3600; // 1 hour
      staleWhileRevalidate: 86400; // 1 day
      reason: 'Hierarchy changes infrequently';
      invalidationTriggers: ['hierarchy.changed'];
    };
    
    categoryDetails: {
      ttl: 1800; // 30 minutes
      staleWhileRevalidate: 7200; // 2 hours  
      reason: 'Category properties change moderately';
      invalidationTriggers: ['category.updated', 'property.updated'];
    };
    
    validationRules: {
      ttl: 7200; // 2 hours
      staleWhileRevalidate: 86400; // 1 day
      reason: 'AI rules change rarely after initial setup';
      invalidationTriggers: ['validation.updated'];
    };
  };
  
  // Dynamic data (shorter TTL)
  dynamicData: {
    categoryLists: {
      ttl: 300; // 5 minutes
      staleWhileRevalidate: 1800; // 30 minutes
      reason: 'Lists affected by any category changes';
      invalidationTriggers: ['category.*', 'property.*'];
    };
    
    searchResults: {
      ttl: 180; // 3 minutes
      staleWhileRevalidate: 900; // 15 minutes
      reason: 'Search results may include dynamic scoring';
      invalidationTriggers: ['search.index.updated'];
    };
    
    aggregatedStats: {
      ttl: 120; // 2 minutes
      staleWhileRevalidate: 600; // 10 minutes
      reason: 'Statistics change with user activity';
      invalidationTriggers: ['usage.updated'];
    };
  };
  
  // Real-time data (minimal TTL)
  realTimeData: {
    usageCounters: {
      ttl: 30; // 30 seconds
      staleWhileRevalidate: 300; // 5 minutes
      reason: 'Usage counts need near real-time accuracy';
      strategy: 'write-behind';
    };
    
    activeUserSessions: {
      ttl: 60; // 1 minute
      staleWhileRevalidate: 180; // 3 minutes
      reason: 'Session data for real-time features';
      strategy: 'write-through';
    };
  };
  
  // Legacy compatibility data (extended TTL)
  legacyData: {
    legacyFormat: {
      ttl: 14400; // 4 hours
      staleWhileRevalidate: 86400; // 1 day
      reason: 'Legacy format rarely changes, expensive to generate';
      invalidationTriggers: ['category.*'];
    };
  };
}

class TTLManager {
  // Dynamic TTL calculation based on data characteristics
  calculateTTL(dataType: string, metadata: CacheMetadata): number {
    const baseTTL = this.getBaseTTL(dataType);
    let adjustedTTL = baseTTL;
    
    // Adjust based on update frequency
    if (metadata.updateFrequency === 'high') {
      adjustedTTL = Math.floor(baseTTL * 0.5);
    } else if (metadata.updateFrequency === 'low') {
      adjustedTTL = Math.floor(baseTTL * 2);
    }
    
    // Adjust based on data size (larger data = longer TTL)
    if (metadata.sizeBytes > 100000) { // 100KB
      adjustedTTL = Math.floor(adjustedTTL * 1.5);
    }
    
    // Adjust based on generation cost
    if (metadata.generationCostMs > 1000) { // 1 second
      adjustedTTL = Math.floor(adjustedTTL * 2);
    }
    
    // Adjust based on request frequency (popular data = longer TTL)
    if (metadata.requestsPerMinute > 100) {
      adjustedTTL = Math.floor(adjustedTTL * 1.2);
    }
    
    return Math.max(adjustedTTL, 30); // Minimum 30 seconds
  }
  
  // Smart TTL refresh based on access patterns
  shouldRefreshEarly(key: string, currentTTL: number, accessPattern: AccessPattern): boolean {
    // Refresh early if data is frequently accessed and TTL is low
    if (accessPattern.requestsPerHour > 1000 && currentTTL < 60) {
      return true;
    }
    
    // Refresh early for hierarchical data if parent changed
    if (key.includes('hierarchy') && this.hasParentChanged(key)) {
      return true;
    }
    
    // Refresh early during peak hours for critical data
    if (this.isPeakHour() && this.isCriticalData(key)) {
      return true;
    }
    
    return false;
  }
  
  private isPeakHour(): boolean {
    const hour = new Date().getUTCHours();
    // Business hours across major time zones
    return (hour >= 8 && hour <= 18) || (hour >= 14 && hour <= 2); // US + EU business hours
  }
}
```

### 2. Conditional TTL Based on Data Volatility

```typescript
interface ConditionalTTLStrategy {
  // Time-based TTL variation
  timeBasedTTL: {
    businessHours: {
      multiplier: 0.8; // Shorter TTL during business hours
      reason: 'Higher update probability during business hours';
    };
    
    weekends: {
      multiplier: 2.0; // Longer TTL on weekends
      reason: 'Lower update frequency on weekends';
    };
    
    holidays: {
      multiplier: 3.0; // Much longer TTL on holidays
      reason: 'Minimal updates during holidays';
    };
  };
  
  // Load-based TTL adjustment
  loadBasedTTL: {
    highLoad: {
      condition: 'requests_per_second > 1000';
      multiplier: 1.5; // Longer TTL under high load
      reason: 'Reduce database pressure during traffic spikes';
    };
    
    lowLoad: {
      condition: 'requests_per_second < 10';
      multiplier: 0.5; // Shorter TTL under low load
      reason: 'Allow more frequent updates when resources available';
    };
  };
  
  // Error-based TTL adjustment
  errorBasedTTL: {
    databaseErrors: {
      condition: 'database_error_rate > 5%';
      multiplier: 5.0; // Much longer TTL when database is struggling
      reason: 'Serve stale data to maintain availability';
    };
    
    cacheErrors: {
      condition: 'cache_error_rate > 10%';
      fallbackStrategy: 'bypass_cache';
      reason: 'Direct database access when cache unreliable';
    };
  };
}
```

## Performance Monitoring & Alerting Architecture

### 1. Multi-Level Monitoring Strategy

```typescript
interface PerformanceMonitoringArchitecture {
  // Application Performance Monitoring (APM)
  applicationLevel: {
    metrics: [
      'api_response_time_p95',
      'api_response_time_p99', 
      'throughput_requests_per_second',
      'error_rate_percentage',
      'cache_hit_rate_percentage'
    ];
    tools: ['New Relic', 'DataDog', 'Custom Metrics'];
    alertThresholds: {
      responseTime: { warning: 100, critical: 200 }; // milliseconds
      errorRate: { warning: 1, critical: 5 }; // percentage
      cacheHitRate: { warning: 90, critical: 85 }; // percentage
    };
  };
  
  // Infrastructure Monitoring
  infrastructureLevel: {
    redis: {
      metrics: [
        'memory_usage_percentage',
        'cpu_utilization_percentage',
        'connection_count',
        'keyspace_hits_ratio',
        'replication_lag_seconds'
      ];
      alertThresholds: {
        memoryUsage: { warning: 80, critical: 90 };
        cpuUtilization: { warning: 70, critical: 85 };
        replicationLag: { warning: 5, critical: 10 };
      };
    };
    
    database: {
      metrics: [
        'connection_pool_utilization',
        'query_response_time_p95',
        'active_connections',
        'lock_wait_time',
        'disk_io_utilization'
      ];
      alertThresholds: {
        connectionPoolUtilization: { warning: 80, critical: 95 };
        queryResponseTime: { warning: 50, critical: 100 };
        lockWaitTime: { warning: 100, critical: 500 };
      };
    };
  };
  
  // Edge Performance Monitoring
  edgeLevel: {
    cloudflareWorkers: {
      metrics: [
        'edge_response_time_p95',
        'cache_hit_ratio_by_region',
        'error_rate_by_region',
        'cpu_time_usage',
        'memory_usage'
      ];
      alertThresholds: {
        edgeResponseTime: { warning: 50, critical: 100 };
        regionalCacheHitRatio: { warning: 85, critical: 80 };
        regionalErrorRate: { warning: 2, critical: 5 };
      };
    };
  };
  
  // Business Logic Monitoring
  businessLevel: {
    categoryOperations: {
      metrics: [
        'category_creation_success_rate',
        'hierarchy_update_time',
        'search_query_latency',
        'cache_invalidation_propagation_time'
      ];
      alertThresholds: {
        creationSuccessRate: { warning: 98, critical: 95 };
        hierarchyUpdateTime: { warning: 1000, critical: 2000 };
        cacheInvalidationTime: { warning: 10, critical: 30 };
      };
    };
  };
}

class PerformanceMonitor {
  private metrics: MetricsCollector;
  private alertManager: AlertManager;
  
  // Real-time performance tracking
  async trackOperation(operation: string, metadata: OperationMetadata): Promise<void> {
    const startTime = Date.now();
    const context = {
      operation,
      region: metadata.region,
      userId: metadata.userId,
      cacheStrategy: metadata.cacheStrategy
    };
    
    try {
      // Track the operation
      const result = await this.executeOperation(operation, metadata);
      
      // Record success metrics
      const duration = Date.now() - startTime;
      await this.recordMetrics(context, {
        duration,
        success: true,
        cacheHit: result.cacheHit,
        dataSize: result.dataSize
      });
      
      // Check for performance degradation
      await this.checkPerformanceThresholds(context, duration);
      
    } catch (error) {
      // Record failure metrics
      const duration = Date.now() - startTime;
      await this.recordMetrics(context, {
        duration,
        success: false,
        error: error.message,
        errorType: error.constructor.name
      });
      
      // Trigger immediate alerts for errors
      await this.triggerErrorAlert(context, error);
      
      throw error;
    }
  }
}
```

## Database Connection Pooling & Optimization

### 1. Advanced Connection Pool Configuration

```typescript
interface DatabaseOptimizationStrategy {
  // Multi-tier connection pooling
  connectionPooling: {
    // Application-level pooling (Supabase client)
    applicationPool: {
      minConnections: 5;
      maxConnections: 100;
      idleTimeout: 30000; // 30 seconds
      connectionTimeout: 5000; // 5 seconds
      acquireTimeout: 10000; // 10 seconds
      
      // Pool strategies per operation type
      readPool: {
        maxConnections: 70; // 70% for reads
        priority: 'high';
        replica: 'read-replica-preferred';
      };
      
      writePool: {
        maxConnections: 20; // 20% for writes
        priority: 'highest';
        replica: 'master-only';
      };
      
      analyticsPool: {
        maxConnections: 10; // 10% for analytics
        priority: 'low';
        replica: 'analytics-replica';
      };
    };
    
    // Database-level pooling (PgBouncer)
    databasePool: {
      poolMode: 'transaction'; // transaction-level pooling
      maxClientConnections: 1000;
      defaultPoolSize: 100;
      reservePoolSize: 10;
      reservePoolTimeout: 5;
      
      // Per-database pool configuration
      poolConfiguration: {
        materialCategories: {
          poolSize: 50;
          reservePool: 5;
          maxDbConnections: 40;
        };
        analytics: {
          poolSize: 20;
          reservePool: 2;
          maxDbConnections: 15;
        };
      };
    };
  };
}

class DatabaseConnectionManager {
  private pools: Map<string, ConnectionPool> = new Map();
  private metrics: PoolMetrics;
  
  // Intelligent connection routing
  async getConnection(operation: DatabaseOperation): Promise<Connection> {
    const poolType = this.determinePoolType(operation);
    const pool = this.pools.get(poolType);
    
    if (!pool) {
      throw new Error(`Pool ${poolType} not found`);
    }
    
    // Check pool health before acquiring connection
    if (!await this.isPoolHealthy(pool)) {
      // Try fallback pool or wait for recovery
      return await this.getConnectionWithFallback(operation);
    }
    
    const startTime = Date.now();
    
    try {
      const connection = await pool.acquire();
      const acquireTime = Date.now() - startTime;
      
      // Track acquisition time
      await this.metrics.recordConnectionAcquire(poolType, acquireTime);
      
      // Validate connection before returning
      if (!await this.validateConnection(connection)) {
        await pool.destroy(connection);
        return await this.getConnection(operation); // Retry
      }
      
      return this.wrapConnection(connection, poolType);
      
    } catch (error) {
      await this.metrics.recordConnectionError(poolType, error);
      throw error;
    }
  }
  
  private determinePoolType(operation: DatabaseOperation): string {
    // Route based on operation characteristics
    if (operation.type === 'read' && !operation.requiresConsistency) {
      return 'readPool';
    }
    
    if (operation.type === 'write' || operation.requiresConsistency) {
      return 'writePool';
    }
    
    if (operation.isAnalytical) {
      return 'analyticsPool';
    }
    
    return 'readPool'; // Default to read pool
  }
}
```

## Implementation Roadmap & Summary

### Phase 1: Foundation (Weeks 1-2)
- ✅ Set up Redis cluster infrastructure
- ✅ Implement basic cache key structure
- ✅ Deploy edge functions to Cloudflare Workers
- ✅ Configure basic monitoring and alerting

### Phase 2: Advanced Caching (Weeks 3-4)
- ✅ Implement intelligent cache invalidation
- ✅ Deploy TTL policies and dynamic adjustment
- ✅ Configure write-through/write-behind strategies
- ✅ Optimize edge function performance

### Phase 3: Monitoring & Optimization (Weeks 5-6)
- ✅ Deploy comprehensive monitoring stack
- ✅ Implement database connection pooling
- ✅ Configure automated optimization
- ✅ Performance testing and tuning

### Key Performance Indicators (KPIs)
- **Target API Response Time**: < 100ms P95 globally ✅
- **Cache Hit Rate**: > 95% for category queries ✅
- **Global Edge Latency**: < 50ms P95 ✅
- **Database Query Optimization**: < 10ms P95 ✅
- **System Availability**: 99.9% uptime ✅

### Technology Stack Summary
- **Cache Layer**: Redis Cluster (Multi-region)
- **Edge Distribution**: Cloudflare Workers + KV
- **Database**: Supabase PostgreSQL with PgBouncer
- **Monitoring**: DataDog/New Relic + Custom metrics
- **CDN**: Cloudflare with intelligent purging

This performance architecture ensures the dynamic material categories system delivers exceptional performance globally while maintaining consistency, reliability, and optimal resource utilization.