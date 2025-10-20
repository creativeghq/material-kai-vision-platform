# Implementation Plan: Multi-Model PDF Processing System

**Date**: 2025-10-19  
**Status**: Ready for Implementation  
**Duration**: 4-5 weeks  
**Cost**: $220/month (100 PDFs)

---

## Pre-Implementation: Model Upgrades

### Upgrade OpenAI Models
**Objective**: Upgrade from gpt-3.5-turbo to gpt-4o
**Impact**: Search relevancy 45% → 95%, cost +$50/month

**Tasks**:
- [ ] Update `mivaa-pdf-extractor/app/config.py`
  - `openai_model`: "gpt-3.5-turbo" → "gpt-4o"
  - `multimodal_llm_model`: "gpt-4-vision-preview" → "gpt-4o"
  - `image_analysis_model`: "gpt-4-vision-preview" → "gpt-4o"
- [ ] Update `mivaa-pdf-extractor/app/services/llamaindex_service.py`
  - `self.llm_model`: "gpt-3.5-turbo" → "gpt-4o"
  - `self.multimodal_llm_model`: "gpt-4-vision-preview" → "gpt-4o"
- [ ] Update `src/components/AI/MaterialAgentSearchInterface.tsx`
- [ ] Test RAG synthesis quality
- [ ] Verify cost tracking

---

## Phase 1: Foundation (Week 1-2)

### 1.1 Content Classification Service
**Objective**: Classify PDF chunks by content type
**Models**: Claude 3.5 Haiku (primary), Llama fallback
**Deliverables**:
- ContentClassificationService (TypeScript)
- Classification prompts & templates
- Confidence scoring logic
- Error handling & retries

**Tasks**:
- [ ] Create ContentClassificationService
- [ ] Implement Claude 3.5 Haiku integration
- [ ] Add Llama fallback logic
- [ ] Add unit tests
- [ ] Add integration tests

**Files to Create/Modify**:
- `src/services/ContentClassificationService.ts` (new)
- `supabase/functions/classify-content/index.ts` (new)
- Tests in `src/services/__tests__/`

---

### 1.2 Boundary Detection Enhancement
**Objective**: Improve product boundary detection  
**Models**: OpenAI embeddings (primary), Llama fallback  
**Deliverables**:
- Enhanced BoundaryDetectionService
- Semantic clustering logic
- Boundary validation

**Tasks**:
- [ ] Review existing BoundaryDetectionService
- [ ] Enhance clustering algorithm
- [ ] Add Llama fallback
- [ ] Add unit tests

**Files to Modify**:
- `src/services/BoundaryDetectionService.ts`
- Tests in `src/services/__tests__/`

---

### 1.3 Database Schema Updates
**Objective**: Support new classification & validation data  
**Deliverables**:
- New tables/columns for classifications
- Validation scores storage
- Metadata extensions

**Tasks**:
- [ ] Design schema changes
- [ ] Create Supabase migrations
- [ ] Update TypeScript types
- [ ] Add RLS policies

**Files to Modify**:
- `supabase/migrations/` (new)
- `src/types/database.ts`

---

### 1.4 Text & Image Search Integration
**Objective**: Ensure search works with new data  
**Deliverables**:
- Updated search queries
- Embedding generation for new fields
- Search result ranking

**Tasks**:
- [ ] Update MaterialVisualSearchService
- [ ] Add embedding generation for new fields
- [ ] Test search functionality
- [ ] Optimize query performance

**Files to Modify**:
- `mivaa-pdf-extractor/app/services/material_visual_search_service.py`
- `src/services/ragKnowledgeService.ts`

---

## Phase 2: Quality & Enrichment (Week 2-3)

### 2.1 Image Validation Service
**Objective**: Validate image-product associations  
**Models**: Claude Sonnet (primary), CLIP+Llama fallback  
**Deliverables**:
- ImageValidationService
- Vision-based validation logic
- Confidence scoring

**Tasks**:
- [ ] Create ImageValidationService
- [ ] Implement Claude Vision integration
- [ ] Add CLIP+Llama fallback
- [ ] Add unit tests

**Files to Create/Modify**:
- `src/services/ImageValidationService.ts` (new)
- `supabase/functions/validate-images/index.ts` (new)
- Tests in `src/services/__tests__/`

---

### 2.2 Product Enrichment Service
**Objective**: Generate complete product records  
**Models**: Claude Sonnet  
**Deliverables**:
- ProductEnrichmentService
- Image caption generation
- Visual property extraction
- Product summary generation

**Tasks**:
- [ ] Create ProductEnrichmentService
- [ ] Implement Claude Sonnet integration
- [ ] Add caption generation
- [ ] Add property extraction
- [ ] Add unit tests

**Files to Create/Modify**:
- `src/services/ProductEnrichmentService.ts` (new)
- `supabase/functions/enrich-products/index.ts` (new)
- Tests in `src/services/__tests__/`

---

### 2.3 Metadata & Validation Rules
**Objective**: Ensure data quality  
**Deliverables**:
- Validation rule engine
- Metadata consistency checks
- Quality scoring

**Tasks**:
- [ ] Design validation rules
- [ ] Implement rule engine
- [ ] Add quality scoring
- [ ] Add unit tests

**Files to Create/Modify**:
- `src/services/ValidationRuleEngine.ts` (new)
- Tests in `src/services/__tests__/`

---

## Phase 3: Search Enhancement (Week 3-4)

### 3.1 Search Re-ranking Service
**Objective**: Optional premium search re-ranking  
**Models**: Claude Sonnet  
**Deliverables**:
- SearchReRankingService
- Relevance analysis
- Explanation generation

**Tasks**:
- [ ] Create SearchReRankingService
- [ ] Implement Claude Sonnet integration
- [ ] Add relevance analysis
- [ ] Add explanation generation
- [ ] Add unit tests

**Files to Create/Modify**:
- `src/services/SearchReRankingService.ts` (new)
- `supabase/functions/rerank-search/index.ts` (new)
- Tests in `src/services/__tests__/`

---

### 3.2 Mixed Query Support
**Objective**: Support text + image queries  
**Deliverables**:
- Mixed query handler
- Result fusion logic
- Ranking optimization

**Tasks**:
- [ ] Enhance MaterialVisualSearchService
- [ ] Add mixed query support
- [ ] Optimize result fusion
- [ ] Add unit tests

**Files to Modify**:
- `mivaa-pdf-extractor/app/services/material_visual_search_service.py`
- `src/services/ragKnowledgeService.ts`

---

## Phase 4: Testing & Optimization (Week 4-5)

### 4.1 End-to-End Testing
**Objective**: Validate complete workflow  
**Deliverables**:
- E2E test suite
- Performance benchmarks
- Quality metrics

**Tasks**:
- [ ] Create E2E test suite
- [ ] Test all stages
- [ ] Measure performance
- [ ] Validate quality metrics

**Files to Create/Modify**:
- `tests/e2e/pdf-processing.test.ts` (new)
- `tests/e2e/search.test.ts` (new)

---

### 4.2 Model Testing & Validation
**Objective**: Ensure models work correctly  
**Deliverables**:
- Model validation tests
- Output quality checks
- Fallback testing

**Tasks**:
- [ ] Create model validation tests
- [ ] Test Claude Haiku classification
- [ ] Test Claude Sonnet validation
- [ ] Test Claude Sonnet enrichment
- [ ] Test fallback mechanisms
- [ ] Validate output quality

**Files to Create/Modify**:
- `tests/models/classification.test.ts` (new)
- `tests/models/validation.test.ts` (new)
- `tests/models/enrichment.test.ts` (new)

---

### 4.3 Performance Optimization
**Objective**: Optimize for scale  
**Deliverables**:
- Caching strategy
- Batch processing
- Query optimization

**Tasks**:
- [ ] Implement caching
- [ ] Add batch processing
- [ ] Optimize queries
- [ ] Benchmark performance

**Files to Modify**:
- Various service files

---

### 4.4 Quality Dashboard
**Objective**: Monitor system quality  
**Deliverables**:
- Quality metrics dashboard
- Performance monitoring
- Error tracking

**Tasks**:
- [ ] Create quality dashboard
- [ ] Add metrics collection
- [ ] Add performance monitoring
- [ ] Add error tracking

**Files to Create/Modify**:
- `src/pages/admin/quality-dashboard.tsx` (new)
- `src/services/MetricsService.ts` (new)

---

## Implementation Checklist

### Pre-Implementation
- [ ] Review model-allocation-and-architecture.md
- [ ] Approve implementation plan
- [ ] Set up development environment
- [ ] Configure API keys (Claude, OpenAI, TogetherAI)

### Phase 1
- [ ] Content Classification Service
- [ ] Boundary Detection Enhancement
- [ ] Database Schema Updates
- [ ] Text & Image Search Integration
- [ ] Phase 1 Testing

### Phase 2
- [ ] Image Validation Service
- [ ] Product Enrichment Service
- [ ] Metadata & Validation Rules
- [ ] Phase 2 Testing

### Phase 3
- [ ] Search Re-ranking Service
- [ ] Mixed Query Support
- [ ] Phase 3 Testing

### Phase 4
- [ ] End-to-End Testing
- [ ] Model Testing & Validation
- [ ] Performance Optimization
- [ ] Quality Dashboard
- [ ] Final Testing & Deployment

---

## Success Criteria

- ✅ All services implemented and tested
- ✅ Search relevancy: 45% → 95%
- ✅ Product quality: 100% complete records
- ✅ Processing cost: $1.70/PDF
- ✅ Processing speed: <5 seconds/PDF
- ✅ Error rate: <1%
- ✅ All tests passing
- ✅ Documentation complete

---

**Next**: Start Phase 1 Implementation

