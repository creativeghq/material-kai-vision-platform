# MIVAA PDF Extractor Platform - Complete API Documentation

## Overview

The MIVAA PDF Extractor Platform is a comprehensive FastAPI-based service that provides advanced PDF processing, image analysis, semantic search, and document management capabilities. This documentation covers all 37 API endpoints across 7 modules, designed to enhance Swagger documentation with complete technical specifications.

**Platform Features:**
- PDF to Markdown conversion with table and image extraction
- Advanced image analysis using Material Kai Vision Platform
- Semantic search and RAG capabilities with LlamaIndex
- Comprehensive document processing and management
- Administrative tools and system monitoring
- JWT authentication with workspace context

---

## 1. Core PDF Processing Module (`mivaa-pdf-extractor/main.py`)

### 1.1 PDF to Markdown Conversion
**Endpoint:** `POST /extract/markdown`  
**Description:** Converts PDF documents to structured Markdown format using PyMuPDF4LLM  
**Authentication:** None (public endpoint)

**Request Body:**
- `file` (UploadFile, required): PDF file to process
- Content-Type: `multipart/form-data`

**Response Format:**
```json
{
  "markdown_content": "string",
  "metadata": {
    "page_count": "integer",
    "processing_time": "float"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid file format or corrupted PDF
- `413 Payload Too Large`: File size exceeds limit
- `500 Internal Server Error`: Processing failure

---

### 1.2 Table Extraction
**Endpoint:** `POST /extract/tables`  
**Description:** Extracts tables from PDF documents and returns structured data  
**Authentication:** None (public endpoint)

**Request Body:**
- `file` (UploadFile, required): PDF file to process
- Content-Type: `multipart/form-data`

**Response Format:**
```json
{
  "tables": [
    {
      "page_number": "integer",
      "table_data": "array of arrays",
      "headers": "array of strings"
    }
  ],
  "total_tables": "integer"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid file format
- `404 Not Found`: No tables found in document
- `500 Internal Server Error`: Extraction failure

---

### 1.3 Image Extraction
**Endpoint:** `POST /extract/images`  
**Description:** Extracts images from PDF documents with metadata  
**Authentication:** None (public endpoint)

**Request Body:**
- `file` (UploadFile, required): PDF file to process
- Content-Type: `multipart/form-data`

**Response Format:**
```json
{
  "images": [
    {
      "page_number": "integer",
      "image_data": "base64 encoded string",
      "format": "string",
      "dimensions": {
        "width": "integer",
        "height": "integer"
      }
    }
  ],
  "total_images": "integer"
}
```

**Error Responses:**
- `400 Bad Request`: Invalid file format
- `404 Not Found`: No images found in document
- `500 Internal Server Error`: Extraction failure

---

## 2. Application Core Module (`mivaa-pdf-extractor/app/main.py`)

### 2.1 Health Check
**Endpoint:** `GET /health`  
**Description:** Comprehensive health status of all services and dependencies  
**Authentication:** None (public endpoint)

**Response Format:**
```json
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "ISO 8601 datetime",
  "services": {
    "database": "healthy|unhealthy",
    "llamaindex": "healthy|unhealthy",
    "material_kai": "healthy|unhealthy"
  },
  "version": "string"
}
```

**Error Responses:**
- `503 Service Unavailable`: One or more critical services are down

---

### 2.2 System Metrics
**Endpoint:** `GET /metrics`  
**Description:** Real-time system performance metrics and statistics  
**Authentication:** None (public endpoint)

**Response Format:**
```json
{
  "cpu_usage": "float",
  "memory_usage": "float",
  "disk_usage": "float",
  "active_connections": "integer",
  "requests_per_minute": "integer",
  "uptime_seconds": "integer"
}
```

---

### 2.3 Performance Summary
**Endpoint:** `GET /performance/summary`  
**Description:** Aggregated performance metrics over time periods  
**Authentication:** None (public endpoint)

**Query Parameters:**
- `period` (string, optional): Time period for metrics (1h, 24h, 7d, 30d)
- Default: "24h"

**Response Format:**
```json
{
  "period": "string",
  "average_response_time": "float",
  "total_requests": "integer",
  "error_rate": "float",
  "peak_cpu_usage": "float",
  "peak_memory_usage": "float"
}
```

---

### 2.4 Root Service Information
**Endpoint:** `GET /`  
**Description:** Basic service information and available endpoints  
**Authentication:** None (public endpoint)

**Response Format:**
```json
{
  "service": "MIVAA PDF Extractor",
  "version": "string",
  "description": "string",
  "endpoints": ["array of endpoint paths"],
  "documentation_url": "string"
}
```

---

## 3. Enhanced PDF Routes Module (`mivaa-pdf-extractor/app/api/pdf_routes.py`)

### 3.1 Authenticated Markdown Extraction
**Endpoint:** `POST /api/v1/pdf/extract/markdown`  
**Description:** Enhanced PDF to Markdown conversion with authentication and workspace context  
**Authentication:** JWT Bearer token required

**Headers:**
- `Authorization: Bearer <jwt_token>`
- `Content-Type: multipart/form-data`

**Request Body:**
- `file` (UploadFile, required): PDF file to process
- `options` (JSON, optional): Processing options

**Processing Options:**
```json
{
  "preserve_formatting": "boolean",
  "extract_metadata": "boolean",
  "include_page_numbers": "boolean"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "markdown_content": "string",
    "metadata": {
      "page_count": "integer",
      "processing_time": "float",
      "file_size": "integer",
      "workspace_id": "string"
    }
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing JWT token
- `403 Forbidden`: Insufficient workspace permissions
- `400 Bad Request`: Invalid file or options
- `500 Internal Server Error`: Processing failure

---

### 3.2 Authenticated Table Extraction
**Endpoint:** `POST /api/v1/pdf/extract/tables`  
**Description:** Enhanced table extraction with authentication and advanced options  
**Authentication:** JWT Bearer token required

**Request Body:**
- `file` (UploadFile, required): PDF file to process
- `options` (JSON, optional): Extraction options

**Extraction Options:**
```json
{
  "detect_headers": "boolean",
  "merge_cells": "boolean",
  "output_format": "json|csv|excel"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "tables": [
      {
        "page_number": "integer",
        "table_id": "string",
        "headers": ["array of strings"],
        "rows": ["array of arrays"],
        "confidence_score": "float"
      }
    ],
    "total_tables": "integer",
    "workspace_id": "string"
  }
}
```

---

### 3.3 Authenticated Image Extraction
**Endpoint:** `POST /api/v1/pdf/extract/images`  
**Description:** Enhanced image extraction with authentication and metadata  
**Authentication:** JWT Bearer token required

**Request Body:**
- `file` (UploadFile, required): PDF file to process
- `options` (JSON, optional): Extraction options

**Extraction Options:**
```json
{
  "min_resolution": "integer",
  "output_format": "png|jpeg|webp",
  "include_ocr": "boolean"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "images": [
      {
        "image_id": "string",
        "page_number": "integer",
        "image_data": "base64 string",
        "format": "string",
        "dimensions": {
          "width": "integer",
          "height": "integer"
        },
        "ocr_text": "string (if enabled)"
      }
    ],
    "total_images": "integer",
    "workspace_id": "string"
  }
}
```

---

### 3.4 PDF Routes Health Check
**Endpoint:** `GET /api/v1/pdf/health`  
**Description:** Health check specific to PDF processing services  
**Authentication:** JWT Bearer token required

**Response Format:**
```json
{
  "success": true,
  "message": "PDF services are healthy",
  "data": {
    "pdf_processor": "healthy|unhealthy",
    "temp_storage": "healthy|unhealthy",
    "extraction_services": "healthy|unhealthy"
  }
}
```

---

## 4. Image Analysis Module (`mivaa-pdf-extractor/app/api/images.py`)

### 4.1 Image Analysis
**Endpoint:** `POST /api/v1/images/analyze`  
**Description:** Advanced image analysis using Material Kai Vision Platform  
**Authentication:** JWT Bearer token required

**Request Body:**
- `image` (UploadFile, required): Image file to analyze
- `analysis_type` (string, optional): Type of analysis to perform

**Analysis Types:**
- `"general"`: General image description and objects
- `"text"`: OCR and text extraction
- `"technical"`: Technical diagram analysis
- `"medical"`: Medical image analysis (if enabled)

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "analysis_id": "string",
    "image_metadata": {
      "format": "string",
      "dimensions": {
        "width": "integer",
        "height": "integer"
      },
      "file_size": "integer"
    },
    "analysis_results": {
      "description": "string",
      "objects_detected": ["array of objects"],
      "text_content": "string",
      "confidence_scores": {
        "overall": "float",
        "object_detection": "float",
        "text_recognition": "float"
      }
    },
    "processing_time": "float"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid JWT token
- `400 Bad Request`: Invalid image format or analysis type
- `413 Payload Too Large`: Image file too large
- `500 Internal Server Error`: Analysis service failure

---

### 4.2 Batch Image Analysis
**Endpoint:** `POST /api/v1/images/analyze/batch`  
**Description:** Process multiple images in a single request  
**Authentication:** JWT Bearer token required

**Request Body:**
- `images` (List[UploadFile], required): Multiple image files
- `analysis_type` (string, optional): Type of analysis for all images
- `batch_options` (JSON, optional): Batch processing options

**Batch Options:**
```json
{
  "parallel_processing": "boolean",
  "max_concurrent": "integer",
  "fail_on_error": "boolean"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "batch_id": "string",
    "total_images": "integer",
    "processed_count": "integer",
    "failed_count": "integer",
    "results": [
      {
        "image_index": "integer",
        "filename": "string",
        "status": "success|failed",
        "analysis_results": "object (same as single analysis)",
        "error_message": "string (if failed)"
      }
    ],
    "total_processing_time": "float"
  }
}
```

---

### 4.3 Image Similarity Search
**Endpoint:** `POST /api/v1/images/search`  
**Description:** Find similar images using vector similarity  
**Authentication:** JWT Bearer token required

**Request Body:**
- `query_image` (UploadFile, required): Reference image for similarity search
- `search_options` (JSON, optional): Search configuration

**Search Options:**
```json
{
  "similarity_threshold": "float (0.0-1.0)",
  "max_results": "integer",
  "search_scope": "workspace|global",
  "include_metadata": "boolean"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "query_image_id": "string",
    "similar_images": [
      {
        "image_id": "string",
        "similarity_score": "float",
        "image_url": "string",
        "metadata": {
          "filename": "string",
          "upload_date": "ISO 8601 datetime",
          "dimensions": "object"
        }
      }
    ],
    "total_matches": "integer",
    "search_time": "float"
  }
}
```

---

### 4.4 Upload and Analyze
**Endpoint:** `POST /api/v1/images/upload/analyze`  
**Description:** Upload image to storage and perform analysis  
**Authentication:** JWT Bearer token required

**Request Body:**
- `image` (UploadFile, required): Image file to upload and analyze
- `storage_options` (JSON, optional): Storage configuration
- `analysis_options` (JSON, optional): Analysis configuration

**Storage Options:**
```json
{
  "make_public": "boolean",
  "generate_thumbnails": "boolean",
  "compression_quality": "integer (1-100)"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "image_id": "string",
    "storage_url": "string",
    "thumbnail_urls": {
      "small": "string",
      "medium": "string",
      "large": "string"
    },
    "analysis_results": "object (same as analyze endpoint)",
    "upload_metadata": {
      "upload_time": "ISO 8601 datetime",
      "file_size": "integer",
      "storage_location": "string"
    }
  }
}
```

---

### 4.5 Images Health Check
**Endpoint:** `GET /api/v1/images/health`  
**Description:** Health check for image processing services  
**Authentication:** JWT Bearer token required

**Response Format:**
```json
{
  "success": true,
  "message": "Image services are healthy",
  "data": {
    "material_kai_service": "healthy|unhealthy",
    "image_storage": "healthy|unhealthy",
    "vector_database": "healthy|unhealthy",
    "processing_queue": "healthy|unhealthy"
  }
}
```

---

## 5. Search and RAG Module (`mivaa-pdf-extractor/app/api/search.py`)

### 5.1 Document Query
**Endpoint:** `POST /api/v1/search/query`  
**Description:** Natural language querying of processed documents using RAG  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "query": "string (required)",
  "search_options": {
    "max_results": "integer",
    "similarity_threshold": "float",
    "include_sources": "boolean",
    "search_scope": "workspace|global"
  },
  "llm_options": {
    "model": "string",
    "temperature": "float",
    "max_tokens": "integer"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "query_id": "string",
    "answer": "string",
    "confidence_score": "float",
    "sources": [
      {
        "document_id": "string",
        "document_title": "string",
        "relevance_score": "float",
        "excerpt": "string",
        "page_number": "integer"
      }
    ],
    "processing_time": "float",
    "token_usage": {
      "prompt_tokens": "integer",
      "completion_tokens": "integer",
      "total_tokens": "integer"
    }
  }
}
```

---

### 5.2 Semantic Search
**Endpoint:** `POST /api/v1/search/semantic`  
**Description:** Vector-based semantic search across document embeddings  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "query": "string (required)",
  "search_options": {
    "max_results": "integer",
    "similarity_threshold": "float",
    "search_filters": {
      "document_type": "string",
      "date_range": {
        "start": "ISO 8601 date",
        "end": "ISO 8601 date"
      },
      "tags": ["array of strings"]
    }
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "search_id": "string",
    "results": [
      {
        "document_id": "string",
        "chunk_id": "string",
        "content": "string",
        "similarity_score": "float",
        "metadata": {
          "document_title": "string",
          "page_number": "integer",
          "chunk_index": "integer"
        }
      }
    ],
    "total_results": "integer",
    "search_time": "float"
  }
}
```

---

### 5.3 Similarity Search
**Endpoint:** `POST /api/v1/search/similarity`  
**Description:** Find documents similar to a reference document or text  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "reference": {
    "type": "document_id|text|file",
    "value": "string|UploadFile"
  },
  "similarity_options": {
    "algorithm": "cosine|euclidean|dot_product",
    "max_results": "integer",
    "min_similarity": "float"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "reference_id": "string",
    "similar_documents": [
      {
        "document_id": "string",
        "title": "string",
        "similarity_score": "float",
        "summary": "string",
        "metadata": "object"
      }
    ],
    "algorithm_used": "string",
    "computation_time": "float"
  }
}
```

---

### 5.4 Related Documents
**Endpoint:** `GET /api/v1/search/related/{document_id}`  
**Description:** Find documents related to a specific document  
**Authentication:** JWT Bearer token required

**Path Parameters:**
- `document_id` (string, required): ID of the reference document

**Query Parameters:**
- `max_results` (integer, optional): Maximum number of related documents (default: 10)
- `relation_types` (string, optional): Comma-separated list of relation types

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "reference_document": {
      "id": "string",
      "title": "string",
      "summary": "string"
    },
    "related_documents": [
      {
        "document_id": "string",
        "title": "string",
        "relation_type": "similar|referenced|citing",
        "relation_strength": "float",
        "summary": "string"
      }
    ],
    "total_related": "integer"
  }
}
```

---

### 5.5 Document Summary
**Endpoint:** `POST /api/v1/search/summarize`  
**Description:** Generate AI-powered summaries of documents or search results  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "target": {
    "type": "document_id|document_ids|search_results",
    "value": "string|array|object"
  },
  "summary_options": {
    "length": "short|medium|long",
    "style": "bullet_points|paragraph|executive",
    "focus_areas": ["array of strings"],
    "include_key_quotes": "boolean"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "summary_id": "string",
    "summary": "string",
    "key_points": ["array of strings"],
    "key_quotes": [
      {
        "text": "string",
        "source": "string",
        "page": "integer"
      }
    ],
    "summary_metadata": {
      "word_count": "integer",
      "reading_time_minutes": "integer",
      "confidence_score": "float"
    }
  }
}
```

---

### 5.6 Entity Extraction
**Endpoint:** `POST /api/v1/search/entities`  
**Description:** Extract named entities from documents or text  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "input": {
    "type": "document_id|text|file",
    "value": "string|UploadFile"
  },
  "extraction_options": {
    "entity_types": ["PERSON", "ORG", "LOCATION", "DATE", "MONEY"],
    "confidence_threshold": "float",
    "include_context": "boolean"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "extraction_id": "string",
    "entities": [
      {
        "text": "string",
        "label": "string",
        "confidence": "float",
        "start_pos": "integer",
        "end_pos": "integer",
        "context": "string"
      }
    ],
    "entity_counts": {
      "PERSON": "integer",
      "ORG": "integer",
      "LOCATION": "integer"
    },
    "processing_time": "float"
  }
}
```

---

### 5.7 Document Comparison
**Endpoint:** `POST /api/v1/search/compare`  
**Description:** Compare two documents for similarities and differences  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "document_a": {
    "type": "document_id|file",
    "value": "string|UploadFile"
  },
  "document_b": {
    "type": "document_id|file",
    "value": "string|UploadFile"
  },
  "comparison_options": {
    "comparison_type": "semantic|structural|textual",
    "highlight_differences": "boolean",
    "similarity_threshold": "float"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "comparison_id": "string",
    "overall_similarity": "float",
    "similarities": [
      {
        "section": "string",
        "similarity_score": "float",
        "matching_content": "string"
      }
    ],
    "differences": [
      {
        "section": "string",
        "document_a_content": "string",
        "document_b_content": "string",
        "difference_type": "addition|deletion|modification"
      }
    ],
    "comparison_metadata": {
      "algorithm_used": "string",
      "processing_time": "float"
    }
  }
}
```

---

### 5.8 Search Health Check
**Endpoint:** `GET /api/v1/search/health`  
**Description:** Health check for search and RAG services  
**Authentication:** JWT Bearer token required

**Response Format:**
```json
{
  "success": true,
  "message": "Search services are healthy",
  "data": {
    "llamaindex_service": "healthy|unhealthy",
    "vector_database": "healthy|unhealthy",
    "embedding_service": "healthy|unhealthy",
    "llm_service": "healthy|unhealthy",
    "search_index": "healthy|unhealthy"
  }
}
```

---

## 6. Document Management Module (`mivaa-pdf-extractor/app/api/documents.py`)

### 6.1 Document Processing
**Endpoint:** `POST /api/v1/documents/process`  
**Description:** Comprehensive document processing with multiple extraction options  
**Authentication:** JWT Bearer token required

**Request Body:**
- `file` (UploadFile, required): Document file to process
- `processing_options` (JSON, optional): Processing configuration

**Processing Options:**
```json
{
  "extract_text": "boolean",
  "extract_images": "boolean",
  "extract_tables": "boolean",
  "generate_embeddings": "boolean",
  "perform_ocr": "boolean",
  "create_summary": "boolean",
  "extract_entities": "boolean",
  "processing_priority": "low|normal|high"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "document_id": "string",
    "processing_status": "completed|processing|failed",
    "job_id": "string",
    "extracted_content": {
      "text": "string",
      "images": ["array of image objects"],
      "tables": ["array of table objects"],
      "entities": ["array of entity objects"]
    },
    "metadata": {
      "filename": "string",
      "file_size": "integer",
      "page_count": "integer",
      "processing_time": "float",
      "upload_timestamp": "ISO 8601 datetime"
    },
    "embeddings_generated": "boolean",
    "summary": "string"
  }
}
```

---

### 6.2 URL Processing
**Endpoint:** `POST /api/v1/documents/process/url`  
**Description:** Process documents from URLs with automatic download  
**Authentication:** JWT Bearer token required

**Request Body:**
```json
{
  "url": "string (required)",
  "processing_options": "object (same as document processing)",
  "download_options": {
    "timeout_seconds": "integer",
    "max_file_size_mb": "integer",
    "allowed_content_types": ["array of strings"]
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "document_id": "string",
    "source_url": "string",
    "download_metadata": {
      "content_type": "string",
      "file_size": "integer",
      "download_time": "float"
    },
    "processing_results": "object (same as document processing)"
  }
}
```

---

### 6.3 Batch Processing
**Endpoint:** `POST /api/v1/documents/process/batch`  
**Description:** Process multiple documents in a single batch operation  
**Authentication:** JWT Bearer token required

**Request Body:**
- `files` (List[UploadFile], required): Multiple document files
- `batch_options` (JSON, optional): Batch processing configuration

**Batch Options:**
```json
{
  "processing_options": "object (same as single document)",
  "parallel_processing": "boolean",
  "max_concurrent": "integer",
  "fail_fast": "boolean",
  "notification_webhook": "string"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "batch_id": "string",
    "total_documents": "integer",
    "job_ids": ["array of job IDs"],
    "estimated_completion_time": "ISO 8601 datetime",
    "batch_status": "queued|processing|completed|failed",
    "progress": {
      "completed": "integer",
      "processing": "integer",
      "failed": "integer",
      "pending": "integer"
    }
  }
}
```

---

### 6.4 Document Analysis
**Endpoint:** `POST /api/v1/documents/analyze/{document_id}`  
**Description:** Perform advanced analysis on a processed document  
**Authentication:** JWT Bearer token required

**Path Parameters:**
- `document_id` (string, required): ID of the document to analyze

**Request Body:**
```json
{
  "analysis_types": ["sentiment", "readability", "topics", "keywords"],
  "analysis_options": {
    "language": "string",
    "include_confidence_scores": "boolean",
    "detailed_results": "boolean"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "document_id": "string",
    "analysis_id": "string",
    "analysis_results": {
      "sentiment": {
        "overall_sentiment": "positive|negative|neutral",
        "confidence": "float",
        "sentiment_scores": {
          "positive": "float",
          "negative": "float",
          "neutral": "float"
        }
      },
      "readability": {
        "flesch_reading_ease": "float",
        "flesch_kincaid_grade": "float",
        "reading_level": "string"
      },
      "topics": [
        {
          "topic": "string",
          "relevance": "float",
          "keywords": ["array of strings"]
        }
      ],
      "keywords": [
        {
          "keyword": "string",
          "frequency": "integer",
          "importance": "float"
        }
      ]
    },
    "analysis_time": "float"
  }
}
```

---

### 6.5 Job Status
**Endpoint:** `GET /api/v1/documents/jobs/{job_id}`  
**Description:** Get status and results of a document processing job  
**Authentication:** JWT Bearer token required

**Path Parameters:**
- `job_id` (string, required): ID of the processing job

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "job_id": "string",
    "status": "pending|processing|completed|failed|cancelled",
    "progress_percentage": "integer",
    "created_at": "ISO 8601 datetime",
    "updated_at": "ISO 8601 datetime",
    "estimated_completion": "ISO 8601 datetime",
    "document_id": "string",
    "processing_steps": [
      {
        "step": "string",
        "status": "completed|processing|pending|failed",
        "duration": "float"
      }
    ],
    "results": "object (if completed)",
    "error_message": "string (if failed)"
  }
}
```

---

### 6.6 Documents Health Check
**Endpoint:** `GET /api/v1/documents/health`  
**Description:** Health check for document processing services  
**Authentication:** JWT Bearer token required

**Response Format:**
```json
{
  "success": true,
  "message": "Document services are healthy",

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "document_id": "string",
    "source_url": "string",
    "download_metadata": {
      "content_type": "string",
      "file_size": "integer",
      "download_time": "float"
    },
    "processing_results": "object (same as document processing)"
  }
}
```

---

### 6.3 Batch Processing
**Endpoint:** `POST /api/v1/documents/process/batch`  
**Description:** Process multiple documents in a single batch operation  
**Authentication:** JWT Bearer token required

**Request Body:**
- `files` (List[UploadFile], required): Multiple document files
- `batch_options` (JSON, optional): Batch processing configuration

**Batch Options:**
```json
{
  "processing_options": "object (same as single document)",
  "parallel_processing": "boolean",
  "max_concurrent": "integer",
  "fail_fast": "boolean",
  "notification_webhook": "string"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "batch_id": "string",
    "total_documents": "integer",
    "job_ids": ["array of job IDs"],
    "estimated_completion_time": "ISO 8601 datetime",
    "batch_status": "queued|processing|completed|failed",
    "progress": {
      "completed": "integer",
      "processing": "integer",
      "failed": "integer",
      "pending": "integer"
    }
  }
}
```

---

### 6.4 Document Analysis
**Endpoint:** `POST /api/v1/documents/analyze/{document_id}`  
**Description:** Perform advanced analysis on a processed document  
**Authentication:** JWT Bearer token required

**Path Parameters:**
- `document_id` (string, required): ID of the document to analyze

**Request Body:**
```json
{
  "analysis_types": ["sentiment", "readability", "topics", "keywords"],
  "analysis_options": {
    "language": "string",
    "include_confidence_scores": "boolean",
    "detailed_results": "boolean"
  }
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "document_id": "string",
    "analysis_id": "string",
    "analysis_results": {
      "sentiment": {
        "overall_sentiment": "positive|negative|neutral",
        "confidence": "float",
        "sentiment_scores": {
          "positive": "float",
          "negative": "float",
          "neutral": "float"
        }
      },
      "readability": {
        "flesch_reading_ease": "float",
        "flesch_kincaid_grade": "float",
        "reading_level": "string"
      },
      "topics": [
        {
          "topic": "string",
          "relevance": "float",
          "keywords": ["array of strings"]
        }
      ],
      "keywords": [
        {
          "keyword": "string",
          "frequency": "integer",
          "importance": "float"
        }
      ]
    },
    "analysis_time": "float"
  }
}
```

---

### 6.5 Job Status
**Endpoint:** `GET /api/v1/documents/jobs/{job_id}`  
**Description:** Get status and results of a document processing job  
**Authentication:** JWT Bearer token required

**Path Parameters:**
- `job_id` (string, required): ID of the processing job

**Response Format:**
```json
{
  "success": true,
  "message": "string",
  "data": {
    "job_id": "string",
    "status": "pending|processing|completed|failed|cancelled",
    "progress_percentage": "integer",
    "created_at": "ISO 8601 datetime",
    "updated_at": "ISO 8601 datetime",
    "estimated_completion": "ISO 8601 datetime",
    "document_id": "string",
    "processing_steps": [
      {
        "step": "string",
        "status": "completed|processing|pending|failed",
        "duration": "float"
      }
    ],
    "results": "object (if completed)",
    "error_message": "string (if failed)"
  }
}
```

---

### 6.6 Documents Health Check
**Endpoint:** `GET /api/v1/documents/health`  
**Description:** Health check for document processing services  
**Authentication:** JWT Bearer token required

**Response Format:**
```json
{
  "success": true,
  "message": "Document services are healthy",
  "data": {
    "pdf_processor": "healthy|unhealthy",
    "document_storage": "healthy|unhealthy",
    "processing_queue": "healthy|unhealthy",
    "background_tasks": "healthy|unhealthy"
  }
}
```

---

### 6.7 Document Listing
**Endpoint:** `GET /api/v1/documents`  
**Description:** List all processed documents with filtering and pagination  
**Authentication:** JWT Bearer token required

**Query Parameters:**
- `limit` (integer, optional): Number of documents to return (default: 50, max: 100)
- `offset` (integer, optional): Number of documents to skip for pagination
- `status` (string, optional): Filter by processing status
- `date_from` (string, optional): Filter documents from this date (ISO 8601)
- `date_to` (string, optional): Filter documents to this date (ISO 8601)
- `search` (string, optional): Search in document titles and content

**Response Format:**
```json
{
  "success": true,
  "message": "Documents retrieved successfully",
  "data": {
    "documents": [
      {
        "document_id": "string",
        "title": "string",
        "filename": "string",
        "status": "completed|processing|failed",
        "upload_date": "ISO 8601 datetime",
        "file_size": "integer",
        "page_count": "integer",
        "content_preview": "string"
      }
    ],
    "pagination": {
      "total": "integer",
      "limit": "integer",
      "offset": "integer",
      "has_more": "boolean"
    }
  }
}
```

---

### 6.8 Document Metadata
**Endpoint:** `GET /api/v1/documents/{document_id}/metadata`  
**Description:** Get detailed metadata for a specific document  
**Authentication:** JWT Bearer token required

**Path Parameters:**
- `document_id` (string, required): ID of the document

**Response Format:**
```json
{
  "success": true,
  "message": "Document metadata retrieved successfully",
  "data": {
    "document_id": "string",
    "title": "string",
    "filename": "string",
    "file_metadata": {
      "size_bytes": "integer",
      "mime_type": "string",
      "upload_timestamp": "ISO 8601 datetime",
      "checksum": "string"
    },
    "processing_metadata": {
      "status": "string",
      "processing_time": "float",
      "page_count": "integer",
      "word_count": "integer",
      "character_count": "integer"
    },
    "extraction_results": {
      "text_extracted": "boolean",
      "images_extracted": "integer",
      "tables_extracted": "integer",
      "entities_extracted": "integer"
    },
    "workspace_context": {
      "workspace_id": "string",
      "uploaded_by": "string",
      "tags": ["array of strings"]
    }
  }
}
```

---

## 7. Administrative and Monitoring Module (`mivaa-pdf-extractor/app/api/admin.py`)

### 7.1 Job Listing
**Endpoint:** `GET /api/v1/admin/jobs`  
**Description:** List all jobs with optional filtering and pagination  
**Authentication:** JWT Bearer token required (Admin role)

**Query Parameters:**
- `status` (string, optional): Filter by job status (pending, running, completed, failed, cancelled)
- `job_type` (string, optional): Filter by job type (document_processing, bulk_processing, etc.)
- `limit` (integer, optional): Number of jobs to return (default: 50, max: 100)
- `offset` (integer, optional): Number of jobs to skip for pagination

**Response Format:**
```json
{
  "success": true,
  "message": "Jobs retrieved successfully",
  "data": {
    "jobs": [
      {
        "job_id": "string",
        "job_type": "string",
        "status": "pending|running|completed|failed|cancelled",
        "created_at": "ISO 8601 datetime",
        "updated_at": "ISO 8601 datetime",
        "details": "object"
      }
    ],
    "total_count": "integer",
    "active_count": "integer",
    "completed_count": "integer",
    "failed_count": "integer"
  },
  "pagination": {
    "limit": "integer",
    "offset": "integer",
    "total": "integer"
  }
}
```

**Error Responses:**
- `401 Unauthorized`: Invalid or missing JWT token
- `403 Forbidden`: Insufficient admin permissions
- `500 Internal Server Error`: Failed to retrieve jobs

---

### 7.2 Job Status
**Endpoint:** `GET /api/v1/admin/jobs/{job_id}`  
**Description:** Get detailed status information for a specific job  
**Authentication:** JWT Bearer token required (Admin role)

**Path Parameters:**
- `job_id` (string, required): Unique identifier for the job

**Response Format:**
```json
{
  "success": true,
  "message": "Job status retrieved successfully",
  "data": {
    "job_id": "string",
    "job_type": "string",
    "status": "pending|running|completed|failed|cancelled",
    "created_at": "ISO 8601 datetime",
    "updated_at": "ISO 8601 datetime",
    "details": {
      "progress_percentage": "integer",
      "processed_count": "integer",
      "failed_count": "integer",
      "results": "object"
    }
  }
}
```

**Error Responses:**
- `404 Not Found`: Job not found
- `500 Internal Server Error`: Failed to get job status

---

### 7.3 Job Cancellation
**Endpoint:** `DELETE /api/v1/admin/jobs/{job_id}`  
**Description:** Cancel a running job  
**Authentication:** JWT Bearer token required (Admin role)

**Path Parameters:**
- `job_id` (string, required): Unique identifier for the job to cancel

**Response Format:**
```json
{
  "success": true,
  "message": "Job cancelled successfully"
}
```

**Error Responses:**
- `404 Not Found`: Active job not found
- `400 Bad Request`: Job is already completed/failed/cancelled
- `500 Internal Server Error`: Failed to cancel job

---

### 7.4 Job Statistics
**Endpoint:** `GET /api/v1/admin/jobs/statistics`  
**Description:** Get comprehensive job statistics and metrics  
**Authentication:** JWT Bearer token required (Admin role)

**Response Format:**
```json
{
  "success": true,
  "message": "Job statistics retrieved successfully",
  "data": {
    "total_jobs": "integer",
    "active_jobs": "integer",
    "completed_jobs": "integer",
    "failed_jobs": "integer",
    "cancelled_jobs": "integer",
    "status_distribution": {
      "pending": "integer",
      "running": "integer",
      "completed": "integer",
      "failed": "integer"
    },
    "type_distribution": {
      "document_processing": "integer",
      "bulk_processing": "integer",
      "image_analysis": "integer"
    },
    "recent_jobs_24h": "integer",
    "average_processing_time_seconds": "float"
  },
  "timestamp": "ISO 8601 datetime"
}
```

---

### 7.5 Bulk Document Processing
**Endpoint:** `POST /api/v1/admin/bulk/process`  
**Description:** Process multiple documents in bulk  
**Authentication:** JWT Bearer token required (Admin role)

**Request Body:**
```json
{
  "urls": ["array of document URLs"],
  "options": {
    "extract_images": "boolean",
    "generate_summary": "boolean",
    "perform_ocr": "boolean",
    "create_embeddings": "boolean"
  },
  "batch_size": "integer (default: 5)"
}
```

**Response Format:**
```json
{
  "success": true,
  "message": "Bulk processing started successfully",
  "data": {
    "job_id": "string",
    "total_documents": "integer",
    "estimated_completion_time": "ISO 8601 datetime"
  }
}
```

**Error Responses:**
- `400 Bad Request`: Invalid URLs or options
- `500 Internal Server Error`: Failed to start bulk processing

---

### 7.6 System Health Check
**Endpoint:** `GET /api/v1/admin/system/health`  
**Description:** Get comprehensive system health status  
**Authentication:** JWT Bearer token required (Admin role)

**Response Format:**
```json
{
  "success": true,
  "message": "System health retrieved successfully",
  "data": {
    "overall_status": "healthy|degraded|unhealthy",
    "system_metrics": {
      "cpu_usage_percent": "float",
      "memory_usage_percent": "float",
      "memory_available_gb": "float",
      "disk_usage_percent": "float",
      "disk_free_gb": "float",
      "active_jobs_count": "integer",
      "uptime_seconds": "integer"
    },
    "services": {
      "supabase": {
        "status": "healthy|unhealthy",
        "response_time_ms": "integer",
        "error": "string (if unhealthy)"
      },
      "llamaindex": {
        "status": "healthy|unhealthy",
        "details": "object"
      },
      "material_kai": {
        "status": "healthy|unhealthy",
        "details": "object"
      }
    },
    "active_jobs": "integer",
    "timestamp": "ISO 8601 datetime"
  }
}
```

---

### 7.7 System Metrics
**Endpoint:** `GET /api/v1/admin/system/metrics`  
**Description:** Get detailed system performance metrics  
**Authentication:** JWT Bearer token required (Admin role)

**Response Format:**
```json
{
  "success": true,
  "message": "System metrics retrieved successfully",
  "data": {
    "cpu": {
      "count": "integer",
      "usage_percent": "float",
      "usage_per_core": ["array of floats"],
      "frequency_mhz": "float"
    },
    "memory": {
      "total_gb": "float",
      "available_gb": "float",
      "used_gb": "float",
      "usage_percent": "float",
      "swap_total_gb": "float",
      "swap_used_gb": "float",
      "swap_percent": "float"
    },
    "disk": {
      "total_gb": "float",
      "used_gb": "float",
      "free_gb": "float",
      "usage_percent": "float",
      "read_bytes": "integer",
      "write_bytes": "integer"
    },
    "network": {
      "bytes_sent": "integer",
      "bytes_received": "integer",
      "packets_sent": "integer",
      "packets_received": "integer"
    },
    "process": {
      "memory_rss_mb": "float",
      "memory_vms_mb": "float",
      "cpu_percent": "float"
    },
    "jobs": {
      "active_count": "integer",
      "total_history": "integer"
    }
  },
  "timestamp": "ISO 8601 datetime"
}
```

---

### 7.8 Data Cleanup
**Endpoint:** `DELETE /api/v1/admin/data/cleanup`  
**Description:** Clean up old data from the system  
**Authentication:** JWT Bearer token required (Admin role)

**Query Parameters:**
- `days_old` (integer, optional): Delete data older than this many days (default: 30)
- `dry_run` (boolean, optional): Preview what would be deleted without actually deleting (default: true)

**Response Format:**
```json
{
  "success": true,
  "message": "Data cleanup completed successfully",
  "data": {
    "old_jobs_count": "integer",
    "cutoff_date": "ISO 8601 datetime",
    "dry_run": "boolean",
    "jobs_deleted": "integer (if not dry run)"
  }
}
```

**Error Responses:**
- `500 Internal Server Error`: Failed to cleanup data

---

### 7.9 Data Backup
**Endpoint:** `POST /api/v1/admin/data/backup`  
**Description:** Create a backup of system data  
**Authentication:** JWT Bearer token required (Admin role)

**Response Format:**
```json
{
  "success": true,
  "message": "Data backup created successfully",
  "data": {
    "backup_id": "string",
    "backup_size_bytes": "integer",
    "items_backed_up": {
      "active_jobs": "integer",
      "job_history": "integer"
    }
  }
}
```

**Error Responses:**
- `500 Internal Server Error`: Failed to create data backup

---

### 7.10 Data Export
**Endpoint:** `GET /api/v1/admin/data/export`  
**Description:** Export system data in various formats  
**Authentication:** JWT Bearer token required (Admin role)

**Query Parameters:**
- `format` (string, optional): Export format (json, csv) - default: json
- `data_type` (string, optional): Type of data to export (jobs, metrics) - default: jobs

**Response Format:**
```json
{
  "success": true,
  "message": "Jobs data exported successfully",
  "data": ["array of job objects"],
  "export_info": {
    "format": "string",
    "data_type": "string",
    "record_count": "integer",
    "exported_at": "ISO 8601 datetime"
  }
}
```

**Error Responses:**
- `500 Internal Server Error`: Failed to export data

---

## Summary

This comprehensive API documentation covers all **37 endpoints** across the MIVAA PDF Extractor Platform:

### Endpoint Count by Module:
1. **Core PDF Processing** (`main.py`): 3 endpoints
2. **Application Core** (`app/main.py`): 4 endpoints  
3. **Enhanced PDF Routes** (`app/api/pdf_routes.py`): 4 endpoints
4. **Image Analysis** (`app/api/images.py`): 5 endpoints
5. **Search and RAG** (`app/api/search.py`): 8 endpoints
6. **Document Management** (`app/api/documents.py`): 8 endpoints
7. **Administrative and Monitoring** (`app/api/admin.py`): 10 endpoints

### Key Features Documented:
- **Authentication**: JWT Bearer token authentication with workspace context
- **PDF Processing**: Markdown conversion, table extraction, image extraction
- **Image Analysis**: Material Kai Vision Platform integration
- **Semantic Search**: LlamaIndex-powered RAG capabilities
- **Document Management**: Comprehensive processing and lifecycle management
- **Administrative Tools**: Job management, system monitoring, data operations
- **Error Handling**: Comprehensive error responses with appropriate HTTP status codes
- **Response Formats**: Consistent JSON response structures across all endpoints

This documentation provides complete technical specifications suitable for enhancing Swagger documentation and serves as a comprehensive reference for developers integrating with the MIVAA PDF Extractor Platform.