+++
id = "week1-embedding-upgrade-implementation"
title = "Week 1: Embedding Model Upgrade & Caching Implementation Plan"
context_type = "implementation_plan"
scope = "Detailed technical plan for embedding model upgrade and caching layer"
target_audience = ["engineering", "devops", "product"]
granularity = "detailed"
status = "ready_for_implementation"
last_updated = "2025-07-20"
version = "1.0"
tags = ["embeddings", "openai", "caching", "redis", "performance", "week1"]
related_context = [
    "docs/product/embedding-enhancement-roadmap.md",
    "supabase/functions/enhanced-rag-search/index.ts"
]
priority = "high"
estimated_effort = "40 hours"
+++

# Week 1: Embedding Model Upgrade & Caching Implementation Plan

## Overview

This plan details the implementation of upgraded OpenAI embedding models and a Redis-based caching layer to improve performance and reduce API costs for the Material Kai Vision Platform's RAG system.

## Objectives

- **Primary**: Upgrade to OpenAI's latest embedding models (text-embedding-3-large)
- **Secondary**: Implement Redis caching layer for embedding results
- **Tertiary**: Add model versioning and migration support
- **Quaternary**: Establish performance monitoring and metrics

## Technical Architecture

### Current State
```typescript
// Current implementation in enhanced-rag-search
const embeddingResponse = await openai.embeddings.create({
  model: "text-embedding-ada-002", // Legacy model
  input: text,
});
```

### Target State
```typescript
// Upgraded implementation with caching
const embedding = await embeddingService.getEmbedding(text, {
  model: "text-embedding-3-large",
  useCache: true,
  version: "v3"
});
```

## Implementation Tasks

### Day 1-2: Infrastructure Setup

#### Task 1.1: Valkey Cache Infrastructure
**Estimated Time**: 8 hours
**Assignee**: DevOps Engineer

**Deliverables**:
- Valkey instance deployment (Upstash Valkey, self-hosted, or cloud provider)
- Connection configuration from Supabase Edge Functions
- Basic cache health monitoring

**Technical Specifications**:
```yaml
Valkey Configuration:
  - Memory: 1GB (scalable to 4GB)
  - Persistence: RDB snapshots every 15 minutes
  - Eviction Policy: allkeys-lru
  - Max Connections: 100
  - TTL: 7 days for embeddings
  - Provider: Upstash (supports Valkey) or self-hosted Valkey
```

**Implementation Approach**:
```typescript
// Supabase Edge Function with Valkey (Redis-compatible)
import { Redis } from '@upstash/redis'

const valkey = new Redis({
  url: Deno.env.get('UPSTASH_REDIS_REST_URL')!, // Works with Valkey
  token: Deno.env.get('UPSTASH_REDIS_REST_TOKEN')!,
})

// Cache key generation
const cacheKey = `embedding:${hashContent(text)}:${model}`

// Check cache first, then generate if needed
const cachedEmbedding = await valkey.get(cacheKey)
if (cachedEmbedding) {
  return JSON.parse(cachedEmbedding)
}
```

**Valkey Benefits**:
- **Open Source**: BSD license, no licensing concerns
- **Redis Compatible**: Drop-in replacement for Redis
- **Community Driven**: Linux Foundation backing
- **Performance**: Same performance characteristics as Redis
- **Future-Proof**: Independent of Redis licensing changes

**Acceptance Criteria**:
- [ ] Valkey instance accessible from Supabase Edge Functions
- [ ] Connection pooling and error handling configured
- [ ] Basic monitoring dashboard active
- [ ] Backup and recovery procedures documented

#### Task 1.2: Environment Configuration
**Estimated Time**: 2 hours  
**Assignee**: Backend Engineer

**Deliverables**:
- Updated environment variables for Redis
- OpenAI API key validation for new models
- Feature flags for gradual rollout

**Environment Variables**:
```bash
REDIS_URL=redis://...
REDIS_PASSWORD=...
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
EMBEDDING_CACHE_ENABLED=true
EMBEDDING_CACHE_TTL=604800  # 7 days
```

### Day 3-4: Embedding Service Implementation

#### Task 2.1: Enhanced Embedding Service
**Estimated Time**: 12 hours  
**Assignee**: Backend Engineer

**File**: `src/services/embeddingService.ts` (new)

**Core Features**:
- Model abstraction layer
- Cache-first retrieval strategy
- Batch processing support
- Error handling and retries

**Implementation Structure**:
```typescript
interface EmbeddingOptions {
  model: 'text-embedding-3-large' | 'text-embedding-3-small';
  useCache?: boolean;
  version?: string;
  dimensions?: number;
}

class EmbeddingService {
  async getEmbedding(text: string, options: EmbeddingOptions): Promise<number[]>
  async getEmbeddings(texts: string[], options: EmbeddingOptions): Promise<number[][]>
  async invalidateCache(text: string): Promise<void>
  async getCacheStats(): Promise<CacheStats>
}
```

**Cache Strategy**:
- Key format: `embedding:v3:${hash(text)}:${model}`
- Compression: gzip for storage efficiency
- Batch operations for multiple embeddings
- Cache warming for frequently accessed content

#### Task 2.2: Model Migration Support
**Estimated Time**: 6 hours  
**Assignee**: Backend Engineer

**Features**:
- Version tracking for embeddings
- Migration utilities for existing embeddings
- Backward compatibility during transition

**Database Schema Updates**:
```sql
-- Add model version tracking
ALTER TABLE document_embeddings 
ADD COLUMN model_version VARCHAR(50) DEFAULT 'ada-002';

-- Index for efficient model-based queries
CREATE INDEX idx_document_embeddings_model_version 
ON document_embeddings(model_version);
```

### Day 5: Integration and Testing

#### Task 3.1: Supabase Function Updates
**Estimated Time**: 6 hours  
**Assignee**: Backend Engineer

**Files to Update**:
- `supabase/functions/enhanced-rag-search/index.ts`
- `src/services/vectorSimilarityService.ts`

**Integration Points**:
```typescript
// Enhanced RAG search integration
const embeddingService = new EmbeddingService(redis, openai);

const queryEmbedding = await embeddingService.getEmbedding(query, {
  model: 'text-embedding-3-large',
  useCache: true,
  version: 'v3'
});
```

#### Task 3.2: Performance Testing
**Estimated Time**: 4 hours  
**Assignee**: Backend Engineer

**Test Scenarios**:
- Cache hit/miss performance comparison
- Batch processing efficiency
- Memory usage under load
- API rate limit handling

**Performance Benchmarks**:
- Target: 90% cache hit rate for repeated queries
- Target: <50ms cache retrieval time
- Target: 40% reduction in OpenAI API calls

### Day 6-7: Monitoring and Optimization

#### Task 4.1: Metrics and Monitoring
**Estimated Time**: 6 hours  
**Assignee**: DevOps Engineer

**Monitoring Dashboard**:
- Cache hit/miss ratios
- Embedding generation latency
- API cost tracking
- Error rates and types

**Key Metrics**:
```typescript
interface EmbeddingMetrics {
  cacheHitRate: number;
  avgLatency: number;
  apiCallsReduced: number;
  costSavings: number;
  errorRate: number;
}
```

#### Task 4.2: Performance Optimization
**Estimated Time**: 4 hours  
**Assignee**: Backend Engineer

**Optimization Areas**:
- Cache key optimization
- Batch size tuning
- Connection pooling refinement
- Memory usage optimization

## Risk Mitigation

### Technical Risks

**Risk**: Redis cache failure impacts system availability  
**Mitigation**: Graceful degradation to direct API calls  
**Implementation**: Circuit breaker pattern

**Risk**: New embedding model compatibility issues  
**Mitigation**: A/B testing with gradual rollout  
**Implementation**: Feature flags for model selection

**Risk**: Increased memory usage from caching  
**Mitigation**: Intelligent cache eviction and monitoring  
**Implementation**: LRU eviction with size limits

### Operational Risks

**Risk**: Migration downtime for existing embeddings  
**Mitigation**: Background migration with zero downtime  
**Implementation**: Dual-write strategy during transition

**Risk**: Cost increase from new model usage  
**Mitigation**: Cost monitoring and budget alerts  
**Implementation**: Usage tracking and automatic throttling

## Testing Strategy

### Unit Tests
- Embedding service functionality
- Cache operations (hit/miss scenarios)
- Error handling and retries
- Model version compatibility

### Integration Tests
- End-to-end embedding generation
- Cache integration with Supabase functions
- Performance under concurrent load
- Failover scenarios

### Performance Tests
- Cache performance benchmarking
- Memory usage profiling
- API rate limit testing
- Concurrent user simulation

## Deployment Plan

### Phase 1: Infrastructure (Day 1-2)
1. Deploy Redis instance
2. Configure environment variables
3. Test connectivity and basic operations

### Phase 2: Service Implementation (Day 3-4)
1. Deploy embedding service to staging
2. Run comprehensive test suite
3. Performance validation

### Phase 3: Integration (Day 5)
1. Update Supabase functions
2. Deploy to staging environment
3. End-to-end testing

### Phase 4: Production Rollout (Day 6-7)
1. Deploy with feature flags disabled
2. Enable for 10% of traffic
3. Monitor metrics and gradually increase
4. Full rollout after validation

## Success Metrics

### Performance Targets
- **Cache Hit Rate**: >90% for repeated queries
- **Latency Reduction**: 40% improvement in embedding retrieval
- **API Cost Reduction**: 30% decrease in OpenAI API calls
- **System Uptime**: 99.9% during deployment

### Quality Targets
- **Error Rate**: <0.1% for embedding operations
- **Test Coverage**: >95% for new embedding service
- **Documentation**: Complete API documentation and runbooks

## Rollback Plan

### Immediate Rollback (< 5 minutes)
1. Disable feature flags for new embedding service
2. Route traffic back to legacy implementation
3. Monitor system stability

### Full Rollback (< 30 minutes)
1. Revert Supabase function deployments
2. Disable Redis cache layer
3. Restore previous environment configuration
4. Validate system functionality

## Post-Implementation Tasks

### Week 2 Preparation
- Performance baseline documentation
- Cache optimization recommendations
- Integration points for parallel processing

### Documentation Updates
- API documentation for embedding service
- Operational runbooks for cache management
- Performance tuning guidelines

## Resource Requirements

### Development Team
- **Backend Engineer**: 32 hours (full-time for week)
- **DevOps Engineer**: 8 hours (infrastructure setup and monitoring)

### Infrastructure Costs
- **Redis Instance**: ~$50/month (1GB memory)
- **OpenAI API**: ~$200/month (estimated increase for new model)
- **Monitoring Tools**: ~$25/month (enhanced observability)

## Conclusion

This implementation plan provides a comprehensive approach to upgrading the embedding system with modern models and efficient caching. The phased deployment strategy minimizes risk while delivering significant performance improvements and cost savings.

The foundation established in Week 1 will enable the advanced features planned for Week 2 (parallel processing) and Month 2 (hybrid search), creating a scalable and efficient RAG system for the Material Kai Vision Platform.

---

*Implementation plan prepared by Product Management Team*  
*Ready for engineering review and execution*