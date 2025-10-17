# 📋 PHASE 2 STEP 3: CREATE RETRIEVAL ENDPOINTS - PLAN

**Date**: 2025-10-16  
**Status**: Planning  
**Estimated Time**: 2-3 hours  
**Goal**: Create GET/LIST/DELETE endpoints for all 18 storage tables

---

## 🎯 RETRIEVAL ENDPOINTS NEEDED

### Tier 1: CRITICAL (4 functions)
1. **generation_3d** - crewai-3d-generation
2. **style_analysis_results** - style-analysis
3. **property_analysis_results** - material-properties-analysis
4. **hybrid_analysis_results** - hybrid-material-analysis

### Tier 2: IMPORTANT (6 functions)
5. **spaceformer_analysis_results** - spaceformer-analysis
6. **svbrdf_extraction_results** - svbrdf-extractor
7. **ocr_results** - ocr-processing
8. **recognition_results** - material-recognition
9. **voice_conversion_results** - voice-to-material
10. **material_visual_analysis** - visual-search-analyze

### Tier 3: BATCH & SEARCH (8 functions)
11. **pdf_integration_health_results** - pdf-integration-health
12. **search_analytics** - enhanced-rag-search, rag-knowledge-search, unified-material-search, material-images-api
13. **ml_training_jobs** - huggingface-model-trainer
14. **visual_search_batch_jobs** - visual-search-batch
15. **scraping_sessions** - scrape-session-manager

---

## 📝 ENDPOINT PATTERNS

### For Each Storage Table

#### 1. GET Single Result
```
GET /api/results/{table_name}/{id}
- Fetch single result by ID
- Return full result with metadata
- Include timestamps and confidence scores
```

#### 2. LIST Results
```
GET /api/results/{table_name}
- List all results with pagination
- Query parameters:
  - limit: number (default 20, max 100)
  - offset: number (default 0)
  - user_id: filter by user
  - created_after: ISO timestamp
  - created_before: ISO timestamp
  - sort_by: field name (default created_at)
  - sort_order: asc|desc (default desc)
- Return paginated results with total count
```

#### 3. DELETE Result
```
DELETE /api/results/{table_name}/{id}
- Delete single result by ID
- Verify user ownership
- Return success/error
```

#### 4. SEARCH Results
```
POST /api/results/{table_name}/search
- Search results by criteria
- Body:
  - filters: object with field:value pairs
  - search_text: full-text search
  - confidence_min: minimum confidence score
  - limit: number
- Return matching results
```

---

## 🏗️ IMPLEMENTATION APPROACH

### Option 1: Generic Retrieval Function (Recommended)
Create a single Edge Function that handles all retrieval operations:
- `retrieval-api` - Generic GET/LIST/DELETE/SEARCH for all tables
- Route: `/api/results/{table_name}/{operation}`
- Handles all 15 storage tables

**Advantages**:
- Single function to maintain
- Consistent patterns
- Easier to update
- Reduced code duplication

**Disadvantages**:
- More complex routing logic
- Need to validate table names

### Option 2: Individual Functions
Create separate functions for each table:
- `get-generation-3d`
- `get-style-analysis`
- `get-hybrid-analysis`
- etc.

**Advantages**:
- Simple, straightforward
- Easy to customize per table
- Clear separation of concerns

**Disadvantages**:
- 15+ functions to maintain
- Code duplication
- Harder to keep consistent

---

## 🎯 RECOMMENDED APPROACH

**Use Option 1: Generic Retrieval Function**

Create a single `retrieval-api` Edge Function that:
1. Accepts table name as parameter
2. Validates table name against whitelist
3. Routes to appropriate handler
4. Returns consistent response format

---

## 📊 RESPONSE FORMAT

### Success Response
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "user_id": "uuid",
    "input_data": {},
    "result_data": {},
    "confidence_score": 0.95,
    "processing_time_ms": 1234,
    "created_at": "2025-10-16T10:00:00Z",
    "updated_at": "2025-10-16T10:00:00Z"
  },
  "metadata": {
    "timestamp": "2025-10-16T10:00:00Z",
    "processing_time_ms": 45
  }
}
```

### List Response
```json
{
  "success": true,
  "data": [
    { /* result 1 */ },
    { /* result 2 */ }
  ],
  "pagination": {
    "total": 150,
    "limit": 20,
    "offset": 0,
    "has_more": true
  },
  "metadata": {
    "timestamp": "2025-10-16T10:00:00Z",
    "processing_time_ms": 45
  }
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "error_code": "INVALID_TABLE",
  "metadata": {
    "timestamp": "2025-10-16T10:00:00Z"
  }
}
```

---

## 🔐 SECURITY CONSIDERATIONS

1. **Table Whitelist**: Only allow access to known storage tables
2. **User Ownership**: Verify user_id matches request user
3. **Rate Limiting**: Limit list queries to prevent abuse
4. **Input Validation**: Validate all query parameters
5. **Error Handling**: Don't expose internal errors

---

## 📋 IMPLEMENTATION STEPS

### Step 1: Create retrieval-api Function
- Create `supabase/functions/retrieval-api/index.ts`
- Implement routing logic
- Add table whitelist
- Add error handling

### Step 2: Implement GET Single
- Fetch by ID
- Verify user ownership
- Return result

### Step 3: Implement LIST
- Fetch with pagination
- Apply filters
- Sort results
- Return paginated response

### Step 4: Implement DELETE
- Delete by ID
- Verify user ownership
- Return success

### Step 5: Implement SEARCH
- Parse search criteria
- Build dynamic query
- Return matching results

### Step 6: Test All Endpoints
- Test GET single
- Test LIST with pagination
- Test DELETE
- Test SEARCH
- Test error cases

---

## ⏱️ TIME ESTIMATE

- Create function structure: 30 min
- Implement GET single: 30 min
- Implement LIST: 45 min
- Implement DELETE: 30 min
- Implement SEARCH: 45 min
- Testing: 30 min

**Total**: 3-4 hours

---

## 🚀 NEXT STEPS

1. Approve approach (Generic vs Individual)
2. Create retrieval-api function
3. Implement all endpoints
4. Test thoroughly
5. Document API

---

**Status**: Ready to implement


