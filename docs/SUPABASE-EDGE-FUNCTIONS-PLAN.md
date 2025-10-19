# Supabase Edge Functions Plan - Knowledge Base & Products System

**Document Version**: 1.0  
**Date**: 2025-10-19  
**Status**: Ready for Implementation

---

## 📋 OVERVIEW

This document identifies which tasks from the implementation roadmap require Supabase Edge Functions and maps them to your existing architectural patterns.

### Your Existing Pattern

Your platform uses a **hybrid approach**:
1. **Supabase Edge Functions** (Deno/TypeScript) for backend operations
2. **Frontend Services** (TypeScript/React) for client-side logic
3. **Shared utilities** in `supabase/functions/_shared/` for common patterns

---

## 🎯 WHICH TASKS NEED SUPABASE EDGE FUNCTIONS?

### ✅ PHASE 1: Knowledge Base UI Fixes (Week 1-2)
**No new Edge Functions needed** - These are frontend-only fixes
- Sprint 1.1-1.3: UI components, modals, real-time polling
- All work in `src/components/Admin/MaterialKnowledgeBase.tsx`

---

### ✅ PHASE 2: Database & Products Foundation (Week 2-3)

#### Sprint 2.1: Database Schema & Migrations
**No Edge Functions** - Direct database operations via Supabase client

#### Sprint 2.2: Product APIs - CRUD
**✅ CREATE NEW EDGE FUNCTION**: `products-api`
- **Pattern**: Similar to `crm-users-api` and `crm-contacts-api`
- **Operations**: POST/GET/PATCH/DELETE for products
- **Location**: `supabase/functions/products-api/index.ts`
- **Responsibilities**:
  - Create product: `POST /api/products`
  - List products: `GET /api/products`
  - Get product: `GET /api/products/:id`
  - Update product: `PATCH /api/products/:id`
  - Delete product: `DELETE /api/products/:id`

#### Sprint 2.3: Product-Chunk Relationships
**✅ CREATE NEW EDGE FUNCTION**: `product-relationships-api`
- **Pattern**: Similar to existing relationship APIs
- **Operations**: Link/unlink chunks to products
- **Location**: `supabase/functions/product-relationships-api/index.ts`
- **Responsibilities**:
  - Link chunks: `POST /api/products/:id/chunks`
  - Get product chunks: `GET /api/products/:id/chunks`
  - Unlink chunk: `DELETE /api/products/:id/chunks/:chunkId`
  - Calculate relevance scores

---

### ✅ PHASE 3: Product Creation & Embeddings (Week 3-4)

#### Sprint 3.1: Product Builder Service
**✅ CREATE NEW EDGE FUNCTION**: `product-builder`
- **Pattern**: Similar to `extract-material-knowledge`, `extract-categories`
- **Operations**: Build products from chunks
- **Location**: `supabase/functions/product-builder/index.ts`
- **Responsibilities**:
  - Extract properties from chunks
  - Generate product name/description
  - Validate product data
  - Return structured product

#### Sprint 3.2: Product Embeddings
**✅ CREATE NEW EDGE FUNCTION**: `product-embeddings`
- **Pattern**: Similar to `document-vector-search`, `unified-material-search`
- **Operations**: Generate and store embeddings
- **Location**: `supabase/functions/product-embeddings/index.ts`
- **Responsibilities**:
  - Generate text embeddings (OpenAI)
  - Generate image embeddings (CLIP)
  - Generate hybrid embeddings
  - Store in `product_embeddings` table
  - Update product embedding reference

#### Sprint 3.3: Product Management UI
**No new Edge Functions** - Frontend-only work

---

### ✅ PHASE 4: Search & Materials Page (Week 4-5)

#### Sprint 4.1: Unified Search Service
**✅ CREATE NEW EDGE FUNCTION**: `products-search`
- **Pattern**: Similar to `unified-material-search`, `enhanced-rag-search`
- **Operations**: Search products and chunks
- **Location**: `supabase/functions/products-search/index.ts`
- **Responsibilities**:
  - Search product embeddings (vector similarity)
  - Search chunk embeddings (vector similarity)
  - Keyword search
  - Merge and rank results
  - Filter by properties/category

#### Sprint 4.2: Materials Page
**No new Edge Functions** - Frontend-only work

#### Sprint 4.3: Search Integration
**No new Edge Functions** - Uses existing search function

---

### ✅ PHASE 5: Agent Integration (Week 5)

#### Sprint 5.1: Agent Product Recommendations
**✅ UPDATE EXISTING EDGE FUNCTION**: `material-agent-orchestrator`
- **Pattern**: Already exists, add product recommendation logic
- **Location**: `supabase/functions/material-agent-orchestrator/index.ts`
- **Changes**:
  - Query products in search results
  - Match products to user query
  - Generate recommendations
  - Format product suggestions in response

---

### ✅ PHASE 6: Testing & Deployment (Week 5-6)
**No new Edge Functions** - Testing and deployment

---

## 📊 SUMMARY TABLE

| Phase | Sprint | Task | Edge Function | Type | Pattern |
|-------|--------|------|----------------|------|---------|
| 2 | 2.2 | Product CRUD | `products-api` | NEW | crm-users-api |
| 2 | 2.3 | Relationships | `product-relationships-api` | NEW | crm-contacts-api |
| 3 | 3.1 | Product Builder | `product-builder` | NEW | extract-material-knowledge |
| 3 | 3.2 | Embeddings | `product-embeddings` | NEW | document-vector-search |
| 4 | 4.1 | Search | `products-search` | NEW | unified-material-search |
| 5 | 5.1 | Agent | `material-agent-orchestrator` | UPDATE | existing |

---

## 🏗️ ARCHITECTURAL PATTERNS TO FOLLOW

### 1. **Edge Function Structure** (from `crm-users-api`)

```typescript
// supabase/functions/products-api/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  // 1. Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. Parse URL and method
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4);

    // 3. Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: corsHeaders }
      );
    }

    // 4. Route to handlers
    switch (method) {
      case 'POST':
        return await handleCreate(req, supabase, user);
      case 'GET':
        return await handleGet(url, supabase, user, path);
      case 'PATCH':
        return await handleUpdate(req, supabase, user, path);
      case 'DELETE':
        return await handleDelete(supabase, user, path);
      default:
        return new Response(
          JSON.stringify({ error: 'Method not allowed' }),
          { status: 405, headers: corsHeaders }
        );
    }
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
```

### 2. **Response Pattern** (from `_shared/types.ts`)

```typescript
// Use standardized response format
export interface EdgeFunctionResponse<T = any> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, any>;
  };
  metadata: {
    processingTime: number;
    timestamp: string;
    version?: string;
    requestId?: string;
  };
}

// Helper functions
export function createSuccessResponse<T>(data: T, metadata = {}) { ... }
export function createErrorResponse(code, message, details, metadata) { ... }
export function createJSONResponse(body, status = 200) { ... }
```

### 3. **Authentication Pattern** (from `crm-users-api`)

```typescript
// 1. Get token from Authorization header
const token = authHeader.replace('Bearer ', '');

// 2. Verify user
const { data: { user }, error: userError } = await supabase.auth.getUser(token);

// 3. Check role/permissions
const { data: userProfile } = await supabase
  .from('user_profiles')
  .select('role_id')
  .eq('user_id', user.id)
  .single();

// 4. Verify access
if (!userProfile || !allowedRoles.includes(userProfile.role_id)) {
  return new Response(
    JSON.stringify({ error: 'Access denied' }),
    { status: 403, headers: corsHeaders }
  );
}
```

### 4. **Database Operations Pattern** (from `crm-contacts-api`)

```typescript
// CREATE
const { data, error } = await supabase
  .from('products')
  .insert({ name, description, ... })
  .select();

// READ
const { data, error } = await supabase
  .from('products')
  .select('*')
  .eq('id', productId)
  .single();

// UPDATE
const { data, error } = await supabase
  .from('products')
  .update({ name, description, ... })
  .eq('id', productId)
  .select();

// DELETE
const { data, error } = await supabase
  .from('products')
  .delete()
  .eq('id', productId);

// LIST with pagination
const { data, error, count } = await supabase
  .from('products')
  .select('*', { count: 'exact' })
  .range(offset, offset + limit - 1);
```

### 5. **Vector Search Pattern** (from `unified-material-search`)

```typescript
// Search embeddings using pgvector
const { data, error } = await supabase.rpc('search_products', {
  query_embedding: queryVector,
  similarity_threshold: 0.7,
  match_count: 10,
});
```

---

## 📁 FILE ORGANIZATION

```
supabase/functions/
├── _shared/
│   ├── cors.ts                    (existing)
│   ├── types.ts                   (existing)
│   ├── embedding-utils.ts         (existing)
│   └── unified-vector-search.ts   (existing)
│
├── products-api/                  (NEW)
│   └── index.ts
│
├── product-relationships-api/     (NEW)
│   └── index.ts
│
├── product-builder/               (NEW)
│   └── index.ts
│
├── product-embeddings/            (NEW)
│   └── index.ts
│
├── products-search/               (NEW)
│   └── index.ts
│
└── material-agent-orchestrator/   (UPDATE)
    └── index.ts
```

---

## 🔄 FRONTEND SERVICE INTEGRATION

### Frontend Services (TypeScript)

For frontend integration, create services in `src/services/`:

```typescript
// src/services/products/ProductService.ts
export class ProductService {
  async createProduct(data: CreateProductInput): Promise<Product> {
    return await supabaseApiService.call('products-api', {
      method: 'POST',
      data,
    });
  }

  async getProduct(id: string): Promise<Product> {
    return await supabaseApiService.call('products-api', {
      method: 'GET',
      id,
    });
  }

  // ... other methods
}
```

---

## 🚀 IMPLEMENTATION ORDER

1. **Phase 2.2**: `products-api` (CRUD operations)
2. **Phase 2.3**: `product-relationships-api` (Relationships)
3. **Phase 3.1**: `product-builder` (Product creation)
4. **Phase 3.2**: `product-embeddings` (Embeddings)
5. **Phase 4.1**: `products-search` (Search)
6. **Phase 5.1**: Update `material-agent-orchestrator` (Recommendations)

---

## ✅ CHECKLIST FOR EACH EDGE FUNCTION

- [ ] Create function directory in `supabase/functions/`
- [ ] Implement `index.ts` following existing patterns
- [ ] Add CORS headers from `_shared/cors.ts`
- [ ] Implement authentication (JWT token verification)
- [ ] Implement authorization (role-based access)
- [ ] Add error handling with standardized responses
- [ ] Use standardized response format from `_shared/types.ts`
- [ ] Add database operations with proper error handling
- [ ] Test with curl/Postman
- [ ] Deploy via GitHub Actions
- [ ] Update API documentation

---

## 📞 NEXT STEPS

1. **Review this plan** - Confirm Edge Functions needed
2. **Create database tables** - Phase 2.1 (before Edge Functions)
3. **Implement Edge Functions** - Follow order above
4. **Create frontend services** - Wrap Edge Functions
5. **Test end-to-end** - Verify all flows work

---

## 🎯 KEY PRINCIPLES

✅ **Follow existing patterns** - Use `crm-users-api`, `crm-contacts-api` as templates  
✅ **Use shared utilities** - Leverage `_shared/` for CORS, types, responses  
✅ **Standardize responses** - All functions return `EdgeFunctionResponse`  
✅ **Authenticate all endpoints** - Verify JWT token on every request  
✅ **Authorize properly** - Check user roles before operations  
✅ **Handle errors gracefully** - Return standardized error responses  
✅ **Document APIs** - Update `/docs/api-documentation.md`  

---

**Ready to implement! 🚀**

