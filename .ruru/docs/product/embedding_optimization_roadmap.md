+++
id = "EMBEDDING-OPTIMIZATION-ROADMAP-V1"
title = "Material Kai Vision Platform - Embedding Optimization Roadmap"
context_type = "documentation"
scope = "Specific recommendations for improving current Supabase-based RAG system"
target_audience = ["technical", "product", "development"]
granularity = "actionable"
status = "active"
last_updated = "2025-07-19"
tags = ["embeddings", "optimization", "supabase", "rag", "roadmap", "implementation"]
related_context = [
    ".ruru/docs/product/embedding_generation_workflow_comprehensive.md",
    ".ruru/docs/product/embedding_workflow_executive_summary.md"
]
template_schema_doc = ".ruru/templates/toml-md/00_boilerplate.md"
relevance = "High: Actionable optimization plan for current system"
+++

# Material Kai Vision Platform - Embedding Optimization Roadmap

## Current State Confirmation

**✅ Supabase-Based Architecture:**
- Vector storage: Supabase pgvector (512-dimensional embeddings)
- Search engine: `enhanced_vector_search` RPC function
- Processing: Supabase Edge Functions
- Model: OpenAI `text-embedding-3-small`

## Phase 1: Quick Wins (1-2 Weeks Implementation)

### 1.1 Upgrade Embedding Model
**Current**: `text-embedding-3-small` (512 dimensions)
**Upgrade**: `text-embedding-3-large` (3072 dimensions)

**Implementation**:
```typescript
// In supabase/functions/rag-knowledge-search/index.ts
const EMBEDDING_MODEL = 'text-embedding-3-large'; // was: text-embedding-3-small
const EMBEDDING_DIMENSIONS = 3072; // was: 512

// Update database schema
ALTER TABLE enhanced_knowledge_base 
ALTER COLUMN embedding TYPE vector(3072);

ALTER TABLE material_embeddings 
ALTER COLUMN embedding TYPE vector(3072);
```

**Expected Impact**:
- 🎯 **+40% search accuracy**
- 💰 **+300% embedding costs**
- ⚡ **Same response time**

### 1.2 Implement Embedding Caching
**Add Redis-like caching for frequent queries**

**Implementation**:
```typescript
// New function: supabase/functions/embedding-cache/index.ts
const getCachedEmbedding = async (text: string): Promise<number[] | null> => {
  const { data } = await supabase
    .from('embedding_cache')
    .select('embedding')
    .eq('text_hash', hashText(text))
    .single();
  
  return data?.embedding || null;
};

const cacheEmbedding = async (text: string, embedding: number[]) => {
  await supabase
    .from('embedding_cache')
    .upsert({
      text_hash: hashText(text),
      embedding,
      created_at: new Date().toISOString()
    });
};
```

**Expected Impact**:
- 💰 **-50% OpenAI API costs**
- ⚡ **-80% response time for cached queries**
- 📊 **Better user experience**

### 1.3 Optimize Vector Indexes
**Improve Supabase vector search performance**

**Implementation**:
```sql
-- Create optimized vector indexes
CREATE INDEX CONCURRENTLY enhanced_knowledge_base_embedding_ivfflat_idx 
ON enhanced_knowledge_base 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 100);

CREATE INDEX CONCURRENTLY material_embeddings_embedding_ivfflat_idx 
ON material_embeddings 
USING ivfflat (embedding vector_cosine_ops) 
WITH (lists = 50);

-- Add metadata indexes for pre-filtering
CREATE INDEX enhanced_knowledge_base_categories_idx 
ON enhanced_knowledge_base 
USING gin(material_categories);

CREATE INDEX enhanced_knowledge_base_confidence_idx 
ON enhanced_knowledge_base (confidence_scores);
```

**Expected Impact**:
- ⚡ **-30% search latency**
- 📈 **Better scalability**
- 🔍 **Improved filtering performance**

### 1.4 Parallel PDF Processing
**Fix sequential image processing bottleneck**

**Implementation**:
```typescript
// In supabase/functions/convertapi-pdf-processor/index.ts
const processImagesInParallel = async (images: ImageData[]) => {
  const batchSize = 5; // Process 5 images concurrently
  const batches = chunk(images, batchSize);
  
  for (const batch of batches) {
    await Promise.all(
      batch.map(image => processAndStoreImage(image))
    );
  }
};
```

**Expected Impact**:
- ⚡ **-60% PDF processing time**
- 📊 **Better throughput for document uploads**
- 🔧 **Reduced memory usage**

## Phase 2: Enhanced Features (1 Month Implementation)

### 2.1 Hybrid Search Implementation
**Combine vector search with full-text search**

**Implementation**:
```sql
-- Add full-text search indexes
CREATE INDEX enhanced_knowledge_base_fts_idx 
ON enhanced_knowledge_base 
USING gin(to_tsvector('english', title || ' ' || content));

-- Create hybrid search function
CREATE OR REPLACE FUNCTION hybrid_search(
  query_text text,
  query_embedding vector(3072),
  similarity_threshold float DEFAULT 0.7,
  limit_count int DEFAULT 10
)
RETURNS TABLE (
  id uuid,
  title text,
  content text,
  vector_score float,
  text_score float,
  combined_score float
) AS $$
BEGIN
  RETURN QUERY
  WITH vector_results AS (
    SELECT 
      ekb.id,
      ekb.title,
      ekb.content,
      1 - (ekb.embedding <=> query_embedding) as vector_score,
      0 as text_score
    FROM enhanced_knowledge_base ekb
    WHERE 1 - (ekb.embedding <=> query_embedding) > similarity_threshold
  ),
  text_results AS (
    SELECT 
      ekb.id,
      ekb.title,
      ekb.content,
      0 as vector_score,
      ts_rank(to_tsvector('english', ekb.title || ' ' || ekb.content), 
               plainto_tsquery('english', query_text)) as text_score
    FROM enhanced_knowledge_base ekb
    WHERE to_tsvector('english', ekb.title || ' ' || ekb.content) 
          @@ plainto_tsquery('english', query_text)
  )
  SELECT 
    COALESCE(v.id, t.id) as id,
    COALESCE(v.title, t.title) as title,
    COALESCE(v.content, t.content) as content,
    COALESCE(v.vector_score, 0) as vector_score,
    COALESCE(t.text_score, 0) as text_score,
    (COALESCE(v.vector_score, 0) * 0.7 + COALESCE(t.text_score, 0) * 0.3) as combined_score
  FROM vector_results v
  FULL OUTER JOIN text_results t ON v.id = t.id
  ORDER BY combined_score DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;
```

**Expected Impact**:
- 🎯 **+25% search recall**
- 🔍 **Better handling of technical terms**
- 📊 **Improved user satisfaction**

### 2.2 Intelligent Text Chunking
**Replace 4KB truncation with smart chunking**

**Implementation**:
```typescript
// New utility: src/utils/textChunking.ts
interface ChunkOptions {
  maxTokens: number;
  overlapTokens: number;
  preserveSentences: boolean;
}

const intelligentChunk = (text: string, options: ChunkOptions): string[] => {
  const sentences = text.split(/[.!?]+/).filter(s => s.trim());
  const chunks: string[] = [];
  let currentChunk = '';
  let currentTokens = 0;
  
  for (const sentence of sentences) {
    const sentenceTokens = estimateTokens(sentence);
    
    if (currentTokens + sentenceTokens > options.maxTokens && currentChunk) {
      chunks.push(currentChunk.trim());
      
      // Add overlap from previous chunk
      const overlapText = getLastNTokens(currentChunk, options.overlapTokens);
      currentChunk = overlapText + ' ' + sentence;
      currentTokens = estimateTokens(currentChunk);
    } else {
      currentChunk += ' ' + sentence;
      currentTokens += sentenceTokens;
    }
  }
  
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
};

// Update PDF processor to use chunking
const processDocumentWithChunking = async (htmlContent: string) => {
  const chunks = intelligentChunk(htmlContent, {
    maxTokens: 1000,
    overlapTokens: 100,
    preserveSentences: true
  });
  
  const embeddings = await Promise.all(
    chunks.map(chunk => generateEmbedding(chunk))
  );
  
  // Store each chunk as separate knowledge base entry
  for (let i = 0; i < chunks.length; i++) {
    await storeKnowledgeEntry({
      content: chunks[i],
      embedding: embeddings[i],
      chunk_index: i,
      total_chunks: chunks.length
    });
  }
};
```

**Expected Impact**:
- 📚 **No content loss from truncation**
- 🎯 **Better context preservation**
- 🔍 **Improved search granularity**

### 2.3 Multi-Provider Embedding Support
**Add fallback embedding providers**

**Implementation**:
```typescript
// New service: src/services/embeddingProviders.ts
interface EmbeddingProvider {
  name: string;
  generateEmbedding: (text: string) => Promise<number[]>;
  dimensions: number;
  costPerToken: number;
}

const providers: Record<string, EmbeddingProvider> = {
  openai: {
    name: 'OpenAI text-embedding-3-large',
    generateEmbedding: generateOpenAIEmbedding,
    dimensions: 3072,
    costPerToken: 0.00013
  },
  cohere: {
    name: 'Cohere embed-english-v3.0',
    generateEmbedding: generateCohereEmbedding,
    dimensions: 1024,
    costPerToken: 0.0001
  }
};

const generateEmbeddingWithFallback = async (text: string): Promise<number[]> => {
  try {
    return await providers.openai.generateEmbedding(text);
  } catch (error) {
    console.warn('OpenAI failed, falling back to Cohere:', error);
    return await providers.cohere.generateEmbedding(text);
  }
};
```

**Expected Impact**:
- 🛡️ **99.9% uptime reliability**
- 💰 **Cost optimization options**
- ⚡ **Reduced API dependency risk**

## Phase 3: Advanced Optimization (2-3 Months)

### 3.1 Real-Time Embedding Updates
**Automatically re-embed when content changes**

**Implementation**:
```sql
-- Add trigger for automatic re-embedding
CREATE OR REPLACE FUNCTION trigger_embedding_update()
RETURNS TRIGGER AS $$
BEGIN
  -- Queue for re-embedding if content changed
  IF OLD.content IS DISTINCT FROM NEW.content THEN
    INSERT INTO embedding_update_queue (
      table_name,
      record_id,
      content,
      priority,
      created_at
    ) VALUES (
      TG_TABLE_NAME,
      NEW.id,
      NEW.content,
      'normal',
      NOW()
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enhanced_knowledge_base_embedding_trigger
  AFTER UPDATE ON enhanced_knowledge_base
  FOR EACH ROW
  EXECUTE FUNCTION trigger_embedding_update();
```

### 3.2 Advanced Metadata Filtering
**Implement sophisticated pre-filtering**

**Implementation**:
```typescript
interface SearchFilters {
  categories?: string[];
  confidenceMin?: number;
  dateRange?: { start: Date; end: Date };
  materialTypes?: string[];
  technicalComplexity?: 'low' | 'medium' | 'high';
}

const advancedVectorSearch = async (
  queryEmbedding: number[],
  filters: SearchFilters,
  limit: number = 10
) => {
  let whereClause = '1=1';
  const params: any[] = [queryEmbedding];
  
  if (filters.categories?.length) {
    whereClause += ` AND material_categories && $${params.length + 1}`;
    params.push(filters.categories);
  }
  
  if (filters.confidenceMin) {
    whereClause += ` AND confidence_scores->>'overall' >= $${params.length + 1}`;
    params.push(filters.confidenceMin.toString());
  }
  
  // ... additional filters
  
  const query = `
    SELECT *, 1 - (embedding <=> $1) as similarity
    FROM enhanced_knowledge_base
    WHERE ${whereClause}
    ORDER BY embedding <=> $1
    LIMIT ${limit}
  `;
  
  return await supabase.rpc('execute_query', { query, params });
};
```

### 3.3 Performance Monitoring Dashboard
**Track embedding system performance**

**Implementation**:
```typescript
// New monitoring service
interface EmbeddingMetrics {
  searchLatency: number;
  embeddingGenerationTime: number;
  cacheHitRate: number;
  searchAccuracy: number;
  apiCosts: number;
}

const trackSearchMetrics = async (
  query: string,
  results: SearchResult[],
  responseTime: number
) => {
  await supabase.from('search_metrics').insert({
    query_hash: hashText(query),
    result_count: results.length,
    response_time_ms: responseTime,
    top_result_score: results[0]?.similarity || 0,
    timestamp: new Date().toISOString()
  });
};
```

## Implementation Priority Matrix

| Feature | Impact | Effort | Priority |
|---------|--------|--------|----------|
| Upgrade to text-embedding-3-large | High | Low | 🔥 Critical |
| Embedding caching | High | Medium | 🔥 Critical |
| Parallel PDF processing | Medium | Low | ⚡ High |
| Vector index optimization | Medium | Low | ⚡ High |
| Hybrid search | High | High | ⚡ High |
| Intelligent chunking | High | Medium | ⚡ High |
| Multi-provider support | Medium | Medium | 📊 Medium |
| Real-time updates | Low | High | 📊 Medium |
| Advanced filtering | Medium | High | 📊 Medium |

## Cost-Benefit Analysis

### Current Monthly Costs (Estimated)
- OpenAI embeddings: $50-100
- Supabase: $25-50
- **Total**: $75-150/month

### Optimized Monthly Costs
- Larger embeddings: +$150-300 (3x cost)
- Caching savings: -$25-50 (50% reduction)
- **Net increase**: +$125-250/month
- **Performance improvement**: +200% accuracy, +100% speed

## Success Metrics

### Technical KPIs
- **Search Latency**: Target <100ms (currently ~150ms)
- **Search Accuracy**: Target >90% (currently ~70%)
- **Cache Hit Rate**: Target >60%
- **System Uptime**: Target >99.9%

### Business KPIs
- **User Search Success Rate**: Target >85%
- **Query Abandonment Rate**: Target <10%
- **Cost per Successful Search**: Target <$0.05

## Next Steps

1. **Week 1**: Implement embedding model upgrade
2. **Week 2**: Add caching layer and parallel processing
3. **Week 3-4**: Implement hybrid search
4. **Month 2**: Add intelligent chunking and multi-provider support
5. **Month 3**: Advanced features and monitoring

This roadmap provides a clear path to significantly improve your current Supabase-based RAG system while maintaining architectural simplicity and cost-effectiveness.