+++
id = "MIVAA-SUPABASE-COORDINATION-STRATEGY"
title = "MIVAA-Supabase Embedding Coordination Strategy"
context_type = "strategy"
scope = "Defines how Supabase functions coordinate with MIVAA for AI operations while preserving database functionality"
target_audience = ["lead-backend", "lead-db", "dev-python", "util-typescript"]
granularity = "detailed"
status = "active"
created_date = "2025-08-31T07:02:00Z"
coordinator = "TASK-ARCH-20250830-172000"
tags = ["mivaa", "supabase", "embedding", "coordination", "strategy", "ai-integration"]
related_docs = [
    "supabase/functions/visual-search/index.ts",
    "src/api/mivaa-gateway.ts",
    "mivaa-pdf-extractor/app/services/embedding_service.py",
    ".roopm/tasks/ARCHITECTURE_MIVAA_Integration_Cleanup/TASK-ARCH-20250830-172000.md"
]
+++

# MIVAA-Supabase Embedding Coordination Strategy

## Executive Summary

**Objective:** Establish a hybrid coordination strategy where Supabase functions orchestrate multi-modal AI operations through MIVAA while maintaining direct database control for optimal performance and data consistency.

**Core Principle:** **AI Generation → MIVAA** | **Database Operations → Supabase**

## Current Architecture Analysis

### Critical Coordination Points Identified

From [`supabase/functions/visual-search/index.ts`](supabase/functions/visual-search/index.ts) analysis:

1. **TogetherAI/LLaMA Vision** (lines 650-699)
   - **Current**: Direct API calls to Together AI
   - **Target**: Proxy through MIVAA semantic analysis endpoint
   - **Action**: `semantic_analysis` via [`src/api/mivaa-gateway.ts`](src/api/mivaa-gateway.ts)

2. **OpenAI Text Embeddings** (lines 701-732)
   - **Current**: Direct calls to OpenAI embeddings API
   - **Target**: Use MIVAA embedding service
   - **Action**: `generate_embedding` via MIVAA gateway
   - **Critical**: Maintain 1536D text-embedding-3-small compatibility

3. **CLIP Visual Embeddings** (lines 130-188)
   - **Current**: Direct HuggingFace/CLIP processing
   - **Target**: Use MIVAA CLIP service
   - **Action**: Existing MIVAA CLIP capabilities

4. **Database Operations** 
   - **Current**: Direct Supabase pgVector operations
   - **Target**: Keep unchanged for performance
   - **Rationale**: Database proximity, transaction integrity, performance optimization

## Coordination Strategy Framework

### Phase 1: Hybrid Integration Pattern

**Architecture:**
```
Supabase Function → MIVAA Gateway → MIVAA Service (AI) 
                ↓
                Supabase Database (pgVector Storage/Search)
```

**Responsibilities:**

| Component | Responsibilities |
|-----------|------------------|
| **Supabase Functions** | Request orchestration, database operations, response formatting, analytics |
| **MIVAA Gateway** | Authentication, rate limiting, action routing, error handling |
| **MIVAA Service** | AI model execution, embedding generation, semantic analysis |
| **Supabase Database** | Vector storage, similarity search, transaction management |

### Phase 2: Migration Sequence

#### 2.1 Visual Search Pipeline Migration

**Target Function**: [`supabase/functions/visual-search/index.ts`](supabase/functions/visual-search/index.ts)

**Migration Steps:**

1. **Replace Direct AI Calls**:
   ```typescript
   // BEFORE (Direct TogetherAI)
   private async generateSemanticDescription(imageData: string): Promise<string>
   
   // AFTER (MIVAA Gateway)
   private async generateSemanticDescription(imageData: string): Promise<string> {
     return await this.mivaaClient.semanticAnalysis(imageData);
   }
   ```

2. **Replace Embedding Generation**:
   ```typescript
   // BEFORE (Direct OpenAI)
   private async generateTextEmbedding(text: string): Promise<number[]>
   
   // AFTER (MIVAA Gateway)
   private async generateTextEmbedding(text: string): Promise<number[]> {
     return await this.mivaaClient.generateEmbedding(text);
   }
   ```

3. **Preserve Database Operations**:
   ```typescript
   // UNCHANGED - Direct Supabase operations
   const { data, error } = await supabase.rpc('visual_material_search', {
     query_clip_embedding: queryEmbedding,
     similarity_threshold: request.filters?.similarity_threshold || 0.75,
     result_limit: request.limit || 20
   });
   ```

#### 2.2 Other Supabase Functions

**Priority Order:**
1. [`enhanced-rag-search/index_optimized.ts`](supabase/functions/enhanced-rag-search/index_optimized.ts) - High complexity
2. [`ai-material-analysis/index.ts`](supabase/functions/ai-material-analysis/index.ts) - Medium complexity
3. [`rag-knowledge-search/index.ts`](supabase/functions/rag-knowledge-search/index.ts) - Medium complexity
4. Other embedding-dependent functions as identified

## Technical Implementation Plan

### 3.1 MIVAA Client Integration

**Create Supabase MIVAA Client Service:**

```typescript
// supabase/functions/_shared/mivaaClient.ts
export class SupabaseMivaaClient {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;

  constructor() {
    this.gatewayUrl = Deno.env.get('MIVAA_GATEWAY_URL') || 'http://localhost:3000';
    this.apiKey = Deno.env.get('MIVAA_API_KEY') || '';
  }

  async semanticAnalysis(imageData: string): Promise<string> {
    const response = await this.makeRequest('semantic_analysis', {
      image_data: imageData,
      analysis_type: 'material_identification',
      options: { temperature: 0.1, max_tokens: 200 }
    });
    return response.data.analysis;
  }

  async generateEmbedding(text: string): Promise<number[]> {
    const response = await this.makeRequest('generate_embedding', {
      text: text.substring(0, 8000),
      model: 'text-embedding-3-small',
      dimensions: 1536
    });
    return response.data.embedding;
  }

  async generateCLIPEmbedding(imageData: string): Promise<number[]> {
    const response = await this.makeRequest('generate_clip_embedding', {
      image_data: imageData,
      model: 'openai/clip-vit-base-patch32'
    });
    return response.data.embedding;
  }

  private async makeRequest(action: string, payload: any): Promise<any> {
    const response = await fetch(`${this.gatewayUrl}/api/mivaa/gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ action, payload }),
    });

    if (!response.ok) {
      throw new Error(`MIVAA request failed: ${response.status}`);
    }

    return await response.json();
  }
}
```

### 3.2 Environment Configuration

**Required Environment Variables for Supabase Functions:**

```bash
# MIVAA Integration
MIVAA_GATEWAY_URL=https://your-app.vercel.app  # Main app URL
MIVAA_API_KEY=your_mivaa_api_key              # Shared MIVAA authentication

# Legacy API Keys (to be removed after migration)
TOGETHER_AI_API_KEY=your_together_ai_key      # Mark for removal
OPENAI_API_KEY=your_openai_key               # Mark for removal
```

### 3.3 Database Schema Preservation

**No Changes Required:**
- `material_visual_analysis` table structure preserved
- `visual_embedding_512` and `description_embedding_1536` columns unchanged
- pgVector operations and RPC functions maintained
- All similarity search functions preserved

## Migration Execution Strategy

### Step 1: Preparation Phase
- [ ] Create `SupabaseMivaaClient` service in [`supabase/functions/_shared/mivaaClient.ts`](supabase/functions/_shared/mivaaClient.ts)
- [ ] Add MIVAA environment variables to Supabase Edge Functions configuration
- [ ] Test MIVAA gateway connectivity from Supabase environment

### Step 2: Visual Search Migration  
- [ ] Update [`generateSemanticDescription()`](supabase/functions/visual-search/index.ts:650) to use MIVAA
- [ ] Update [`generateTextEmbedding()`](supabase/functions/visual-search/index.ts:701) to use MIVAA  
- [ ] Update [`CLIPEmbeddingService`](supabase/functions/visual-search/index.ts:130) to use MIVAA
- [ ] Preserve all database operations and pgVector RPC calls
- [ ] Test end-to-end visual search functionality

### Step 3: Cascade Migration
- [ ] Apply same pattern to other embedding-dependent functions
- [ ] Update environment configuration management
- [ ] Remove legacy direct AI API integrations
- [ ] Update API documentation and integration guides

### Step 4: Validation & Cleanup
- [ ] Comprehensive testing of all search functionalities
- [ ] Performance benchmarking (MIVAA vs direct calls)
- [ ] Remove unused API keys and dependencies
- [ ] Update monitoring and logging for MIVAA integration

## Data Flow Architecture

### Before Migration (Current)
```
User Request → Supabase Function → [TogetherAI/OpenAI/CLIP APIs] → Database Storage → Response
```

### After Migration (Target) 
```
User Request → Supabase Function → MIVAA Gateway → MIVAA Service → AI Models
                     ↓                                                      ↓
                 Database Operations ← ← ← ← ← ← ← ← ← ← ← Embeddings/Analysis
                     ↓
                 Formatted Response
```

## Key Benefits

1. **Centralized AI Management**: All AI operations managed through MIVAA
2. **Performance Optimization**: Database operations remain local to Supabase
3. **Scalability**: MIVAA handles AI rate limiting and caching
4. **Maintainability**: Single source of truth for AI service configurations
5. **Security**: Centralized API key management through MIVAA
6. **Monitoring**: Unified AI usage analytics and logging

## Risk Mitigation

### Technical Risks
- **Latency Increase**: Network hop to MIVAA gateway
  - *Mitigation*: MIVAA caching, connection pooling
- **Dependency Chain**: Additional failure point
  - *Mitigation*: MIVAA health checks, graceful degradation
- **Authentication Complexity**: Cross-service communication
  - *Mitigation*: Shared API key, proper timeout handling

### Migration Risks  
- **Data Consistency**: Embedding dimension/model changes
  - *Mitigation*: Use exact same models and dimensions
- **Functionality Gaps**: Missing MIVAA capabilities
  - *Mitigation*: Comprehensive testing, feature parity validation
- **Performance Regression**: Slower response times
  - *Mitigation*: Performance benchmarking, optimization

## Success Criteria

1. **Functional Parity**: All existing search functionality preserved
2. **Performance Tolerance**: <20% latency increase acceptable
3. **Zero Data Loss**: All existing embeddings and search results maintained
4. **API Compatibility**: No breaking changes to external interfaces
5. **Monitoring Integration**: Full observability maintained

## Next Steps

1. **Create MIVAA Client Service** - Foundation for all Supabase → MIVAA communication
2. **Pilot Migration** - Start with visual-search function as complexity test case
3. **Validate & Iterate** - Test thoroughly before cascading to other functions
4. **Scale Migration** - Apply proven pattern to remaining embedding-dependent functions

This strategy ensures **zero functionality loss** while achieving the architectural goal of centralized AI service management through MIVAA.