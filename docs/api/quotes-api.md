# Quotes API

## Overview

The Quotes API manages quote requests and proposals in the system.

**Edge Function:** `quotes-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/quotes-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Endpoints

### 1. Create Quote Request

Create a new quote request from a quote.

**Method:** `POST`  
**Path:** `/quote-requests`

**Request:**
```typescript
{
  quote_id: string,        // Required - ID of the quote
  workspace_id?: string,   // Optional workspace ID
  notes?: string          // Optional notes for the quote request
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    user_id: string,
    quote_id: string,
    workspace_id: string | null,
    status: 'pending',
    items_count: number,
    notes: string | null,
    created_at: string,
    updated_at: string
  }
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/quotes-api/quote-requests`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      quote_id: 'quote-123',
      workspace_id: 'workspace-456',
      notes: 'Urgent request for Q1 project'
    })
  }
);
```

### 2. List Quote Requests

Get all quote requests for the authenticated user.

**Method:** `GET`  
**Path:** `/quote-requests`

**Response:**
```typescript
{
  data: Array<{
    id: string,
    user_id: string,
    quote_id: string,
    workspace_id: string | null,
    status: 'pending' | 'updated' | 'approved' | 'rejected',
    items_count: number,
    notes: string | null,
    created_at: string,
    updated_at: string
  }>
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/quotes-api/quote-requests`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 3. Get Quote Request

Get a specific quote request by ID.

**Method:** `GET`  
**Path:** `/quote-requests/{quoteRequestId}`

**Response:**
```typescript
{
  data: {
    id: string,
    user_id: string,
    quote_id: string,
    workspace_id: string | null,
    status: 'pending' | 'updated' | 'approved' | 'rejected',
    items_count: number,
    notes: string | null,
    created_at: string,
    updated_at: string
  }
}
```

### 4. Update Quote Request Status

Update the status of a quote request.

**Method:** `PATCH`  
**Path:** `/quote-requests/{quoteRequestId}`

**Request:**
```typescript
{
  status: 'pending' | 'updated' | 'approved' | 'rejected'
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    status: string,
    updated_at: string
    // ... other fields
  }
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/quotes-api/quote-requests/${quoteRequestId}`,
  {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      status: 'approved'
    })
  }
);
```

### 5. List Proposals

Get all proposals for the user's quote requests.

**Method:** `GET`  
**Path:** `/proposals`

**Response:**
```typescript
{
  data: Array<{
    id: string,
    quote_request_id: string,
    supplier_id: string,
    total_price: number,
    currency: string,
    status: string,
    valid_until: string,
    notes: string | null,
    created_at: string,
    updated_at: string,
    quote_requests: {
      id: string,
      quote_id: string,
      status: string,
      created_at: string
    }
  }>
}
```

### 6. Get Proposal

Get a specific proposal by ID.

**Method:** `GET`  
**Path:** `/proposals/{proposalId}`

**Response:**
```typescript
{
  data: {
    id: string,
    quote_request_id: string,
    supplier_id: string,
    total_price: number,
    currency: string,
    status: string,
    valid_until: string,
    notes: string | null,
    items: Array<{
      id: string,
      material_id: string,
      quantity: number,
      unit_price: number,
      total_price: number
    }>,
    created_at: string,
    updated_at: string
  }
}
```

## Quote Request Status Flow

```
pending → updated → approved
                 ↘ rejected
```

- **pending**: Initial state when quote request is created
- **updated**: Supplier has updated the quote
- **approved**: User has approved the quote
- **rejected**: User has rejected the quote

## Quote Item Pricing Fields (2026-04)

Every row in `quote_items` carries optional audit metadata that tells you
where its price came from. These fields are written by the admin "Get price"
drawer (product detail page + quote builder) and are **never** written by
customer-facing flows.

| Column | Type | Meaning |
|--------|------|---------|
| `unit_price` | numeric | List / catalog price per unit |
| `discounted_price` | numeric | Negotiated price per unit (optional) |
| `price_source` | text | Provenance tag — see values below |
| `price_lookup_call_id` | uuid | FK → `agent_tool_call_logs.id` |

**`price_source` values:**
- `manual` — admin typed the number by hand
- `catalog` — inherited from the product catalog row
- `kb:ai:<agent_tool_call_logs.id>` — composed by the `price_lookup` agent
  tool in AI mode. Full reasoning chain recoverable via the call id.
- `kb:quick:<kb_docs.id>` — picked directly from a KB doc in quick-pick
  mode (no LLM). The document id tells you which price doc was sourced.
- `product_price:<product_prices.id>` — inherited from a previously
  committed `product_prices` row.

**`price_lookup_call_id`** is populated only when the price was produced by
the AI mode of the price lookup tool. When set, you can:

```sql
-- Full audit trail for a quote line
SELECT
  qi.unit_price, qi.discounted_price, qi.price_source,
  atcl.created_at     AS lookup_ran_at,
  atcl.tool_args,     -- the original search parameters
  atcl.result_summary -- match count, hints, timing
FROM quote_items qi
LEFT JOIN agent_tool_call_logs atcl ON atcl.id = qi.price_lookup_call_id
WHERE qi.id = '<item_id>';
```

### Updating a quote item with pricing provenance

The Supabase `quote_items` table accepts these fields on `PATCH` / UPDATE.
The frontend `QuotesService.updateItem()` signature accepts them directly:

```typescript
await quotesService.updateItem(itemId, {
  unit_price: 62.00,
  discounted_price: null,
  price_source: 'kb:ai:f4a8...-...',
  price_lookup_call_id: 'f4a8...-...',
});
```

Third-party callers hitting Supabase REST / PostgREST should pass the same
column names. RLS requires admin/owner role on the workspace owning the quote.

## product_prices table (2026-04)

When an admin confirms a price from the product detail page, a row is
upserted to `product_prices` keyed by `(workspace_id, product_id)`. This is
the fast-lookup cache — subsequent "Get price" clicks on the same product
return the cached row instantly instead of re-running the agent.

| Column | Type | Notes |
|--------|------|-------|
| `id` | uuid | PK |
| `workspace_id` | uuid | FK → workspaces; part of unique constraint |
| `product_id` | uuid | FK → products; part of unique constraint |
| `list_price` | numeric(12,2) | Catalog / MSRP |
| `discount_price` | numeric(12,2) | Negotiated price |
| `discount_percent` | numeric(5,2) | Stored percentage |
| `currency` | text | Default `EUR` |
| `unit` | text | e.g. `m²`, `piece`, `box` |
| `moq` | integer | Minimum order quantity |
| `lead_time_days` | integer | Delivery lead time |
| `source_kb_doc_ids` | jsonb | Array of `kb_docs.id` values |
| `source_snippet` | text | First matching chunk, for audit |
| `price_lookup_call_id` | uuid | FK → `agent_tool_call_logs.id` |
| `confirmed_by` | uuid | FK → user_profiles |
| `confirmed_at` | timestamptz | When the admin clicked "Use this price" |
| `valid_until` | date | Optional hard expiry |
| `notes` | text | Admin free-text |

**RLS:** all policies require `admin` or `owner` role in the workspace.
Regular users cannot read this table.

## Error Handling

All errors return a standard format:

```typescript
{
  error: string  // Error message
}
```

**Common Error Codes:**
- `401` - Unauthorized (missing or invalid token)
- `404` - Quote request or proposal not found
- `400` - Bad request (missing quote_id, invalid status)
- `500` - Internal server error

