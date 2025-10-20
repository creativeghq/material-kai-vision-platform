# ChunkAnalysisService Guide

**Service**: `src/services/ChunkAnalysisService.ts`  
**Types**: `src/types/chunk-analysis.ts`  
**Database Tables**: chunk_classifications, chunk_boundaries, chunk_validation_scores

---

## Overview

ChunkAnalysisService manages database operations for chunk analysis data:
- **Classifications**: Content type classification results (product, specification, etc.)
- **Boundaries**: Semantic boundary detection results (sentence, paragraph, semantic, etc.)
- **Validation Scores**: Quality metrics and validation status

---

## Import

```typescript
import { chunkAnalysisService } from '@/services/ChunkAnalysisService';
import {
  ChunkClassification,
  ChunkBoundary,
  ChunkValidationScore,
  ContentType,
  BoundaryType,
  ValidationStatus
} from '@/types/chunk-analysis';
```

---

## Classification Operations

### Insert Single Classification
```typescript
const classification = await chunkAnalysisService.insertClassification({
  chunk_id: 'chunk-123',
  workspace_id: 'workspace-123',
  content_type: 'product',
  confidence: 0.95,
  reasoning: 'Contains product description',
  sub_categories: ['fabric', 'textile'],
  model_name: 'claude-4-5-haiku-20250514',
  processing_time_ms: 250
});
```

### Batch Insert Classifications
```typescript
const classifications = await chunkAnalysisService.insertClassifications([
  {
    chunk_id: 'chunk-123',
    content_type: 'product',
    confidence: 0.95
  },
  {
    chunk_id: 'chunk-124',
    content_type: 'specification',
    confidence: 0.88
  }
]);
```

### Get Classifications for Chunk
```typescript
const classifications = await chunkAnalysisService.getClassifications('chunk-123');
// Returns: ChunkClassification[]
```

### Get Classification Statistics
```typescript
const stats = await chunkAnalysisService.getClassificationStats('workspace-123');
// Returns: { content_type: string, count: number, avg_confidence: number }[]
```

---

## Boundary Operations

### Insert Single Boundary
```typescript
const boundary = await chunkAnalysisService.insertBoundary({
  chunk_id: 'chunk-123',
  next_chunk_id: 'chunk-124',
  workspace_id: 'workspace-123',
  boundary_score: 0.85,
  boundary_type: 'sentence',
  semantic_similarity: 0.45,
  is_product_boundary: true,
  reasoning: 'Strong sentence boundary detected'
});
```

### Batch Insert Boundaries
```typescript
const boundaries = await chunkAnalysisService.insertBoundaries([
  {
    chunk_id: 'chunk-123',
    next_chunk_id: 'chunk-124',
    boundary_score: 0.85,
    boundary_type: 'sentence'
  },
  {
    chunk_id: 'chunk-124',
    next_chunk_id: 'chunk-125',
    boundary_score: 0.72,
    boundary_type: 'paragraph'
  }
]);
```

### Get Boundaries for Chunk
```typescript
const boundaries = await chunkAnalysisService.getBoundaries('chunk-123');
// Returns: ChunkBoundary[]
```

### Get Product Boundaries
```typescript
const productBoundaries = await chunkAnalysisService.getProductBoundaries('workspace-123');
// Returns: ChunkBoundary[] (filtered by is_product_boundary = true)
```

### Get Boundary Statistics
```typescript
const stats = await chunkAnalysisService.getBoundaryStats('workspace-123');
// Returns: { boundary_type: string, count: number, avg_score: number }[]
```

---

## Validation Operations

### Insert Validation Score
```typescript
const validation = await chunkAnalysisService.insertValidationScore({
  chunk_id: 'chunk-123',
  workspace_id: 'workspace-123',
  content_quality_score: 0.9,
  boundary_quality_score: 0.85,
  semantic_coherence_score: 0.88,
  completeness_score: 0.92,
  overall_validation_score: 0.89,
  validation_status: 'validated',
  validation_notes: 'Good quality chunk',
  issues: [
    {
      type: 'boundary_quality',
      severity: 'low',
      description: 'Minor boundary issue'
    }
  ],
  recommendations: [
    {
      type: 'merge_with_next',
      description: 'Consider merging with next chunk',
      priority: 'low'
    }
  ]
});
```

### Batch Insert Validation Scores
```typescript
const validations = await chunkAnalysisService.insertValidationScores([
  {
    chunk_id: 'chunk-123',
    overall_validation_score: 0.89,
    validation_status: 'validated'
  },
  {
    chunk_id: 'chunk-124',
    overall_validation_score: 0.65,
    validation_status: 'needs_review'
  }
]);
```

### Get Validation Scores for Chunk
```typescript
const scores = await chunkAnalysisService.getValidationScores('chunk-123');
// Returns: ChunkValidationScore[]
```

### Get Chunks Needing Review
```typescript
const needsReview = await chunkAnalysisService.getChunksNeedingReview('workspace-123');
// Returns: ChunkValidationScore[] (filtered by validation_status = 'needs_review')
```

### Get Validation Statistics
```typescript
const stats = await chunkAnalysisService.getValidationStats('workspace-123');
// Returns: { validation_status: string, count: number, avg_score: number }[]
```

---

## Comprehensive Analysis

### Get Complete Chunk Analysis
```typescript
const analysis = await chunkAnalysisService.getChunkAnalysis('chunk-123');
// Returns:
// {
//   chunk_id: string,
//   classifications: ChunkClassification[],
//   boundaries: ChunkBoundary[],
//   validation_scores: ChunkValidationScore[]
// }
```

---

## Types Reference

### ContentType
```typescript
type ContentType = 
  | 'product'
  | 'specification'
  | 'introduction'
  | 'legal_disclaimer'
  | 'technical_detail'
  | 'marketing'
  | 'other';
```

### BoundaryType
```typescript
type BoundaryType = 
  | 'sentence'
  | 'paragraph'
  | 'section'
  | 'semantic'
  | 'weak';
```

### ValidationStatus
```typescript
type ValidationStatus = 
  | 'pending'
  | 'validated'
  | 'needs_review'
  | 'rejected';
```

---

## Error Handling

```typescript
try {
  const classification = await chunkAnalysisService.insertClassification({
    chunk_id: 'chunk-123',
    content_type: 'product',
    confidence: 0.95
  });
} catch (error) {
  console.error('Failed to insert classification:', error);
  // Handle error appropriately
}
```

---

## Best Practices

1. **Always provide workspace_id** for proper isolation
2. **Use batch operations** for multiple inserts (better performance)
3. **Check validation_status** before using chunks in production
4. **Monitor quality scores** to identify problematic chunks
5. **Use getChunkAnalysis()** for comprehensive chunk review

---

**Status**: ✅ PRODUCTION READY

