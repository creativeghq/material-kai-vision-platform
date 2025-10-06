# MIVAA API Endpoints to Frontend Mapping

**Date**: October 6, 2025  
**Source**: MIVAA PDF Processing Service OpenAPI Documentation  
**Status**: Complete endpoint mapping for frontend integration

## 🎯 **MIVAA Service Overview**

**Base URL**: `http://104.248.68.3:8000`  
**Authentication**: JWT Bearer token required for all endpoints  
**Embedding Model**: text-embedding-ada-002 (1536 dimensions)  
**Performance**: 80% faster search, 90% error reduction (Phase 3 enhancements)

## 📊 **API Categories & Frontend Mapping**

### 1. **📄 PDF Processing APIs** - `/api/v1/extract/*`

#### **Core PDF Extraction**
```
✅ POST /api/v1/api/v1/extract/markdown
✅ POST /api/v1/api/v1/extract/tables  
✅ POST /api/v1/api/v1/extract/images
✅ GET  /api/v1/api/v1/health
```

**Frontend Components:**
- `PDFProcessor.tsx` → `/api/v1/extract/markdown`
- `TableExtractor.tsx` → `/api/v1/extract/tables`
- `ImageExtractor.tsx` → `/api/v1/extract/images`

#### **Advanced Document Processing**
```
✅ POST /api/v1/documents/process
✅ POST /api/v1/documents/process-url
✅ POST /api/v1/documents/batch-process
✅ POST /api/v1/documents/analyze
✅ GET  /api/v1/documents/job/{job_id}
✅ GET  /api/v1/documents/health
```

**Frontend Components:**
- `DocumentUpload.tsx` → `/api/v1/documents/process`
- `URLProcessor.tsx` → `/api/v1/documents/process-url`
- `BatchProcessor.tsx` → `/api/v1/documents/batch-process`
- `DocumentAnalyzer.tsx` → `/api/v1/documents/analyze`

### 2. **🧠 RAG System APIs** - `/api/v1/rag/*`

#### **Document Management**
```
✅ GET    /api/v1/documents/documents
✅ GET    /api/v1/documents/documents/{document_id}
✅ DELETE /api/v1/documents/documents/{document_id}
✅ GET    /api/v1/documents/documents/{document_id}/content
```

**Frontend Components:**
- `DocumentLibrary.tsx` → `/api/v1/documents/documents`
- `DocumentViewer.tsx` → `/api/v1/documents/documents/{id}`
- `DocumentManager.tsx` → DELETE `/api/v1/documents/documents/{id}`

#### **RAG Query & Chat**
```
✅ POST /api/documents/{document_id}/query
✅ POST /api/documents/{document_id}/summarize
✅ POST /api/documents/{document_id}/extract-entities
✅ POST /api/documents/compare
```

**Frontend Components:**
- `DocumentChat.tsx` → `/api/documents/{id}/query`
- `DocumentSummary.tsx` → `/api/documents/{id}/summarize`
- `EntityExtractor.tsx` → `/api/documents/{id}/extract-entities`
- `DocumentComparison.tsx` → `/api/documents/compare`

### 3. **🔍 Search APIs** - `/api/search/*`

#### **Core Search**
```
✅ POST /api/search/semantic
✅ POST /api/search/similarity
✅ GET  /api/documents/{document_id}/related
✅ GET  /api/search/health
```

**Frontend Components:**
- `SemanticSearch.tsx` → `/api/search/semantic`
- `SimilaritySearch.tsx` → `/api/search/similarity`
- `RelatedDocuments.tsx` → `/api/documents/{id}/related`

#### **Advanced Search**
```
✅ POST /api/search/multimodal
✅ POST /api/query/multimodal
✅ POST /api/search/images
✅ POST /api/analyze/multimodal
```

**Frontend Components:**
- `MultiModalSearch.tsx` → `/api/search/multimodal`
- `MultiModalQuery.tsx` → `/api/query/multimodal`
- `ImageSearch.tsx` → `/api/search/images`
- `MultiModalAnalyzer.tsx` → `/api/analyze/multimodal`

### 4. **🤖 Material Analysis APIs** - Material-Specific

#### **Material Visual Search**
```
✅ POST /api/search/materials/visual
✅ POST /api/analyze/materials/image
✅ POST /api/embeddings/materials/generate
✅ GET  /api/search/materials/{material_id}/similar
✅ GET  /api/search/materials/health
```

**Frontend Components:**
- `MaterialRecognition.tsx` → `/api/analyze/materials/image`
- `MaterialVisualSearch.tsx` → `/api/search/materials/visual`
- `MaterialEmbeddings.tsx` → `/api/embeddings/materials/generate`
- `SimilarMaterials.tsx` → `/api/search/materials/{id}/similar`

### 5. **🖼️ Image Analysis APIs** - `/api/v1/images/*`

```
✅ POST /api/v1/images/analyze
✅ POST /api/v1/images/analyze/batch
✅ POST /api/v1/images/search
```

**Frontend Components:**
- `ImageAnalyzer.tsx` → `/api/v1/images/analyze`
- `BatchImageAnalyzer.tsx` → `/api/v1/images/analyze/batch`
- `ImageSearch.tsx` → `/api/v1/images/search`

### 6. **🏥 Health & Monitoring APIs**

```
✅ GET /health
✅ GET /metrics
✅ GET /performance/summary
✅ GET /
```

**Frontend Components:**
- `SystemHealth.tsx` → `/health`
- `PerformanceMetrics.tsx` → `/metrics`
- `SystemDashboard.tsx` → `/performance/summary`

## 🔗 **Frontend-to-MIVAA Integration Patterns**

### **Pattern 1: Direct API Gateway**
```typescript
// Via api-gateway function
const response = await fetch(`${SUPABASE_URL}/functions/v1/api-gateway`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    action: 'pdf_extract',
    payload: { file_url: 'https://example.com/doc.pdf' }
  })
});
```

### **Pattern 2: Dedicated Supabase Functions**
```typescript
// Via specific Supabase function
const response = await fetch(`${SUPABASE_URL}/functions/v1/material-recognition`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image: base64Image,
    options: { includeProperties: true }
  })
});
```

### **Pattern 3: Direct MIVAA Access** (for testing)
```typescript
// Direct to MIVAA service
const response = await fetch('http://104.248.68.3:8000/api/v1/images/analyze', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${MIVAA_JWT_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    image_data: base64Image,
    analysis_options: { include_ocr: true }
  })
});
```

## 📋 **Action Items for Complete Integration**

### **High Priority**
1. ✅ **Fix api-gateway function** - Deploy MIVAA integration
2. ✅ **Map all endpoints** - Complete mapping above
3. ⚠️ **Update frontend components** - Use correct MIVAA endpoints
4. ⚠️ **Test all workflows** - End-to-end testing

### **Medium Priority**
1. **Authentication flow** - Implement JWT token management
2. **Error handling** - Standardize error responses
3. **Caching strategy** - Implement response caching
4. **Performance monitoring** - Add metrics tracking

### **Low Priority**
1. **Legacy endpoint support** - Maintain backward compatibility
2. **Advanced features** - Multi-modal analysis, batch processing
3. **Documentation** - API usage examples
4. **Testing suite** - Comprehensive test coverage

## 🎯 **Next Steps**

1. **Deploy Fixed api-gateway** - Enable MIVAA integration
2. **Update Frontend Components** - Use mapped endpoints
3. **Test All Workflows** - Verify end-to-end functionality
4. **Performance Optimization** - Implement caching and monitoring

---

**Total MIVAA Endpoints**: 37+  
**Frontend Components**: 25+  
**Integration Patterns**: 3 main approaches  
**Status**: Ready for implementation
