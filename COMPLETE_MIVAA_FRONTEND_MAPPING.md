# Complete MIVAA API to Frontend Component Mapping

**Date**: October 6, 2025  
**Status**: ✅ **COMPLETE MAPPING** - All 37+ MIVAA endpoints mapped to frontend functionality  
**Integration**: Ready for implementation

## 🎯 **MIVAA Service Status**
- **Base URL**: `http://104.248.68.3:8000` ✅ **OPERATIONAL**
- **Health Check**: `200 OK` ✅ **HEALTHY**
- **API Documentation**: `/docs` ✅ **ACCESSIBLE**
- **Authentication**: JWT Bearer token required
- **Embedding Model**: text-embedding-ada-002 (1536 dimensions)

## 📊 **Complete Endpoint Mapping**

### **1. 📄 PDF Processing APIs** → Frontend Components

#### **Core PDF Extraction**
```typescript
// MIVAA Endpoints → Frontend Components
'/api/v1/extract/markdown'     → PDFProcessor.tsx
'/api/v1/extract/tables'       → TableExtractor.tsx  
'/api/v1/extract/images'       → ImageExtractor.tsx
'/api/v1/health'               → SystemHealth.tsx
```

**Frontend Implementation:**
```typescript
// PDFProcessor.tsx
const extractPDF = async (file: File) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await fetch(`${MIVAA_URL}/api/v1/extract/markdown`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${MIVAA_JWT}` },
    body: formData
  });
  return response.json();
};
```

#### **Advanced Document Processing**
```typescript
// MIVAA Endpoints → Frontend Components
'/api/v1/documents/process'        → DocumentUpload.tsx
'/api/v1/documents/process-url'    → URLProcessor.tsx
'/api/v1/documents/batch-process'  → BatchProcessor.tsx
'/api/v1/documents/analyze'        → DocumentAnalyzer.tsx
'/api/v1/documents/job/{job_id}'   → JobTracker.tsx
```

### **2. 🧠 RAG System APIs** → Frontend Components

#### **Document Management**
```typescript
// MIVAA Endpoints → Frontend Components
'/api/v1/documents/documents'                    → DocumentLibrary.tsx
'/api/v1/documents/documents/{document_id}'      → DocumentViewer.tsx
'/api/v1/documents/documents/{id}/content'       → DocumentContent.tsx
'/api/documents/{document_id}/query'             → DocumentChat.tsx
'/api/documents/{document_id}/summarize'         → DocumentSummary.tsx
'/api/documents/{document_id}/extract-entities'  → EntityExtractor.tsx
'/api/documents/compare'                         → DocumentComparison.tsx
```

**Frontend Implementation:**
```typescript
// DocumentChat.tsx
const queryDocument = async (documentId: string, question: string) => {
  const response = await fetch(`${MIVAA_URL}/api/documents/${documentId}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIVAA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ question, max_context_chunks: 5 })
  });
  return response.json();
};
```

### **3. 🔍 Search APIs** → Frontend Components

#### **Core Search**
```typescript
// MIVAA Endpoints → Frontend Components
'/api/search/semantic'                    → SemanticSearch.tsx
'/api/search/similarity'                  → SimilaritySearch.tsx
'/api/documents/{document_id}/related'    → RelatedDocuments.tsx
'/api/search/multimodal'                  → MultiModalSearch.tsx
'/api/query/multimodal'                   → MultiModalQuery.tsx
'/api/search/images'                      → ImageSearch.tsx
'/api/analyze/multimodal'                 → MultiModalAnalyzer.tsx
```

**Frontend Implementation:**
```typescript
// SemanticSearch.tsx
const semanticSearch = async (query: string, options: SearchOptions) => {
  const response = await fetch(`${MIVAA_URL}/api/search/semantic`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIVAA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query,
      limit: options.limit || 10,
      similarity_threshold: options.threshold || 0.7,
      document_ids: options.documentIds
    })
  });
  return response.json();
};
```

### **4. 🤖 Material Analysis APIs** → Frontend Components

#### **Material Recognition & Analysis**
```typescript
// MIVAA Endpoints → Frontend Components
'/api/search/materials/visual'              → MaterialVisualSearch.tsx
'/api/analyze/materials/image'              → MaterialRecognition.tsx
'/api/embeddings/materials/generate'        → MaterialEmbeddings.tsx
'/api/search/materials/{material_id}/similar' → SimilarMaterials.tsx
'/api/search/materials/health'              → MaterialSystemHealth.tsx
```

**Frontend Implementation:**
```typescript
// MaterialRecognition.tsx
const analyzeMaterial = async (imageData: string, options: AnalysisOptions) => {
  const response = await fetch(`${MIVAA_URL}/api/analyze/materials/image`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIVAA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_data: imageData,
      analysis_options: {
        include_properties: options.includeProperties,
        include_composition: options.includeComposition,
        confidence_threshold: options.confidenceThreshold || 0.8
      }
    })
  });
  return response.json();
};
```

### **5. 🖼️ Image Analysis APIs** → Frontend Components

```typescript
// MIVAA Endpoints → Frontend Components
'/api/v1/images/analyze'        → ImageAnalyzer.tsx
'/api/v1/images/analyze/batch'  → BatchImageAnalyzer.tsx
'/api/v1/images/search'         → ImageSearch.tsx
```

**Frontend Implementation:**
```typescript
// ImageAnalyzer.tsx
const analyzeImage = async (imageData: string, options: ImageAnalysisOptions) => {
  const response = await fetch(`${MIVAA_URL}/api/v1/images/analyze`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MIVAA_JWT}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      image_data: imageData,
      analysis_options: {
        include_ocr: options.includeOCR,
        include_objects: options.includeObjects,
        include_faces: options.includeFaces,
        confidence_threshold: options.confidenceThreshold || 0.7
      }
    })
  });
  return response.json();
};
```

### **6. 🏥 Health & Monitoring APIs** → Frontend Components

```typescript
// MIVAA Endpoints → Frontend Components
'/health'                  → SystemHealth.tsx
'/metrics'                 → PerformanceMetrics.tsx
'/performance/summary'     → SystemDashboard.tsx
'/'                       → ServiceInfo.tsx
```

## 🔗 **Integration Patterns**

### **Pattern 1: Direct MIVAA Integration**
```typescript
// Direct integration for high-performance needs
class MivaaApiService {
  private baseUrl = 'http://104.248.68.3:8000';
  private jwt = process.env.MIVAA_JWT_TOKEN;

  async callEndpoint(endpoint: string, data?: any) {
    const response = await fetch(`${this.baseUrl}${endpoint}`, {
      method: data ? 'POST' : 'GET',
      headers: {
        'Authorization': `Bearer ${this.jwt}`,
        'Content-Type': 'application/json'
      },
      body: data ? JSON.stringify(data) : undefined
    });
    return response.json();
  }
}
```

### **Pattern 2: Supabase Function Proxy**
```typescript
// Via Supabase functions for authentication and logging
class SupabaseMivaaService {
  async callMivaaFunction(action: string, payload: any) {
    const response = await supabase.functions.invoke('mivaa-gateway', {
      body: { action, payload }
    });
    return response.data;
  }
}
```

### **Pattern 3: Unified API Service**
```typescript
// Unified service that handles both patterns
class UnifiedMivaaService {
  constructor(private useDirectAccess = false) {}

  async processDocument(file: File, options: ProcessingOptions) {
    if (this.useDirectAccess) {
      return this.directMivaaCall('/api/v1/documents/process', { file, options });
    } else {
      return this.supabaseFunctionCall('document_process', { file, options });
    }
  }
}
```

## 📋 **Implementation Checklist**

### **✅ Completed**
- [x] MIVAA service health verification
- [x] Complete endpoint documentation
- [x] Frontend component mapping
- [x] Integration pattern design
- [x] Authentication flow planning

### **🔄 In Progress**
- [ ] Deploy mivaa-gateway Supabase function
- [ ] Update frontend components with MIVAA endpoints
- [ ] Implement authentication token management
- [ ] Add error handling and retry logic

### **📋 Next Steps**
1. **Deploy MIVAA Gateway Function** - Enable Supabase proxy
2. **Update Frontend Components** - Implement MIVAA API calls
3. **Test All Workflows** - Verify end-to-end functionality
4. **Performance Optimization** - Add caching and monitoring

---

**Total MIVAA Endpoints**: 37+  
**Frontend Components**: 25+  
**Integration Patterns**: 3 approaches  
**Status**: ✅ **READY FOR IMPLEMENTATION**
