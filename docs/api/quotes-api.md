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

