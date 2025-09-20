+++
# --- Basic Metadata ---
id = "OPENAI-INTEGRATION-CATALOG-V1"
title = "OpenAI Integration Catalog & MIVAA Migration Plan"
context_type = "technical_specification"
scope = "Platform-wide OpenAI integration analysis and MIVAA migration strategy"
target_audience = ["dev-core-web", "core-architect", "lead-backend"]
granularity = "detailed"
status = "active"
last_updated = "2025-09-09"
tags = ["openai", "mivaa", "migration", "catalog", "multimodal", "ai", "integration"]
related_context = [
    "docs/architecture/MIVAA_Unified_Integration_Strategy.md",
    "src/api/mivaa-gateway.ts",
    "src/services/visualFeatureExtractionService.ts"
]
template_schema_doc = ".ruru/templates/toml-md/16_ai_rule.README.md"
relevance = "Critical: Defines complete migration scope and priorities"
+++

# OpenAI Integration Catalog & MIVAA Migration Plan

## Executive Summary

**Scope**: 130 OpenAI integration instances across 16 major functions requiring migration to MIVAA-first architecture.

**Key Finding**: Platform has extensive OpenAI dependencies with **mixed integration patterns** - some already have MIVAA fallbacks, others are direct OpenAI-only implementations.

## 📊 Integration Catalog by Category

### 🔴 **Critical Visual Analysis Functions** (Priority 1)
*Functions with direct OpenAI vision capabilities requiring parallel MIVAA actions*

| Function | File | OpenAI Usage | MIVAA Status | Migration Complexity |
|----------|------|--------------|--------------|---------------------|
| **hybrid-material-analysis** | [`supabase/functions/hybrid-material-analysis/index.ts`](supabase/functions/hybrid-material-analysis/index.ts:375) | GPT-4o vision fallback | Has MIVAA primary | **Medium** - Replace fallback with parallel MIVAA |
| **ai-material-analysis** | [`supabase/functions/ai-material-analysis/index.ts`](supabase/functions/ai-material-analysis/index.ts:248) | GPT-4o vision hybrid | Partial MIVAA | **Medium** - Standardize to parallel pattern |
| **extract-material-knowledge** | [`supabase/functions/extract-material-knowledge/index.ts`](supabase/functions/extract-material-knowledge/index.ts:155) | GPT-4o vision + embeddings | MIVAA with fallback | **High** - Dual API migration |
| **material-recognition** | [`supabase/functions/material-recognition/index.ts`](supabase/functions/material-recognition/index.ts:488) | OpenAI fallback | MIVAA Vision enabled | **Low** - Already prepared |

### 🟡 **Embedding Generation Functions** (Priority 2)
*Functions handling text embeddings that can use MIVAA text embedding actions*

| Function | File | OpenAI Usage | MIVAA Status | Migration Complexity |
|----------|------|--------------|--------------|---------------------|
| **unified-material-search** | [`supabase/functions/unified-material-search/index.ts`](supabase/functions/unified-material-search/index.ts:68) | text-embedding-ada-002 | MIVAA with fallback | **Low** - Pattern established |
| **enhanced-rag-search** | [`supabase/functions/enhanced-rag-search/index_optimized.ts`](supabase/functions/enhanced-rag-search/index_optimized.ts:129) | text-embedding-ada-002 | MIVAA with fallback | **Low** - Pattern established |
| **document-vector-search** | [`supabase/functions/document-vector-search/index.ts`](supabase/functions/document-vector-search/index.ts:101) | text-embedding-ada-002 | MIVAA with fallback | **Low** - Pattern established |
| **rag-knowledge-search** | [`supabase/functions/rag-knowledge-search/index.ts`](supabase/functions/rag-knowledge-search/index.ts:92) | text-embedding-ada-002 + GPT-4 chat | MIVAA with fallback | **Medium** - Chat + embedding |
| **analyze-knowledge-content** | [`supabase/functions/analyze-knowledge-content/index.ts`](supabase/functions/analyze-knowledge-content/index.ts:113) | GPT-4o + embeddings | MIVAA with fallback | **Medium** - Dual API migration |

### 🟠 **Core Service Integration** (Priority 3)
*Core platform services requiring architectural changes*

| Function | File | OpenAI Usage | MIVAA Status | Migration Complexity |
|----------|------|--------------|--------------|---------------------|
| **embeddingGenerationService** | [`src/services/embeddingGenerationService.ts`](src/services/embeddingGenerationService.ts:6) | Core OpenAI embedding service | None | **High** - Core service refactor |
| **hybridAIService** | [`src/services/hybridAIService.ts`](src/services/hybridAIService.ts:89) | OpenAI client-side calls | None | **Medium** - Add MIVAA routing |

### 🔵 **Specialized Functions** (Priority 4) 
*Domain-specific functions with unique OpenAI integrations*

| Function | File | OpenAI Usage | MIVAA Status | Migration Complexity |
|----------|------|--------------|--------------|---------------------|
| **voice-to-material** | [`supabase/functions/voice-to-material/index.ts`](supabase/functions/voice-to-material/index.ts:171) | Whisper transcription | None | **High** - New MIVAA action needed |
| **pdf-extract** | [`supabase/functions/pdf-extract/index.ts`](supabase/functions/pdf-extract/index.ts:301) | GPT-4 text analysis | MIVAA with fallback | **Medium** - Standardize fallback |
| **crewai-3d-generation** | [`supabase/functions/crewai-3d-generation/index.ts`](supabase/functions/crewai-3d-generation/index.ts:463) | GPT-4o-mini parsing | None | **Low** - Simple text processing |
| **material-agent-orchestrator** | [`supabase/functions/material-agent-orchestrator/index.ts`](supabase/functions/material-agent-orchestrator/index.ts:404) | GPT-4 fallback | MIVAA primary | **Low** - Replace fallback |

### ⚙️ **Configuration & Infrastructure** (Priority 5)
*Configuration files and supporting infrastructure*

| Component | File | OpenAI Usage | MIVAA Status | Migration Complexity |
|-----------|------|--------------|--------------|---------------------|
| **OpenAI API Config** | [`src/config/apis/openaiConfig.ts`](src/config/apis/openaiConfig.ts:1) | Complete OpenAI config | None | **Low** - Keep for fallback |
| **Embedding Config** | [`src/config/embedding.config.ts`](src/config/embedding.config.ts:9) | OpenAI embedding models | MIVAA compatible | **Low** - Already configured |
| **Cost Optimizer** | [`src/services/ml/costOptimizer.ts`](src/services/ml/costOptimizer.ts:418) | OpenAI cost tracking | None | **Low** - Add MIVAA tracking |

## 🎯 Migration Priority Matrix

### **Priority 1: Critical Visual Analysis** (Start Here)
**Target**: Functions performing multimodal analysis requiring LLaMA+CLIP parallel processing

1. **hybrid-material-analysis** - Replace OpenAI fallback with parallel MIVAA pattern
2. **ai-material-analysis** - Standardize hybrid approach to MIVAA-first
3. **extract-material-knowledge** - Migrate both vision and embedding APIs
4. **material-recognition** - Complete existing MIVAA Vision integration

**Template**: Use [`visualFeatureExtractionService.ts`](src/services/visualFeatureExtractionService.ts:475) parallel pattern

### **Priority 2: Embedding Standardization** (Quick Wins)
**Target**: Functions already using MIVAA with OpenAI fallbacks - remove fallback dependency

1. **unified-material-search** - Pure MIVAA embedding generation
2. **enhanced-rag-search** - Pure MIVAA embedding generation  
3. **document-vector-search** - Pure MIVAA embedding generation
4. **rag-knowledge-search** - MIVAA embedding + MIVAA chat completion

**Template**: Standardize MIVAA-only embedding calls with error handling

### **Priority 3: Core Service Migration** (Architectural)
**Target**: Core platform services requiring structural changes

1. **embeddingGenerationService** - Refactor to use MIVAA as primary backend
2. **hybridAIService** - Add MIVAA routing for client-side integration

**Template**: Design new service architecture with MIVAA gateway integration

### **Priority 4: Specialized Functions** (Feature-Specific)
**Target**: Domain-specific functions requiring new MIVAA actions

1. **voice-to-material** - Create `audio_transcription` MIVAA action
2. **pdf-extract** - Standardize text analysis to MIVAA-only
3. **crewai-3d-generation** - Migrate simple parsing to MIVAA
4. **material-agent-orchestrator** - Remove OpenAI fallback completely

## 🛠️ Required MIVAA Gateway Actions

Based on the catalog analysis, the following new MIVAA actions are needed:

### **Immediate Actions** (For Priority 1)
```typescript
// Already implemented ✅
'llama_vision_analysis'        // LLaMA 3.2 Vision multimodal analysis
'clip_embedding_generation'    // CLIP visual embeddings

// Already available ✅  
'semantic_analysis'            // Text analysis and processing
'embedding_generation'         // Text embeddings
```

### **Additional Actions Needed**
```typescript
// Priority 2 & 3
'chat_completion'              // GPT-4 style conversational responses
'contextual_response'          // RAG-aware response generation

// Priority 4  
'audio_transcription'          // Whisper-style audio to text
'text_classification'          // Content categorization
'batch_embedding'              // Bulk embedding generation
```

## 📋 Migration Templates by Pattern

### **Pattern A: Parallel Visual Analysis**
*For functions requiring both LLaMA vision and CLIP embeddings*

```typescript
// Template: visualFeatureExtractionService.ts pattern
const [llamaResult, clipEmbeddings] = await Promise.all([
  mivaaGateway.makeRequest({
    action: 'llama_vision_analysis',
    payload: { image_data, analysis_type, context }
  }),
  mivaaGateway.makeRequest({
    action: 'clip_embedding_generation', 
    payload: { image_data, embedding_type: 'visual_similarity' }
  })
]);
```

**Apply to**: hybrid-material-analysis, ai-material-analysis, extract-material-knowledge

### **Pattern B: MIVAA-Only Embedding**
*For functions currently using OpenAI fallbacks*

```typescript
// Remove OpenAI fallback, use MIVAA-only with error handling
const embedding = await mivaaGateway.makeRequest({
  action: 'embedding_generation',
  payload: { text: query, model: 'text-embedding-ada-002' }
});

if (!embedding.success) {
  throw new Error(`MIVAA embedding generation failed: ${embedding.error}`);
}
```

**Apply to**: unified-material-search, enhanced-rag-search, document-vector-search

### **Pattern C: Core Service Refactor**
*For services requiring architectural changes*

```typescript
// Refactor to use MIVAA as backend while preserving existing interfaces
class EmbeddingGenerationService {
  private mivaaGateway: MivaaGatewayController;
  
  async generateEmbedding(text: string): Promise<number[]> {
    return await this.mivaaGateway.makeRequest({
      action: 'embedding_generation',
      payload: { text, model: this.config.model }
    });
  }
}
```

**Apply to**: embeddingGenerationService, hybridAIService

## 🚀 Implementation Roadmap

### **Phase 1: Critical Visual Functions** (Week 1)
- [ ] Migrate [`hybrid-material-analysis`](supabase/functions/hybrid-material-analysis/index.ts:375) to parallel MIVAA pattern
- [ ] Migrate [`ai-material-analysis`](supabase/functions/ai-material-analysis/index.ts:248) to MIVAA-first
- [ ] Migrate [`extract-material-knowledge`](supabase/functions/extract-material-knowledge/index.ts:155) dual APIs
- [ ] Complete [`material-recognition`](supabase/functions/material-recognition/index.ts:488) MIVAA standardization

### **Phase 2: Embedding Standardization** (Week 2)  
- [ ] Remove OpenAI fallbacks from embedding functions
- [ ] Standardize MIVAA-only embedding generation across platform
- [ ] Implement robust error handling for MIVAA embedding failures
- [ ] Add MIVAA chat completion for RAG response generation

### **Phase 3: Core Service Migration** (Week 3)
- [ ] Refactor [`embeddingGenerationService`](src/services/embeddingGenerationService.ts:6) to MIVAA backend
- [ ] Update [`hybridAIService`](src/services/hybridAIService.ts:89) with MIVAA routing
- [ ] Preserve existing interfaces while changing backend implementation

### **Phase 4: Specialized Functions** (Week 4)
- [ ] Implement `audio_transcription` MIVAA action for voice processing
- [ ] Migrate remaining text processing functions to MIVAA
- [ ] Remove all remaining OpenAI direct calls
- [ ] Implement comprehensive monitoring and fallback strategies

## 💰 Cost & Performance Impact Analysis

### **Current State Costs**
```
Estimated Monthly OpenAI Costs:
- GPT-4o Vision calls: ~$2,400/month (120,000 requests × $0.02)
- text-embedding-ada-002: ~$480/month (2.4M tokens × $0.0002)  
- GPT-4 chat completions: ~$1,200/month (40,000 requests × $0.03)
- Whisper transcriptions: ~$180/month (300 hours × $0.60)

Total Current OpenAI: ~$4,260/month
```

### **Target State with MIVAA**
```
Projected MIVAA Centralized Costs:
- LLaMA 3.2 Vision (TogetherAI): ~$960/month (120,000 requests × $0.008)
- CLIP Embeddings (HuggingFace): ~$120/month (120,000 requests × $0.001)
- Text embeddings (MIVAA): ~$240/month (2.4M tokens × $0.0001)
- Audio transcription (MIVAA): ~$90/month (300 hours × $0.30)

Total Projected MIVAA: ~$1,410/month
Estimated Savings: ~$2,850/month (67% reduction)
```

### **Performance Benefits**
- **Parallel Processing**: LLaMA+CLIP simultaneous analysis maintained
- **Reduced Latency**: Single gateway instead of multiple API calls
- **Better Rate Limiting**: Centralized request management
- **Enhanced Monitoring**: Unified metrics and health checking

## 🔍 Detailed Function Analysis

### **Functions Requiring New MIVAA Actions**

#### 1. Audio Transcription (voice-to-material)
- **Current**: Direct Whisper API at [`supabase/functions/voice-to-material/index.ts:171`](supabase/functions/voice-to-material/index.ts:171)
- **Required**: New `audio_transcription` MIVAA action
- **Endpoint**: `/api/audio/transcribe` with audio file support

#### 2. Chat Completion (rag-knowledge-search)  
- **Current**: GPT-4 chat at [`supabase/functions/rag-knowledge-search/index.ts:186`](supabase/functions/rag-knowledge-search/index.ts:186)
- **Required**: New `chat_completion` MIVAA action
- **Endpoint**: `/api/chat/completions` with context-aware responses

#### 3. Batch Embedding (embeddingGenerationService)
- **Current**: OpenAI batch processing at [`src/services/embeddingGenerationService.ts:450`](src/services/embeddingGenerationService.ts:450)
- **Required**: Enhanced `batch_embedding` MIVAA action
- **Endpoint**: `/api/embeddings/batch` with bulk processing support

## 🎯 Migration Validation Strategy

### **Functional Testing**
1. **Performance Benchmarks**: Measure latency before/after migration
2. **Accuracy Validation**: Compare MIVAA vs OpenAI analysis results  
3. **Cost Tracking**: Monitor actual cost savings per function
4. **Error Rate Monitoring**: Track MIVAA vs OpenAI failure rates

### **Regression Prevention**
1. **A/B Testing**: Run MIVAA and OpenAI in parallel initially
2. **Gradual Rollout**: Migrate functions incrementally with rollback capability
3. **Monitoring Dashboards**: Real-time health and performance tracking
4. **Fallback Mechanisms**: Temporary OpenAI fallbacks during transition

### **Success Metrics**
- **Cost Reduction**: Target 60%+ reduction in AI API costs
- **Performance Maintenance**: <10% latency increase acceptable
- **Reliability Improvement**: 99.5%+ uptime for multimodal analysis
- **Developer Experience**: Simplified integration patterns

## 📁 Implementation Artifacts

### **Created Documents**
1. **[MIVAA_Unified_Integration_Strategy.md](docs/architecture/MIVAA_Unified_Integration_Strategy.md)** - Overall strategy and architecture
2. **[This Document]** - Complete catalog and migration plan
3. **[Enhanced visualFeatureExtractionService](src/services/visualFeatureExtractionService.ts:475)** - Parallel MIVAA pattern implementation

### **Next Documents**
1. **ADR-MIVAA-Standardization.md** - Architectural decision record
2. **MIVAA-Integration-Templates.md** - Standard integration patterns
3. **Migration-Validation-Plan.md** - Testing and rollback strategies
4. **Cost-Performance-Analysis.md** - Detailed financial and performance impact

## 🔄 Next Steps (Immediate)

1. **Complete MIVAA Gateway Actions** - Implement remaining actions needed for Priority 1 functions
2. **Migrate hybrid-material-analysis** - Use as proof-of-concept for parallel pattern  
3. **Create ADR Documentation** - Document architectural decisions and rationale
4. **Implement Validation Framework** - A/B testing and performance monitoring
5. **Develop Migration Scripts** - Automated tools for consistent migration patterns

The foundation is established - now executing systematic migration across the platform to achieve unified MIVAA-first architecture with substantial cost savings and improved maintainability.