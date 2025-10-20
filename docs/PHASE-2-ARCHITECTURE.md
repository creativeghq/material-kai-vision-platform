# Phase 2: Quality & Enrichment - Architecture

**Phase**: 2 (Quality & Enrichment)  
**Status**: 3/4 sub-phases complete  
**Total Components**: 3 services, 2 edge functions, 4 database tables

---

## 🏗️ SYSTEM ARCHITECTURE

```
┌─────────────────────────────────────────────────────────────┐
│                    Frontend (React)                         │
│                  Quality Dashboard (2.4)                    │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│                  Service Layer (TypeScript)                 │
├─────────────────────────────────────────────────────────────┤
│ • ImageValidationService (2.1)                              │
│ • ProductEnrichmentService (2.2)                            │
│ • ValidationRulesService (2.3)                              │
│ • QualityDashboardService (2.4)                             │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Edge Functions (Deno/TypeScript)               │
├─────────────────────────────────────────────────────────────┤
│ • validate-images (2.1)                                     │
│ • enrich-products (2.2)                                     │
└────────────────────────┬────────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────────┐
│              Database Layer (PostgreSQL)                    │
├─────────────────────────────────────────────────────────────┤
│ • image_validations (2.1)                                   │
│ • product_enrichments (2.2)                                 │
│ • validation_rules (2.3)                                    │
│ • validation_results (2.3)                                  │
└─────────────────────────────────────────────────────────────┘
```

---

## 📦 COMPONENT BREAKDOWN

### Phase 2.1: Image Validation

**Service**: `ImageValidationService`
```
validateImage(request) → ImageValidationResponse
validateImages(request) → BatchImageValidationResponse
getImagesNeedingReview(workspaceId) → ImageValidation[]
getValidationStats(workspaceId) → ImageValidationStats
```

**Edge Function**: `validate-images`
```
POST /functions/v1/validate-images
{
  image_ids: string[];
  workspace_id: string;
  validation_rules?: {...};
}
```

**Database**: `image_validations`
```
Columns: 16
Indexes: 6
RLS Policies: 4
```

---

### Phase 2.2: Product Enrichment

**Service**: `ProductEnrichmentService`
```
enrichChunk(request) → ProductEnrichmentResponse
enrichChunks(request) → BatchProductEnrichmentResponse
getEnrichmentsNeedingReview(workspaceId) → ProductEnrichment[]
getEnrichmentStats(workspaceId) → ProductEnrichmentStats
```

**Edge Function**: `enrich-products`
```
POST /functions/v1/enrich-products
{
  chunk_ids: string[];
  workspace_id: string;
  enrichment_rules?: {...};
}
```

**Database**: `product_enrichments`
```
Columns: 20
Indexes: 7
RLS Policies: 4
```

---

### Phase 2.3: Validation Rules

**Service**: `ValidationRulesService`
```
createRule(request) → ValidationRule
getActiveRules(workspaceId) → ValidationRule[]
validateChunk(request) → ValidationResponse
validateChunks(request) → BatchValidationResponse
getValidationStats(workspaceId) → ValidationStats
```

**Database**: 
- `validation_rules` (14 columns, 5 indexes, 4 RLS policies)
- `validation_results` (11 columns, 7 indexes, 4 RLS policies)

---

### Phase 2.4: Quality Dashboard (Planned)

**Service**: `QualityDashboardService`
```
getOverallMetrics(workspaceId) → DashboardMetrics
getImageMetrics(workspaceId) → ImageMetrics
getEnrichmentMetrics(workspaceId) → EnrichmentMetrics
getValidationMetrics(workspaceId) → ValidationMetrics
```

**Components**:
- OverallMetricsCard
- ImageValidationChart
- ProductEnrichmentChart
- ValidationRulesChart
- QualityTrendChart

---

## 🔄 DATA FLOW

### Image Validation Flow
```
1. Upload Image
   ↓
2. ImageValidationService.validateImage()
   ↓
3. validate-images Edge Function
   ↓
4. Store in image_validations table
   ↓
5. Return validation result
```

### Product Enrichment Flow
```
1. Process Chunk
   ↓
2. ProductEnrichmentService.enrichChunk()
   ↓
3. enrich-products Edge Function
   ↓
4. Extract metadata, specifications, related products
   ↓
5. Store in product_enrichments table
   ↓
6. Return enrichment result
```

### Validation Rules Flow
```
1. Create Validation Rule
   ↓
2. ValidationRulesService.createRule()
   ↓
3. Store in validation_rules table
   ↓
4. Apply to chunks
   ↓
5. Store results in validation_results table
   ↓
6. Generate statistics
```

---

## 🗄️ DATABASE SCHEMA

### image_validations
```
id (UUID) → Primary Key
image_id (UUID) → FK to document_images
workspace_id (UUID) → Workspace reference
validation_status (TEXT) → pending|valid|invalid|needs_review
quality_score (NUMERIC) → 0-1
dimensions_valid (BOOLEAN)
format_valid (BOOLEAN)
file_size_valid (BOOLEAN)
ocr_confidence (NUMERIC) → 0-1
relevance_score (NUMERIC) → 0-1
quality_metrics (JSONB)
issues (JSONB)
recommendations (JSONB)
validated_at (TIMESTAMPTZ)
created_at (TIMESTAMPTZ)
updated_at (TIMESTAMPTZ)
```

### product_enrichments
```
id (UUID) → Primary Key
chunk_id (UUID) → FK to document_chunks
workspace_id (UUID) → Workspace reference
enrichment_status (TEXT) → pending|enriched|failed|needs_review
product_name (TEXT)
product_category (TEXT) → electronics|furniture|clothing|...
product_description (TEXT)
long_description (TEXT)
short_description (TEXT)
metadata (JSONB)
specifications (JSONB)
related_products (TEXT[])
image_references (JSONB)
confidence_score (NUMERIC) → 0-1
enrichment_score (NUMERIC) → 0-1
issues (JSONB)
recommendations (JSONB)
enriched_at (TIMESTAMPTZ)
created_at (TIMESTAMPTZ)
updated_at (TIMESTAMPTZ)
```

### validation_rules
```
id (UUID) → Primary Key
workspace_id (UUID) → Workspace reference
rule_name (TEXT)
rule_type (TEXT) → content_quality|boundary_quality|...
rule_description (TEXT)
rule_definition (JSONB)
is_active (BOOLEAN)
priority (INTEGER) → 1-100
severity (TEXT) → info|warning|error|critical
auto_fix (BOOLEAN)
fix_action (TEXT)
created_by (UUID)
created_at (TIMESTAMPTZ)
updated_at (TIMESTAMPTZ)
```

### validation_results
```
id (UUID) → Primary Key
chunk_id (UUID) → FK to document_chunks
rule_id (UUID) → FK to validation_rules
workspace_id (UUID) → Workspace reference
passed (BOOLEAN)
severity (TEXT) → info|warning|error|critical
message (TEXT)
details (JSONB)
issues (JSONB)
validated_at (TIMESTAMPTZ)
created_at (TIMESTAMPTZ)
updated_at (TIMESTAMPTZ)
```

---

## 🔐 Security Model

### RLS Policies
- All tables use workspace-based isolation
- Pattern: `(workspace_id = auth.uid()) OR (workspace_id IS NULL)`
- 4 policies per table (SELECT, INSERT, UPDATE, DELETE)
- Total: 16 RLS policies

### Authentication
- JWT-based authentication
- User ID from `auth.uid()`
- Workspace membership validation

---

## 📊 Performance Optimization

### Indexes
- 25 total indexes across 4 tables
- Composite indexes for common queries
- Indexes on foreign keys
- Indexes on status and priority fields

### Caching
- Rule caching in ValidationRulesService
- TTL-based cache invalidation
- Workspace-scoped cache

---

## 🧪 Testing Strategy

### Unit Tests
- 66 total tests
- 90%+ code coverage
- Service initialization tests
- Feature-specific tests
- Error handling tests

### Integration Tests
- Database operation tests
- RLS policy tests
- Edge function tests

---

**Architecture Status**: ✅ COMPLETE (3/4 phases)  
**Ready for**: Phase 2.4 Quality Dashboard

