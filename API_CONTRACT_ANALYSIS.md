# 🔍 **API CONTRACT ANALYSIS - CRITICAL MISMATCHES FOUND**

## 🚨 **MAJOR ISSUES DISCOVERED**

### **1. WRONG API ENDPOINTS IN MIVAA GATEWAY**

**❌ CURRENT (INCORRECT) MAPPINGS:**
```typescript
// In supabase/functions/mivaa-gateway/index.ts
'material_recognition': { path: '/api/analyze/materials/image', method: 'POST' },
'material_visual_search': { path: '/api/search/materials/visual', method: 'POST' },
'material_embeddings': { path: '/api/embeddings/materials/generate', method: 'POST' },
```

**✅ ACTUAL MIVAA API ENDPOINTS:**
```typescript
// From MIVAA OpenAPI spec
'/api/analyze/materials/image': { 
  requestBody: { "type": "object", "title": "Request" } // GENERIC OBJECT!
}
'/api/search/materials/visual': { 
  requestBody: { "$ref": "#/components/schemas/MaterialSearchRequest" }
}
'/api/embeddings/materials/generate': { 
  requestBody: { "type": "object", "title": "Request" } // GENERIC OBJECT!
}
```

### **2. AUTHENTICATION ISSUE**

**❌ CURRENT PROBLEM:**
```
MIVAA service error (401): {"error":"Invalid authentication token"}
```

**🔍 ANALYSIS:**
- MIVAA API requires: `Authorization: Bearer your-jwt-token`
- We're sending: `Authorization: Bearer ${MIVAA_API_KEY}`
- **ISSUE**: MIVAA expects a **JWT token**, not an API key!

### **3. REQUEST PAYLOAD MISMATCHES**

**❌ FRONTEND SENDS:**
```typescript
// From MaterialRecognition.tsx
{
  action: 'material_recognition',
  payload: {
    image_data: base64Image,
    analysis_options: {
      include_properties: true,
      include_composition: true,
      confidence_threshold: 0.8,
    },
  },
}
```

**❌ MIVAA GATEWAY FORWARDS:**
```typescript
// From mivaa-gateway/index.ts
requestOptions.body = JSON.stringify(payload);
// Sends: { image_data: "...", analysis_options: {...} }
```

**✅ MIVAA API EXPECTS:**
```typescript
// From OpenAPI spec - /api/analyze/materials/image
{
  "type": "object",
  "title": "Request"
}
// But actual schema is undefined - this is a problem!
```

### **4. PDF PROCESSING ENDPOINT DUPLICATION**

**❌ WRONG PATHS IN OPENAPI:**
```
"/api/v1/api/v1/extract/markdown" // DUPLICATED PATH!
"/api/v1/api/v1/extract/tables"   // DUPLICATED PATH!
"/api/v1/api/v1/extract/images"   // DUPLICATED PATH!
```

**✅ CORRECT PATHS SHOULD BE:**
```
"/api/v1/extract/markdown"
"/api/v1/extract/tables"
"/api/v1/extract/images"
```

### **5. MISSING REQUEST SCHEMAS**

**❌ MATERIAL ENDPOINTS HAVE NO SCHEMAS:**
```json
"/api/analyze/materials/image": {
  "requestBody": {
    "content": {
      "application/json": {
        "schema": {
          "type": "object",
          "title": "Request"  // NO ACTUAL SCHEMA!
        }
      }
    }
  }
}
```

## 🔧 **REQUIRED FIXES**

### **Fix 1: Update MIVAA Gateway Endpoint Mappings**
```typescript
// Fix the duplicated paths
'pdf_extract_markdown': { path: '/api/v1/extract/markdown', method: 'POST' },
'pdf_extract_tables': { path: '/api/v1/extract/tables', method: 'POST' },
'pdf_extract_images': { path: '/api/v1/extract/images', method: 'POST' },
```

### **Fix 2: Fix Authentication Method**
```typescript
// MIVAA expects JWT, not API key
// Need to either:
// 1. Get proper JWT token from MIVAA
// 2. Or use different auth method
// 3. Or check if MIVAA_API_KEY is actually a JWT
```

### **Fix 3: Fix Request Payload Structure**
```typescript
// For image analysis, MIVAA likely expects:
{
  "image": "base64_string",
  "options": {
    "analysis_type": "material_recognition",
    "include_properties": true
  }
}
// NOT our current structure
```

### **Fix 4: Fix Frontend Service URL**
```typescript
// In mivaaIntegrationService.ts
private config: MivaaConfig = {
  baseUrl: 'https://v1api.materialshub.gr/', // ✅ CORRECT
  // NOT: 'http://104.248.68.3:8000'          // ❌ WRONG
};
```

### **Fix 5: Fix Scraper Function Service Names**
```typescript
// Material scraper expects "firecrawl" not "jina"
// From error: "Invalid service provided. Must be 'jina' or 'firecrawl'"
// But we sent "jina" - so the validation is wrong or we need "firecrawl"
```

## 🎯 **ROOT CAUSE ANALYSIS**

### **1. API Documentation Issues**
- MIVAA OpenAPI spec has duplicated paths (`/api/v1/api/v1/...`)
- Material endpoints have no proper request schemas
- Authentication requirements unclear

### **2. Integration Mismatches**
- Frontend assumes one payload structure
- MIVAA Gateway forwards without transformation
- MIVAA API expects different structure

### **3. Authentication Confusion**
- Environment variable called `MIVAA_API_KEY`
- But MIVAA expects JWT Bearer token
- Unclear if API key should be JWT or different auth method

### **4. Service Configuration**
- Frontend service points to wrong URL
- Scraper functions have wrong service validation

## 🚀 **IMMEDIATE ACTION PLAN**

### **Step 1: Fix MIVAA URL Configuration**
- Update `mivaaIntegrationService.ts` to use `https://v1api.materialshub.gr/`
- Verify `MIVAA_GATEWAY_URL` environment variable

### **Step 2: Investigate Authentication**
- Check what `MIVAA_API_KEY` actually contains
- Test if it's a valid JWT token
- If not, get proper JWT from MIVAA service

### **Step 3: Fix API Endpoint Paths**
- Remove duplicate `/api/v1/` from paths
- Update MIVAA gateway mappings

### **Step 4: Test Real API Contracts**
- Call MIVAA endpoints directly to understand expected payload
- Update frontend and gateway to match actual API

### **Step 5: Fix Scraper Service Validation**
- Determine correct service name ("jina" vs "firecrawl")
- Update validation or test parameters

## 📊 **IMPACT ASSESSMENT**

**🔴 HIGH IMPACT:**
- Authentication failure blocks all MIVAA features
- Wrong URL blocks frontend integration
- Wrong API paths cause 404 errors

**🟡 MEDIUM IMPACT:**
- Payload mismatches cause validation errors
- Scraper service validation blocks testing

**🟢 LOW IMPACT:**
- Documentation inconsistencies
- Minor endpoint mapping issues

## 🎯 **NEXT STEPS**

1. **Fix URL and authentication first** (highest impact)
2. **Test direct MIVAA API calls** to understand real contracts
3. **Update gateway and frontend** to match actual API
4. **Comprehensive end-to-end testing**

**The core issue is that we built integration based on assumptions rather than actual API testing!**
