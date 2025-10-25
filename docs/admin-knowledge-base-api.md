# Admin Knowledge Base - API Documentation

## Overview

This document describes the 6 new Supabase Edge Functions that power the Admin Knowledge Base Integration.

**Base URL:** `https://[your-project].supabase.co/functions/v1/`

**Authentication:** All endpoints require Bearer token authentication.

---

## Endpoints

### 1. Metadata Management

**Endpoint:** `GET /admin-kb-metadata`

**Purpose:** Centralized metadata management for chunks, images, and products

**Query Parameters:**
- `workspace_id` (required) - Workspace UUID
- `entity_type` (optional) - Filter by type: `chunks`, `images`, `products`, or omit for all

**Response:**
```json
{
  "workspace_id": "uuid",
  "metadata": {
    "chunks": [
      {
        "id": "uuid",
        "content_preview": "First 100 chars...",
        "metadata": { "key": "value" },
        "quality": {
          "coherence_score": 0.95,
          "boundary_quality": 0.88,
          "quality_score": 0.92,
          "quality_assessment": "excellent"
        }
      }
    ],
    "images": [...],
    "products": [...]
  },
  "summary": {
    "total_entities": 150,
    "entities_with_metadata": 142,
    "metadata_fields": ["field1", "field2", ...]
  }
}
```

**Database Tables:**
- `document_chunks` - Chunk metadata
- `document_images` - Image metadata
- `products` - Product metadata

---

### 2. Quality Scores

**Endpoint:** `GET /admin-kb-quality-scores`

**Purpose:** Quality scores aggregation from 4 quality tables

**Query Parameters:**
- `workspace_id` (required) - Workspace UUID

**Response:**
```json
{
  "workspace_id": "uuid",
  "kpis": {
    "chunks": {
      "total_validated": 1250,
      "avg_overall_score": "0.875",
      "avg_content_quality": "0.892",
      "avg_boundary_quality": "0.845",
      "avg_semantic_coherence": "0.888",
      "avg_completeness": "0.876",
      "valid_count": 1180,
      "invalid_count": 45,
      "needs_review_count": 25
    },
    "images": {
      "total_validated": 450,
      "avg_quality_score": "0.912",
      "avg_relevance_score": "0.885",
      "avg_ocr_confidence": "0.765",
      "valid_count": 425,
      "invalid_count": 15,
      "needs_review_count": 10
    },
    "products": {
      "total": 85,
      "avg_quality_score": "0.845",
      "avg_confidence_score": "0.823",
      "avg_completeness_score": "0.867"
    },
    "documents": {
      "total_processed": 42,
      "avg_quality_score": "0.856",
      "avg_completeness": "0.834"
    }
  },
  "distributions": {
    "chunks": {
      "excellent": 850,
      "good": 280,
      "fair": 95,
      "poor": 25
    },
    "images": {...},
    "products": {...}
  },
  "trends": {}
}
```

**Database Tables:**
- `chunk_validation_scores` - Chunk quality scores
- `image_validations` - Image quality validations
- `products` - Product quality columns
- `document_quality_metrics` - Document-level quality

---

### 3. Embeddings Statistics

**Endpoint:** `GET /admin-kb-embeddings-stats`

**Purpose:** Embeddings statistics and coverage metrics

**Query Parameters:**
- `workspace_id` (required) - Workspace UUID

**Response:**
```json
{
  "workspace_id": "uuid",
  "total_embeddings": 1850,
  "by_type": {
    "text": 1250,
    "image": 450,
    "hybrid": 150
  },
  "by_model": {
    "text-embedding-3-small": 1100,
    "text-embedding-3-large": 150,
    "clip-vit-base-patch32": 450,
    "custom-model": 150
  },
  "by_embedding_type": {
    "chunk": 1250,
    "image": 450,
    "product": 150
  },
  "coverage": {
    "chunks": {
      "total": 1250,
      "with_embeddings": 1250,
      "coverage_percentage": "100.00"
    },
    "images": {
      "total": 500,
      "with_embeddings": 450,
      "coverage_percentage": "90.00"
    },
    "products": {
      "total": 200,
      "with_embeddings": 150,
      "coverage_percentage": "75.00"
    }
  }
}
```

**Database Tables:**
- `embeddings` - Vector embeddings
- `document_vectors` - Document vector storage
- `document_chunks` - Chunk counts
- `document_images` - Image counts
- `products` - Product counts

---

### 4. Detection Events

**Endpoint:** `GET /admin-kb-detections`

**Purpose:** Detection event tracking and confidence monitoring

**Query Parameters:**
- `workspace_id` (required) - Workspace UUID
- `detection_type` (optional) - Filter by type: `product`, `image`, `chunk`
- `start_date` (optional) - ISO 8601 date string
- `end_date` (optional) - ISO 8601 date string

**Response:**
```json
{
  "workspace_id": "uuid",
  "timeline": [
    {
      "id": "uuid",
      "detection_type": "product",
      "entity_id": "uuid",
      "confidence": 0.92,
      "created_at": "2025-10-25T10:30:00Z",
      "metadata": {}
    }
  ],
  "confidence_stats": {
    "avg_confidence": "0.875",
    "min_confidence": "0.650",
    "max_confidence": "0.985"
  },
  "event_summary": {
    "total_events": 1850,
    "by_type": {
      "product": 850,
      "image": 650,
      "chunk": 350
    }
  }
}
```

**Database Tables:**
- `quality_scoring_logs` - Enhanced with detection tracking columns:
  - `detection_type` (TEXT) - 'product', 'image', or 'chunk'
  - `entity_id` (UUID) - References the detected entity
  - `confidence` (NUMERIC) - Detection confidence score (0-1)

---

### 5. Quality Dashboard

**Endpoint:** `GET /admin-kb-quality-dashboard`

**Purpose:** Daily quality KPIs, trends, and alerts

**Query Parameters:**
- `workspace_id` (required) - Workspace UUID
- `days` (optional) - Number of days for trends (default: 30)

**Response:**
```json
{
  "workspace_id": "uuid",
  "current_kpis": {
    "total_chunks": 1250,
    "total_images": 500,
    "total_products": 200,
    "total_embeddings": 1850,
    "avg_chunk_quality": "0.875",
    "avg_image_quality": "0.912",
    "avg_product_quality": "0.845",
    "embedding_coverage": "92.50"
  },
  "trends": {
    "daily_chunks": [
      { "date": "2025-10-25", "count": 45 },
      { "date": "2025-10-24", "count": 38 }
    ],
    "daily_images": [...],
    "daily_products": [...],
    "daily_embeddings": [...]
  },
  "alerts": [
    {
      "severity": "high",
      "type": "low_quality",
      "message": "15 chunks with quality score < 0.5",
      "affected_count": 15
    },
    {
      "severity": "medium",
      "type": "missing_embeddings",
      "message": "50 images without embeddings",
      "affected_count": 50
    }
  ],
  "daily_metrics": [
    {
      "metric_date": "2025-10-25",
      "chunks_created": 45,
      "images_extracted": 18,
      "products_detected": 8,
      "embeddings_generated": 52,
      "avg_quality_score": "0.876"
    }
  ]
}
```

**Database Tables:**
- `quality_metrics_daily` - Daily aggregated metrics
- `document_chunks` - Chunk counts
- `document_images` - Image counts
- `products` - Product counts
- `embeddings` - Embedding counts

---

### 6. Patterns & Insights

**Endpoint:** `GET /admin-kb-patterns`

**Purpose:** AI-driven pattern detection and recommendations

**Query Parameters:**
- `workspace_id` (required) - Workspace UUID

**Response:**
```json
{
  "workspace_id": "uuid",
  "patterns": [
    {
      "id": "pattern-1",
      "type": "quality_trend",
      "severity": "medium",
      "title": "Declining chunk quality in recent uploads",
      "description": "Quality scores have decreased by 12% over the last 7 days",
      "affected_entities": 85,
      "recommendation": "Review chunking parameters and document preprocessing"
    }
  ],
  "anomalies": [
    {
      "id": "anomaly-1",
      "type": "embedding_gap",
      "severity": "high",
      "title": "Large gap in embedding coverage",
      "description": "25% of images lack embeddings",
      "affected_entities": 125,
      "recommendation": "Run batch embedding generation for missing images"
    }
  ],
  "recommendations": [
    {
      "id": "rec-1",
      "priority": "high",
      "category": "quality_improvement",
      "title": "Optimize chunk boundary detection",
      "description": "Boundary quality scores are below target (0.75 vs 0.85 target)",
      "impact": "Improved semantic coherence and search accuracy",
      "action": "Adjust boundary detection parameters in chunking service"
    }
  ]
}
```

**Database Tables:**
- `chunk_validation_scores` - Quality patterns
- `image_validations` - Image quality patterns
- `products` - Product quality patterns
- `embeddings` - Embedding coverage patterns
- `quality_scoring_logs` - Detection patterns

---

## Authentication

All endpoints require authentication using Supabase session token:

```javascript
const { data: { session } } = await supabase.auth.getSession();

const response = await fetch(
  `${SUPABASE_URL}/functions/v1/admin-kb-metadata?workspace_id=${workspaceId}`,
  {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      'Content-Type': 'application/json',
    },
  }
);
```

---

## Error Handling

All endpoints return standard HTTP status codes:

- `200 OK` - Success
- `400 Bad Request` - Missing or invalid parameters
- `401 Unauthorized` - Invalid or missing authentication
- `403 Forbidden` - Insufficient permissions
- `500 Internal Server Error` - Server-side error

Error response format:
```json
{
  "error": "Error message description"
}
```

---

## Rate Limiting

- No explicit rate limits currently enforced
- Recommended: Max 60 requests per minute per user
- Auto-refresh default: 30 seconds (2 requests per minute)

---

## Best Practices

### Performance
1. Use `entity_type` parameter to filter metadata queries
2. Limit `days` parameter for dashboard queries (default 30 is optimal)
3. Cache responses when appropriate
4. Use debounced search to reduce API calls

### Data Freshness
1. Enable auto-refresh for live monitoring (30s interval)
2. Manual refresh for on-demand updates
3. Daily metrics updated once per day (midnight UTC)

### Error Handling
1. Always check response status codes
2. Implement retry logic for 500 errors
3. Handle missing data gracefully
4. Log errors for debugging

---

**Last Updated:** 2025-10-25
**Version:** 1.0.0

