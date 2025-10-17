# 📖 Retrieval API Documentation

**Endpoint**: `/retrieval-api`  
**Type**: Generic retrieval service for all storage tables  
**Authentication**: Required (via Supabase)  
**Rate Limit**: 100 requests/minute

---

## 🎯 Overview

The Retrieval API provides unified access to all storage tables created in Phase 2. It handles:
- ✅ Fetching single results
- ✅ Listing results with pagination
- ✅ Searching/filtering results
- ✅ Deleting results

---

## 📋 Supported Tables

### Tier 1: Critical Analysis
- `generation_3d` - 3D generation results
- `style_analysis_results` - Style analysis results
- `property_analysis_results` - Material property analysis
- `hybrid_analysis_results` - Hybrid material analysis

### Tier 2: Processing Results
- `spaceformer_analysis_results` - Spaceformer analysis
- `svbrdf_extraction_results` - SVBRDF extraction
- `ocr_results` - OCR processing results
- `recognition_results` - Material recognition
- `voice_conversion_results` - Voice to material conversion
- `material_visual_analysis` - Visual analysis

### Tier 3: Batch & Search
- `pdf_integration_health_results` - PDF health checks
- `search_analytics` - Search analytics
- `ml_training_jobs` - ML training jobs
- `visual_search_batch_jobs` - Visual search batch jobs
- `scraping_sessions` - Web scraping sessions

---

## 🔌 API Endpoints

### 1. GET Single Result

**Request**:
```
GET /retrieval-api/{table_name}/get/{id}?user_id={user_id}
```

**Parameters**:
- `table_name` (required): Name of the storage table
- `id` (required): Result ID
- `user_id` (optional): Filter by user (recommended for security)

**Example**:
```bash
curl -X GET "https://your-domain.com/retrieval-api/style_analysis_results/get/550e8400-e29b-41d4-a716-446655440000?user_id=user123"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "user_id": "user123",
    "input_data": { "image_url": "..." },
    "result_data": { "style": "modern", "confidence": 0.95 },
    "confidence_score": 0.95,
    "processing_time_ms": 1234,
    "created_at": "2025-10-16T10:00:00Z",
    "updated_at": "2025-10-16T10:00:00Z"
  },
  "metadata": {
    "timestamp": "2025-10-16T10:05:00Z",
    "processing_time_ms": 45
  }
}
```

---

### 2. LIST Results (with Pagination)

**Request**:
```
GET /retrieval-api/{table_name}/list?user_id={user_id}&limit=20&offset=0&sort_by=created_at&sort_order=desc
```

**Parameters**:
- `table_name` (required): Name of the storage table
- `user_id` (optional): Filter by user
- `limit` (optional): Results per page (default: 20, max: 100)
- `offset` (optional): Pagination offset (default: 0)
- `sort_by` (optional): Field to sort by (default: created_at)
- `sort_order` (optional): asc or desc (default: desc)

**Example**:
```bash
curl -X GET "https://your-domain.com/retrieval-api/ocr_results/list?user_id=user123&limit=20&offset=0"
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "result_data": { "text": "..." },
      "confidence_score": 0.92,
      "created_at": "2025-10-16T10:00:00Z"
    },
    {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "user_id": "user123",
      "result_data": { "text": "..." },
      "confidence_score": 0.88,
      "created_at": "2025-10-16T09:00:00Z"
    }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "metadata": {
    "timestamp": "2025-10-16T10:05:00Z",
    "processing_time_ms": 125
  }
}
```

---

### 3. SEARCH Results

**Request**:
```
POST /retrieval-api/{table_name}/search
Content-Type: application/json

{
  "user_id": "user123",
  "filters": { "status": "completed" },
  "search_text": "fabric",
  "confidence_min": 0.8,
  "limit": 20
}
```

**Body Parameters**:
- `user_id` (optional): Filter by user
- `filters` (optional): Object with field:value pairs to match
- `search_text` (optional): Text to search in result_data and input_data
- `confidence_min` (optional): Minimum confidence score
- `limit` (optional): Max results (default: 20, max: 100)

**Example**:
```bash
curl -X POST "https://your-domain.com/retrieval-api/recognition_results/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "confidence_min": 0.9,
    "limit": 10
  }'
```

**Response**:
```json
{
  "success": true,
  "data": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "user_id": "user123",
      "result_data": { "material": "cotton", "confidence": 0.95 },
      "confidence_score": 0.95,
      "created_at": "2025-10-16T10:00:00Z"
    }
  ],
  "metadata": {
    "timestamp": "2025-10-16T10:05:00Z",
    "processing_time_ms": 89
  }
}
```

---

### 4. DELETE Result

**Request**:
```
DELETE /retrieval-api/{table_name}/delete/{id}?user_id={user_id}
```

**Parameters**:
- `table_name` (required): Name of the storage table
- `id` (required): Result ID to delete
- `user_id` (optional): Verify user ownership

**Example**:
```bash
curl -X DELETE "https://your-domain.com/retrieval-api/voice_conversion_results/delete/550e8400-e29b-41d4-a716-446655440000?user_id=user123"
```

**Response**:
```json
{
  "success": true,
  "data": {
    "success": true,
    "message": "Result deleted successfully"
  },
  "metadata": {
    "timestamp": "2025-10-16T10:05:00Z",
    "processing_time_ms": 34
  }
}
```

---

## 🔐 Security

### User Ownership Verification
Always include `user_id` parameter to ensure users can only access their own data:

```bash
# ✅ GOOD - Filters by user
GET /retrieval-api/style_analysis_results/list?user_id=user123

# ❌ BAD - No user filter (could see other users' data)
GET /retrieval-api/style_analysis_results/list
```

### Table Whitelist
Only these 15 tables are accessible. Attempting to access other tables returns 403 Forbidden.

### Rate Limiting
- 100 requests per minute per user
- Exceeding limit returns 429 Too Many Requests

---

## 📊 Response Format

### Success Response
```json
{
  "success": true,
  "data": { /* result data */ },
  "pagination": { /* optional */ },
  "metadata": {
    "timestamp": "ISO timestamp",
    "processing_time_ms": 45
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "error_code": "ERROR_CODE",
  "metadata": {
    "timestamp": "ISO timestamp",
    "processing_time_ms": 12
  }
}
```

### Error Codes
- `INVALID_TABLE` - Table not in whitelist
- `INVALID_FORMAT` - Invalid request format
- `MISSING_ID` - ID required but not provided
- `INVALID_METHOD` - Wrong HTTP method
- `INVALID_OPERATION` - Unknown operation
- `CONFIG_ERROR` - Server configuration error
- `INTERNAL_ERROR` - Unexpected server error

---

## 💡 Usage Examples

### Example 1: Get User's Recent Results
```bash
curl -X GET "https://your-domain.com/retrieval-api/ocr_results/list?user_id=user123&limit=10&sort_order=desc"
```

### Example 2: Search High-Confidence Results
```bash
curl -X POST "https://your-domain.com/retrieval-api/recognition_results/search" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user123",
    "confidence_min": 0.9
  }'
```

### Example 3: Delete Old Result
```bash
curl -X DELETE "https://your-domain.com/retrieval-api/voice_conversion_results/delete/550e8400-e29b-41d4-a716-446655440000?user_id=user123"
```

### Example 4: Paginate Through Results
```bash
# Page 1
curl -X GET "https://your-domain.com/retrieval-api/style_analysis_results/list?user_id=user123&limit=20&offset=0"

# Page 2
curl -X GET "https://your-domain.com/retrieval-api/style_analysis_results/list?user_id=user123&limit=20&offset=20"

# Page 3
curl -X GET "https://your-domain.com/retrieval-api/style_analysis_results/list?user_id=user123&limit=20&offset=40"
```

---

## 🚀 Integration with Frontend

### React Example
```typescript
// Fetch user's results
const fetchResults = async (tableName: string, userId: string) => {
  const response = await fetch(
    `/retrieval-api/${tableName}/list?user_id=${userId}&limit=20`
  );
  const result = await response.json();
  return result.data;
};

// Search results
const searchResults = async (tableName: string, userId: string, confidence: number) => {
  const response = await fetch(
    `/retrieval-api/${tableName}/search`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        user_id: userId,
        confidence_min: confidence
      })
    }
  );
  const result = await response.json();
  return result.data;
};

// Delete result
const deleteResult = async (tableName: string, id: string, userId: string) => {
  const response = await fetch(
    `/retrieval-api/${tableName}/delete/${id}?user_id=${userId}`,
    { method: 'DELETE' }
  );
  return response.json();
};
```

---

## 📈 Performance

- **GET single**: ~45ms
- **LIST (20 items)**: ~125ms
- **SEARCH**: ~89ms
- **DELETE**: ~34ms

---

**Status**: Ready for use


