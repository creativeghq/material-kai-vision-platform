# Edge Functions Implementation Guide

**Quick Reference for Building Supabase Edge Functions**

---

## 🎯 WHICH EDGE FUNCTIONS TO BUILD

| Phase | Sprint | Function | Purpose | Pattern |
|-------|--------|----------|---------|---------|
| 2 | 2.2 | `products-api` | CRUD operations | crm-users-api |
| 2 | 2.3 | `product-relationships-api` | Link chunks | crm-contacts-api |
| 3 | 3.1 | `product-builder` | Extract properties | extract-material-knowledge |
| 3 | 3.2 | `product-embeddings` | Generate embeddings | document-vector-search |
| 4 | 4.1 | `products-search` | Search products | unified-material-search |
| 5 | 5.1 | `material-agent-orchestrator` | **UPDATE** existing | existing |

---

## 📁 TEMPLATE: BASIC EDGE FUNCTION

```typescript
// supabase/functions/products-api/index.ts
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.38.4';
import { corsHeaders } from '../_shared/cors.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

Deno.serve(async (req) => {
  // 1. CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // 2. PARSE REQUEST
    const url = new URL(req.url);
    const method = req.method;
    const path = url.pathname.split('/').slice(4);

    // 3. AUTHENTICATE
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

    // 4. ROUTE
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
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});

// HANDLERS
async function handleCreate(req: Request, supabase: any, user: any) {
  const body = await req.json();
  const { name, description } = body;

  if (!name) {
    return new Response(
      JSON.stringify({ error: 'Name is required' }),
      { status: 400, headers: corsHeaders }
    );
  }

  const { data, error } = await supabase
    .from('products')
    .insert({ name, description, created_by: user.id })
    .select();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({ data: data?.[0] }),
    { status: 201, headers: corsHeaders }
  );
}

async function handleGet(url: URL, supabase: any, user: any, path: string[]) {
  if (path.length === 0) {
    // List all
    const limit = parseInt(url.searchParams.get('limit') || '50');
    const offset = parseInt(url.searchParams.get('offset') || '0');

    const { data, error, count } = await supabase
      .from('products')
      .select('*', { count: 'exact' })
      .range(offset, offset + limit - 1);

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 400, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ data, count }),
      { status: 200, headers: corsHeaders }
    );
  } else {
    // Get one
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', path[0])
      .single();

    if (error) {
      return new Response(
        JSON.stringify({ error: 'Not found' }),
        { status: 404, headers: corsHeaders }
      );
    }

    return new Response(
      JSON.stringify({ data }),
      { status: 200, headers: corsHeaders }
    );
  }
}

async function handleUpdate(req: Request, supabase: any, user: any, path: string[]) {
  const body = await req.json();
  const { data, error } = await supabase
    .from('products')
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq('id', path[0])
    .select();

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({ data: data?.[0] }),
    { status: 200, headers: corsHeaders }
  );
}

async function handleDelete(supabase: any, user: any, path: string[]) {
  const { error } = await supabase
    .from('products')
    .delete()
    .eq('id', path[0]);

  if (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: corsHeaders }
    );
  }

  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: corsHeaders }
  );
}
```

---

## 🔑 KEY PATTERNS

### Authentication
```typescript
const token = authHeader.replace('Bearer ', '');
const { data: { user } } = await supabase.auth.getUser(token);
```

### Authorization (Role Check)
```typescript
const { data: userProfile } = await supabase
  .from('user_profiles')
  .select('role_id')
  .eq('user_id', user.id)
  .single();

const { data: allowedRoles } = await supabase
  .from('roles')
  .select('id')
  .in('name', ['admin', 'manager']);

if (!allowedRoles?.map(r => r.id).includes(userProfile.role_id)) {
  return new Response(
    JSON.stringify({ error: 'Access denied' }),
    { status: 403, headers: corsHeaders }
  );
}
```

### Database Insert
```typescript
const { data, error } = await supabase
  .from('products')
  .insert({ name, description, created_by: user.id })
  .select();
```

### Database Query
```typescript
const { data, error } = await supabase
  .from('products')
  .select('*')
  .eq('id', productId)
  .single();
```

### Database Update
```typescript
const { data, error } = await supabase
  .from('products')
  .update({ name, description })
  .eq('id', productId)
  .select();
```

### Database Delete
```typescript
const { error } = await supabase
  .from('products')
  .delete()
  .eq('id', productId);
```

### Pagination
```typescript
const limit = parseInt(url.searchParams.get('limit') || '50');
const offset = parseInt(url.searchParams.get('offset') || '0');

const { data, count } = await supabase
  .from('products')
  .select('*', { count: 'exact' })
  .range(offset, offset + limit - 1);
```

---

## 📋 CHECKLIST FOR EACH FUNCTION

- [ ] Create directory: `supabase/functions/function-name/`
- [ ] Create `index.ts` file
- [ ] Import Supabase client and CORS headers
- [ ] Implement `Deno.serve()` handler
- [ ] Handle CORS preflight (OPTIONS)
- [ ] Parse request (URL, method, body)
- [ ] Authenticate user (JWT token)
- [ ] Authorize user (role check if needed)
- [ ] Route to handlers (POST/GET/PATCH/DELETE)
- [ ] Implement each handler
- [ ] Return standardized responses
- [ ] Handle errors gracefully
- [ ] Test with curl/Postman
- [ ] Deploy via GitHub Actions
- [ ] Update API documentation

---

## 🧪 TESTING LOCALLY

```bash
# Start Supabase locally
supabase start

# Test function
curl -X POST http://localhost:54321/functions/v1/products-api \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "description": "Test"}'
```

---

## 🚀 DEPLOYMENT

Functions deploy automatically via GitHub Actions when you push to `supabase/functions/`.

---

## 📚 REFERENCE FUNCTIONS

Study these existing functions as templates:

1. **CRUD Operations**: `supabase/functions/crm-users-api/index.ts`
2. **Relationships**: `supabase/functions/crm-contacts-api/index.ts`
3. **Data Extraction**: `supabase/functions/extract-material-knowledge/index.ts`
4. **Vector Search**: `supabase/functions/unified-material-search/index.ts`
5. **Shared Utilities**: `supabase/functions/_shared/`

---

## 🎯 IMPLEMENTATION ORDER

1. **Phase 2.2**: `products-api` (simplest, CRUD only)
2. **Phase 2.3**: `product-relationships-api` (similar to products-api)
3. **Phase 3.1**: `product-builder` (more complex, data extraction)
4. **Phase 3.2**: `product-embeddings` (vector operations)
5. **Phase 4.1**: `products-search` (most complex, vector search)
6. **Phase 5.1**: Update `material-agent-orchestrator` (integration)

---

## 💡 TIPS

✅ Start simple - CRUD functions first  
✅ Copy existing patterns - Don't reinvent  
✅ Test locally - Use Supabase CLI  
✅ Use TypeScript - Better type safety  
✅ Handle errors - Return meaningful messages  
✅ Log everything - For debugging  
✅ Document APIs - Update `/docs/api-documentation.md`  

---

**Ready to build! 🚀**

