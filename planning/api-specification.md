# Category-Based Extraction: API Specification

## New Unified Upload Endpoint

### **Endpoint**

```
POST /api/rag/documents/upload
```

### **Request Parameters**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `file` | File | Required | PDF file to upload |
| `title` | String | Optional | Document title |
| `description` | String | Optional | Document description |
| `tags` | String | Optional | Comma-separated tags |
| `categories` | String | "products" | Categories to extract: "products", "certificates", "logos", "specifications", "all", or comma-separated |
| `discovery_model` | String | "claude" | AI model: "claude" or "gpt" |
| `custom_prompt` | String | Optional | NLP-based extraction request |
| `focused_extraction` | Boolean | Optional | **DEPRECATED** - Use `categories` instead |
| `extract_categories` | String | Optional | **DEPRECATED** - Use `categories` instead |

### **Response**

```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "pending",
  "message": "PDF processing started",
  "status_url": "/api/rag/documents/job/{job_id}",
  "categories": ["products", "certificates"],
  "discovery_model": "claude"
}
```

---

## Request Examples

### **Example 1: Extract Products Only**

```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload" \
  -F "file=@catalog.pdf" \
  -F "categories=products" \
  -F "discovery_model=claude"
```

### **Example 2: Extract Multiple Categories**

```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload" \
  -F "file=@catalog.pdf" \
  -F "categories=products,certificates,logos" \
  -F "discovery_model=claude"
```

### **Example 3: Extract Everything**

```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload" \
  -F "file=@catalog.pdf" \
  -F "categories=all" \
  -F "discovery_model=claude"
```

### **Example 4: NLP-Based Extraction**

```bash
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload" \
  -F "file=@catalog.pdf" \
  -F "custom_prompt=extract products and environmental certifications" \
  -F "discovery_model=claude"
```

### **Example 5: Backward Compatibility**

```bash
# Old way (still works)
curl -X POST "https://v1api.materialshub.gr/api/rag/documents/upload" \
  -F "file=@catalog.pdf" \
  -F "focused_extraction=true" \
  -F "extract_categories=products"

# Gets converted to:
# categories=products
```

---

## Job Status Endpoint

### **Endpoint**

```
GET /api/rag/documents/job/{job_id}
```

### **Response**

```json
{
  "job_id": "uuid",
  "document_id": "uuid",
  "status": "processing",
  "progress": 45,
  "current_stage": "chunking",
  "stage_name": "Chunking (Stage 2)",
  "metadata": {
    "discovery_enabled": true,
    "discovery_model": "claude",
    "categories": ["products", "certificates"],
    "total_pages": 11,
    "pages_to_process": 9,
    "chunks_created": 16,
    "images_extracted": 28,
    "products_discovered": 11,
    "certificates_discovered": 3,
    "logos_discovered": 2,
    "specifications_discovered": 1,
    "metafields_extracted": 45,
    "processing_time_ms": 12500
  }
}
```

---

## Data Retrieval Endpoints

### **Get Chunks by Category**

```
GET /api/rag/chunks?document_id={id}&category=products
```

**Response**:
```json
{
  "chunks": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "content": "...",
      "page_number": 5,
      "category": "product",
      "metadata": {
        "category": "product",
        "categories_requested": ["products", "certificates"]
      }
    }
  ],
  "total": 16,
  "by_category": {
    "product": 14,
    "certificate": 2
  }
}
```

### **Get Images by Category**

```
GET /api/rag/images?document_id={id}&category=product
```

**Response**:
```json
{
  "images": [
    {
      "id": "uuid",
      "document_id": "uuid",
      "image_url": "https://...",
      "page_number": 5,
      "category": "product",
      "metadata": {
        "category": "product",
        "categories_requested": ["products", "certificates"]
      }
    }
  ],
  "total": 28,
  "by_category": {
    "product": 26,
    "certificate": 2
  }
}
```

### **Get Products**

```
GET /api/rag/products?document_id={id}
```

**Response**:
```json
{
  "products": [
    {
      "id": "uuid",
      "name": "NOVA",
      "designer": "SG NY",
      "pages": [5, 6, 7],
      "category": "product",
      "metafields": {
        "slip_resistance": "R11",
        "fire_rating": "A1"
      }
    }
  ],
  "total": 11
}
```

### **Get Certificates** (NEW)

```
GET /api/rag/certificates?document_id={id}
```

**Response**:
```json
{
  "certificates": [
    {
      "id": "uuid",
      "name": "EPD Certificate",
      "type": "EPD",
      "pages": [2, 3],
      "category": "certificate",
      "metadata": {
        "issue_date": "2023-01-15",
        "expiry_date": "2026-01-15",
        "certifying_body": "EPD International"
      }
    }
  ],
  "total": 3
}
```

### **Get Logos** (NEW)

```
GET /api/rag/logos?document_id={id}
```

**Response**:
```json
{
  "logos": [
    {
      "id": "uuid",
      "name": "Company Logo",
      "pages": [1],
      "image_id": "uuid",
      "category": "logo",
      "metadata": {
        "logo_type": "company",
        "color": "blue"
      }
    }
  ],
  "total": 2
}
```

### **Get Specifications** (NEW)

```
GET /api/rag/specifications?document_id={id}
```

**Response**:
```json
{
  "specifications": [
    {
      "id": "uuid",
      "title": "Installation Guide",
      "pages": [10, 11],
      "category": "specification",
      "content": "...",
      "metadata": {
        "spec_type": "installation"
      }
    }
  ],
  "total": 1
}
```

---

## Metafield Endpoints

### **Get Metafields by Category**

```
GET /api/rag/metafields?document_id={id}&category=products
```

**Response**:
```json
{
  "metafields": [
    {
      "id": "uuid",
      "name": "slip_resistance",
      "type": "select",
      "values": ["R9", "R10", "R11"],
      "category": "products",
      "count": 11
    }
  ],
  "total": 45,
  "by_category": {
    "products": 35,
    "certificates": 8,
    "logos": 2
  }
}
```

### **Create Metafield** (NEW)

```
POST /api/rag/metafields
{
  "name": "certification_type",
  "type": "select",
  "category": "certificates",
  "options": ["EPD", "LEED", "FSC"],
  "description": "Type of certification"
}
```

---

## Admin Endpoints

### **Get Extraction Configuration**

```
GET /api/admin/extraction-config
```

**Response**:
```json
{
  "enabled_categories": ["products", "certificates", "logos", "specifications"],
  "default_categories": ["products"],
  "discovery_models": ["claude", "gpt"],
  "metafield_categories": {
    "products": ["slip_resistance", "fire_rating", "thickness"],
    "certificates": ["certification_type", "issue_date", "expiry_date"],
    "logos": ["logo_type", "color"],
    "specifications": ["spec_type", "page_count"]
  }
}
```

### **Update Extraction Configuration**

```
PUT /api/admin/extraction-config
{
  "enabled_categories": ["products", "certificates"],
  "default_categories": ["products"],
  "auto_create_metafields": true
}
```

### **Get Extraction History**

```
GET /api/admin/extraction-history?category=products&limit=20
```

**Response**:
```json
{
  "extractions": [
    {
      "job_id": "uuid",
      "document_id": "uuid",
      "filename": "catalog.pdf",
      "categories": ["products", "certificates"],
      "status": "completed",
      "created_at": "2024-01-15T10:30:00Z",
      "results": {
        "chunks": 16,
        "images": 28,
        "products": 11,
        "certificates": 3,
        "metafields": 45
      }
    }
  ],
  "total": 150
}
```

### **Retry Extraction**

```
POST /api/admin/extraction/{job_id}/retry
{
  "categories": ["products", "certificates"],
  "discovery_model": "claude"
}
```

---

## Error Responses

### **Invalid Category**

```json
{
  "status": 400,
  "error": "invalid_category",
  "message": "Invalid category 'invalid'. Valid categories: products, certificates, logos, specifications, all"
}
```

### **NLP Parsing Failed**

```json
{
  "status": 400,
  "error": "nlp_parsing_failed",
  "message": "Could not parse extraction prompt. Using default: products"
}
```

### **Processing Failed**

```json
{
  "status": 500,
  "error": "processing_failed",
  "message": "PDF processing failed at stage 2 (chunking)",
  "details": {
    "stage": "chunking",
    "error": "..."
  }
}
```

---

## Backward Compatibility

### **Old Parameters Still Work**

```bash
# Old way
POST /api/rag/documents/upload-with-discovery
{
  "focused_extraction": true,
  "extract_categories": "products"
}

# Gets converted to:
POST /api/rag/documents/upload
{
  "categories": "products"
}
```

### **Deprecation Timeline**

- **Now**: Both old and new endpoints work
- **Next Release**: Old endpoints marked as deprecated
- **Future Release**: Old endpoints removed

---

## Rate Limiting

- **Free Tier**: 10 uploads/day
- **Pro Tier**: 100 uploads/day
- **Enterprise**: Unlimited

---

## Webhook Events

### **Processing Started**

```json
{
  "event": "extraction.started",
  "job_id": "uuid",
  "document_id": "uuid",
  "categories": ["products", "certificates"],
  "timestamp": "2024-01-15T10:30:00Z"
}
```

### **Stage Completed**

```json
{
  "event": "extraction.stage_completed",
  "job_id": "uuid",
  "stage": "chunking",
  "progress": 50,
  "timestamp": "2024-01-15T10:35:00Z"
}
```

### **Processing Completed**

```json
{
  "event": "extraction.completed",
  "job_id": "uuid",
  "document_id": "uuid",
  "results": {
    "chunks": 16,
    "images": 28,
    "products": 11,
    "certificates": 3
  },
  "timestamp": "2024-01-15T10:40:00Z"
}
```

### **Processing Failed**

```json
{
  "event": "extraction.failed",
  "job_id": "uuid",
  "error": "chunking_failed",
  "message": "...",
  "timestamp": "2024-01-15T10:40:00Z"
}
```

