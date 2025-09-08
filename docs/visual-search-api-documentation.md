# Visual Search API Documentation

## Overview

The Visual Search API provides comprehensive material recognition, visual analysis, and similarity search capabilities using LLaMA 3.2 Vision integration. The system enables users to analyze material images, extract detailed visual features, and perform similarity matching across large material catalogs.

## Architecture

- **Backend**: Supabase Edge Functions (TypeScript/Deno)
- **AI Models**: LLaMA 3.2-90B-Vision-Instruct-Turbo via Together AI
- **Database**: PostgreSQL with pgvector for similarity search
- **Storage**: Supabase Storage for image management
- **Response Format**: Standardized EdgeFunctionResponse pattern

## Base URL

```
https://your-project.supabase.co/functions/v1/
```

## Authentication

All endpoints require Supabase authentication. Include your API key in the Authorization header:

```
Authorization: Bearer YOUR_SUPABASE_ANON_KEY
```

## Endpoints

### 1. Material Recognition (Enhanced)

**Endpoint**: `POST /material-recognition`

Enhanced material recognition with comprehensive visual analysis capabilities.

#### Request Body

```json
{
  "image_url": "https://example.com/image.jpg",
  "image_data": "base64_encoded_image_data", // Alternative to image_url
  "analysis_type": "comprehensive", // "basic" | "detailed" | "comprehensive"
  "confidence_threshold": 0.7,
  "use_llama_vision": true,
  "enable_visual_analysis": true,
  "user_id": "user_123",
  "workspace_id": "workspace_456"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "materials": [
      {
        "name": "Oak Hardwood Flooring",
        "confidence": 0.92,
        "properties": {
          "category": "wood",
          "subcategory": "hardwood",
          "color": "natural brown",
          "texture": "fine grain",
          "finish": "satin",
          "durability": "high",
          "sustainability": "good",
          "hardness": "hard",
          "reflectivity": "medium",
          "porosity": "low",
          "thermal_properties": "insulating",
          "maintenance_level": "medium"
        },
        "visual_description": "Natural oak with visible grain patterns and warm brown tones",
        "applications": ["flooring", "furniture", "cabinetry"],
        "boundingBox": {
          "x": 10,
          "y": 15,
          "width": 200,
          "height": 150
        }
      }
    ],
    "analysisMetadata": {
      "analysisType": "comprehensive",
      "processingMethod": "llama_vision",
      "imageDimensions": {
        "width": 800,
        "height": 600
      }
    }
  },
  "metadata": {
    "processingTime": 3450,
    "version": "1.0.0"
  }
}
```

### 2. Visual Search Analysis

**Endpoint**: `POST /visual-search-analyze`

Comprehensive visual analysis for similarity search applications.

#### Request Body

```json
{
  "image_url": "https://example.com/material.jpg",
  "image_data": "base64_encoded_image", // Alternative
  "analysis_depth": "standard", // "quick" | "standard" | "comprehensive"
  "focus_areas": ["color", "texture", "material", "spatial"],
  "similarity_threshold": 0.7,
  "user_id": "user_123",
  "workspace_id": "workspace_456"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "analysis_result": {
      "analysis_id": "VSA-1234567890-abc123",
      "image_metadata": {
        "dimensions": {"width": 1024, "height": 768},
        "format": "JPEG"
      },
      "color_analysis": {
        "dominant_palette": {
          "dominant_colors": [
            {
              "color": "#8B4513",
              "percentage": 45.2,
              "name": "saddle brown"
            }
          ],
          "color_harmony": "monochromatic",
          "color_temperature": "warm"
        }
      },
      "texture_analysis": {
        "primary_texture": {
          "roughness": 6.5,
          "uniformity": 7.2,
          "directionality": "horizontal",
          "scale": "medium",
          "pattern_frequency": 3.8
        },
        "texture_regions": [
          {
            "region_id": "region_1",
            "bounding_box": {"x": 0, "y": 0, "width": 1024, "height": 768},
            "texture_metrics": {
              "roughness": 6.5,
              "uniformity": 7.2,
              "directionality": "horizontal",
              "scale": "medium",
              "pattern_frequency": 3.8
            }
          }
        ]
      },
      "material_classification": [
        {
          "material_type": "hardwood",
          "confidence": 0.89,
          "sub_category": "oak",
          "physical_properties": {
            "hardness": "hard",
            "reflectivity": 0.3,
            "porosity": "low",
            "thermal_conductivity": "low"
          }
        }
      ],
      "similarity_vectors": {
        "color_vector": [0.1, 0.3, 0.2, ...],
        "texture_vector": [0.4, 0.1, 0.5, ...],
        "shape_vector": [0.2, 0.6, 0.1, ...],
        "combined_vector": [0.25, 0.35, 0.28, ...]
      },
      "confidence_scores": {
        "overall": 0.89,
        "color_accuracy": 0.92,
        "texture_accuracy": 0.87,
        "material_accuracy": 0.89
      }
    },
    "storage": {
      "record_id": "rec_123",
      "embedding_stored": true
    }
  }
}
```

### 3. Visual Search Query

**Endpoint**: `POST /visual-search-query` or `GET /visual-search-query`

Perform similarity search using various query methods.

#### Request Body (POST)

```json
{
  "query_image_url": "https://example.com/query.jpg",
  "query_vector": [0.1, 0.2, 0.3, ...], // Direct vector input
  "query_text": "dark wood texture with grain", // Text-based search
  "analysis_id": "VSA-1234567890-abc123", // Use existing analysis
  "search_type": "combined", // "color" | "texture" | "material" | "combined" | "semantic"
  "similarity_threshold": 0.7,
  "max_results": 20,
  "distance_metric": "cosine", // "cosine" | "euclidean" | "inner_product"
  "material_categories": ["wood", "metal"],
  "color_filters": {
    "dominant_colors": ["#8B4513", "#D2B48C"],
    "color_temperature": "warm"
  },
  "texture_filters": {
    "roughness_range": [5.0, 8.0],
    "texture_scale": "medium"
  },
  "user_id": "user_123",
  "workspace_id": "workspace_456"
}
```

#### Query Parameters (GET)

```
GET /visual-search-query?search_type=color&similarity_threshold=0.8&max_results=10&categories=wood,metal
```

#### Response

```json
{
  "success": true,
  "data": {
    "query_id": "VSQ-1234567890-xyz789",
    "query_metadata": {
      "search_type": "combined",
      "similarity_threshold": 0.7,
      "max_results": 20,
      "distance_metric": "cosine",
      "applied_filters": ["material_categories", "color_filters"]
    },
    "matches": [
      {
        "analysis_id": "VSA-9876543210-def456",
        "image_url": "https://storage.example.com/material123.jpg",
        "similarity_score": 0.94,
        "distance_metric": 0.94,
        "match_type": "combined",
        "material_data": {
          "name": "Premium Oak Flooring",
          "category": "wood",
          "properties": {
            "grade": "premium",
            "finish": "satin"
          },
          "description": "High-quality oak hardwood flooring"
        },
        "visual_features": {
          "dominant_colors": [
            {
              "color": "#8B4513",
              "name": "saddle brown", 
              "percentage": 47.3
            }
          ],
          "texture_description": "fine grain with moderate roughness",
          "material_classification": "hardwood"
        },
        "confidence_breakdown": {
          "color_match": 0.95,
          "texture_match": 0.91,
          "material_match": 0.96,
          "spatial_match": 0.93
        }
      }
    ],
    "search_statistics": {
      "total_candidates": 150,
      "matches_found": 12,
      "average_similarity": 0.84,
      "search_time_ms": 245,
      "vector_dimension": 512
    },
    "recommendations": {
      "related_searches": ["Try texture-focused search", "Search for more wood materials"],
      "filter_suggestions": ["Use color_filters to focus on specific colors"],
      "quality_insights": "High similarity matches found. Results are very relevant to your query."
    }
  }
}
```

### 4. Batch Processing

**Endpoint**: `POST /visual-search-batch`

Submit multiple images for batch analysis.

#### Request Body

```json
{
  "batch_id": "custom_batch_001", // Optional
  "items": [
    {
      "item_id": "item_001",
      "image_url": "https://example.com/image1.jpg",
      "analysis_depth": "standard",
      "focus_areas": ["color", "texture"],
      "metadata": {
        "source": "catalog_import",
        "category": "flooring"
      }
    },
    {
      "item_id": "item_002", 
      "image_data": "base64_encoded_image_data",
      "analysis_depth": "comprehensive"
    }
  ],
  "batch_settings": {
    "analysis_depth": "standard",
    "focus_areas": ["color", "texture", "material"],
    "similarity_threshold": 0.7,
    "max_concurrent": 5,
    "priority": "normal" // "low" | "normal" | "high"
  },
  "notification_webhook": "https://your-app.com/webhooks/batch-complete",
  "user_id": "user_123",
  "workspace_id": "workspace_456"
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "batch_id": "BATCH-1234567890-batch001",
    "submission_status": "accepted",
    "batch_metadata": {
      "total_items": 2,
      "estimated_processing_time_ms": 10000,
      "priority_level": "normal",
      "queue_position": 1
    },
    "processing_details": {
      "max_concurrent": 5,
      "retry_policy": {
        "max_retries": 3,
        "retry_delay_ms": 5000
      },
      "timeout_per_item_ms": 30000
    },
    "webhook_url": "https://your-app.com/webhooks/batch-complete"
  }
}
```

#### Get Batch Status

**Endpoint**: `GET /visual-search-batch/{batch_id}`

```json
{
  "success": true,
  "data": {
    "batch_id": "BATCH-1234567890-batch001",
    "status": "processing",
    "progress": {
      "total_items": 10,
      "completed_items": 7,
      "failed_items": 1,
      "current_item": "item_008",
      "estimated_completion": "2025-09-06T17:15:00Z"
    },
    "results": {
      "completed_analyses": ["VSA-001", "VSA-002", "VSA-003"],
      "failed_analyses": [
        {
          "item_id": "item_004",
          "error": "Invalid image format",
          "retry_count": 2
        }
      ]
    },
    "timing": {
      "started_at": "2025-09-06T17:10:00Z",
      "estimated_duration_ms": 50000
    }
  }
}
```

#### Get Batch Results

**Endpoint**: `GET /visual-search-batch/{batch_id}/results`

Returns detailed analysis results for all completed items in the batch.

### 5. Status and Progress Monitoring

**Endpoint**: `GET /visual-search-status`

System health and performance monitoring.

#### System Status Response

```json
{
  "success": true,
  "data": {
    "service_name": "visual-search-platform",
    "status": "healthy",
    "version": "1.0.0",
    "uptime_ms": 86400000,
    "components": {
      "llama_vision": {
        "status": "healthy",
        "last_check": "2025-09-06T16:45:00Z",
        "response_time_ms": 234
      },
      "database": {
        "status": "healthy", 
        "last_check": "2025-09-06T16:45:01Z",
        "response_time_ms": 12
      },
      "storage": {
        "status": "healthy",
        "last_check": "2025-09-06T16:45:02Z", 
        "response_time_ms": 89
      },
      "vector_search": {
        "status": "healthy",
        "last_check": "2025-09-06T16:45:02Z",
        "response_time_ms": 50
      }
    },
    "performance_metrics": {
      "avg_analysis_time_ms": 5000,
      "avg_search_time_ms": 500,
      "cache_hit_rate": 0.85,
      "error_rate_percent": 2.5
    },
    "capacity_metrics": {
      "active_analyses": 3,
      "queue_depth": 12,
      "storage_usage_mb": 1024,
      "vector_index_size": 50000
    }
  }
}
```

#### Additional Status Endpoints

- `GET /visual-search-status/jobs/{user_id}` - User job history
- `GET /visual-search-status/activity/{user_id}?period=7d` - User activity summary  
- `GET /visual-search-status/job/{job_id}` - Specific job progress

## Request Validation

All endpoints implement comprehensive input validation:

### Image Input Validation

- **Supported Formats**: JPEG, PNG, WebP
- **Size Limits**: Max 10MB per image
- **Resolution**: Min 100x100px, Max 4096x4096px
- **Input Methods**: URL or Base64 encoded data

### Parameter Validation

- **analysis_depth**: Must be one of `"quick"`, `"standard"`, `"comprehensive"`
- **similarity_threshold**: Float between 0.0 and 1.0
- **max_results**: Integer between 1 and 100
- **focus_areas**: Array containing valid values: `["color", "texture", "material", "spatial"]`

### Error Responses

All endpoints return standardized error responses:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_IMAGE_INPUT",
    "message": "Either image_url or image_data is required",
    "details": {
      "required_fields": ["image_url", "image_data"]
    }
  },
  "metadata": {
    "timestamp": "2025-09-06T16:45:00Z"
  }
}
```

## Common Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `MISSING_IMAGE_INPUT` | No image provided | 400 |
| `INVALID_ANALYSIS_DEPTH` | Invalid analysis depth value | 400 |
| `INVALID_SEARCH_TYPE` | Invalid search type | 400 |
| `BATCH_VALIDATION_FAILED` | Batch request validation failed | 400 |
| `JOB_NOT_FOUND` | Requested job not found | 404 |
| `MATERIAL_RECOGNITION_ERROR` | Analysis processing failed | 500 |
| `VISUAL_SEARCH_ANALYSIS_ERROR` | Visual analysis failed | 500 |
| `BATCH_PROCESSING_ERROR` | Batch processing failed | 500 |

## Integration Examples

### JavaScript/TypeScript Client

```typescript
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  'https://your-project.supabase.co',
  'your-anon-key'
)

// Analyze an image
async function analyzeImage(imageUrl: string) {
  const { data, error } = await supabase.functions.invoke('visual-search-analyze', {
    body: {
      image_url: imageUrl,
      analysis_depth: 'standard',
      focus_areas: ['color', 'texture', 'material']
    }
  })

  if (error) throw error
  return data
}

// Search for similar materials
async function searchSimilar(queryImageUrl: string) {
  const { data, error } = await supabase.functions.invoke('visual-search-query', {
    body: {
      query_image_url: queryImageUrl,
      search_type: 'combined',
      similarity_threshold: 0.7,
      max_results: 10
    }
  })

  if (error) throw error
  return data
}

// Submit batch job
async function submitBatch(items: any[]) {
  const { data, error } = await supabase.functions.invoke('visual-search-batch', {
    body: {
      items,
      batch_settings: {
        analysis_depth: 'standard',
        focus_areas: ['color', 'texture', 'material'],
        similarity_threshold: 0.7,
        max_concurrent: 3,
        priority: 'normal'
      }
    }
  })

  if (error) throw error
  return data
}
```

### Python Client

```python
import requests
import json

class VisualSearchClient:
    def __init__(self, base_url: str, api_key: str):
        self.base_url = base_url
        self.headers = {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json'
        }
    
    def analyze_image(self, image_url: str, analysis_depth: str = 'standard'):
        endpoint = f"{self.base_url}/visual-search-analyze"
        payload = {
            'image_url': image_url,
            'analysis_depth': analysis_depth,
            'focus_areas': ['color', 'texture', 'material']
        }
        
        response = requests.post(endpoint, json=payload, headers=self.headers)
        response.raise_for_status()
        return response.json()
    
    def search_similar(self, query_image_url: str, similarity_threshold: float = 0.7):
        endpoint = f"{self.base_url}/visual-search-query"
        payload = {
            'query_image_url': query_image_url,
            'search_type': 'combined',
            'similarity_threshold': similarity_threshold,
            'max_results': 20
        }
        
        response = requests.post(endpoint, json=payload, headers=self.headers)
        response.raise_for_status()
        return response.json()

# Usage
client = VisualSearchClient(
    'https://your-project.supabase.co/functions/v1',
    'your-anon-key'
)

result = client.analyze_image('https://example.com/material.jpg')
matches = client.search_similar('https://example.com/query.jpg')
```

## Database Schema Requirements

The Visual Search API requires the following database tables:

### Core Tables

```sql
-- Visual search analysis storage
CREATE TABLE visual_search_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT UNIQUE NOT NULL,
  user_id UUID,
  workspace_id UUID,
  image_url TEXT,
  analysis_depth TEXT,
  focus_areas TEXT[],
  color_analysis JSONB,
  texture_analysis JSONB,
  material_classification JSONB,
  spatial_features JSONB,
  similarity_vectors JSONB,
  confidence_scores JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Vector embeddings for similarity search
CREATE TABLE visual_search_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id TEXT REFERENCES visual_search_analysis(analysis_id),
  image_url TEXT,
  embedding_vector VECTOR(512), -- pgvector extension required
  analysis_metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search query logs
CREATE TABLE visual_search_queries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_id TEXT UNIQUE NOT NULL,
  user_id UUID,
  workspace_id UUID,
  search_type TEXT,
  query_method TEXT,
  similarity_threshold FLOAT,
  max_results INTEGER,
  distance_metric TEXT,
  matches_found INTEGER,
  average_similarity FLOAT,
  search_time_ms INTEGER,
  applied_filters JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Batch processing jobs
CREATE TABLE visual_search_batch_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT UNIQUE NOT NULL,
  user_id UUID,
  workspace_id UUID,
  status TEXT DEFAULT 'pending',
  total_items INTEGER,
  batch_settings JSONB,
  notification_webhook TEXT,
  estimated_duration_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

-- Batch processing items
CREATE TABLE visual_search_batch_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT REFERENCES visual_search_batch_jobs(batch_id),
  item_id TEXT NOT NULL,
  image_url TEXT,
  image_data TEXT,
  analysis_depth TEXT,
  focus_areas TEXT[],
  item_metadata JSONB,
  status TEXT DEFAULT 'pending',
  analysis_id TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  processed_at TIMESTAMPTZ
);
```

### Indexes for Performance

```sql
-- Vector similarity search index
CREATE INDEX visual_search_embeddings_vector_idx 
ON visual_search_embeddings 
USING ivfflat (embedding_vector vector_cosine_ops) 
WITH (lists = 100);

-- Query performance indexes
CREATE INDEX visual_search_analysis_user_created_idx 
ON visual_search_analysis (user_id, created_at DESC);

CREATE INDEX visual_search_batch_jobs_user_status_idx 
ON visual_search_batch_jobs (user_id, status, created_at DESC);

CREATE INDEX visual_search_batch_items_batch_status_idx 
ON visual_search_batch_items (batch_id, status);
```

## Rate Limiting

- **Analysis Endpoints**: 100 requests/minute per user
- **Search Endpoints**: 200 requests/minute per user  
- **Batch Endpoints**: 10 requests/minute per user
- **Status Endpoints**: 500 requests/minute per user

## Security Considerations

### Row Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE visual_search_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_batch_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE visual_search_batch_items ENABLE ROW LEVEL SECURITY;

-- Example RLS policy for user data isolation
CREATE POLICY "Users can only access their own visual search data" 
ON visual_search_analysis 
FOR ALL 
USING (auth.uid() = user_id);
```

### Input Sanitization

- All image URLs are validated for safe protocols (https://)
- Base64 image data is validated for proper encoding
- User inputs are sanitized to prevent injection attacks
- File uploads are scanned for malicious content

## Performance Optimization

### Caching Strategy

- **Analysis Results**: Cached for 24 hours based on image hash
- **Search Results**: Cached for 1 hour based on query parameters
- **Vector Embeddings**: Permanently cached until image changes

### Batch Processing

- **Concurrency**: Configurable per batch (max 10)
- **Queue Management**: Priority-based processing queue
- **Retry Logic**: Automatic retry with exponential backoff
- **Timeout Handling**: 30-second timeout per analysis

## Monitoring and Analytics

### Key Metrics Tracked

- Analysis completion rates and confidence scores
- Search accuracy and user satisfaction
- System performance and resource utilization
- Error rates and failure patterns

### Webhook Notifications

```json
{
  "event_type": "batch.completed",
  "batch_id": "BATCH-1234567890-batch001",
  "status": "completed",
  "summary": {
    "total_items": 10,
    "completed_items": 9,
    "failed_items": 1,
    "success_rate": 90.0
  },
  "timestamp": "2025-09-06T17:15:00Z"
}
```

## API Versioning

Current version: **v1.0.0**

- **Breaking Changes**: Will increment major version
- **New Features**: Will increment minor version
- **Bug Fixes**: Will increment patch version

All responses include version information in metadata for compatibility tracking.

## Support and Troubleshooting

### Common Issues

1. **Low Confidence Scores**: 
   - Use higher resolution images
   - Ensure good lighting conditions
   - Try `comprehensive` analysis depth

2. **No Search Results**:
   - Lower similarity_threshold
   - Use `combined` search_type
   - Check material_categories filters

3. **Batch Processing Delays**:
   - Reduce max_concurrent setting
   - Use `quick` analysis_depth for large batches
   - Check system status endpoint

### Debug Information

Enable debug mode by including `debug: true` in request body for detailed processing logs.

## SDK and Client Libraries

- **TypeScript**: Official Supabase client with function invocation
- **Python**: Custom wrapper around requests library
- **React Hooks**: Pre-built hooks for common operations
- **CLI Tools**: Command-line interface for batch operations

---

**Last Updated**: September 6, 2025  
**API Version**: 1.0.0  
**Documentation Version**: 1.0