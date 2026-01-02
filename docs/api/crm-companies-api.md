# CRM Companies API

## Overview

The CRM Companies API manages company records in the CRM system.

**Edge Function:** `crm-companies-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/crm-companies-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Endpoints

### 1. Create Company

Create a new company record.

**Method:** `POST`  
**Path:** `/`

**Request:**
```typescript
{
  name: string,              // Required
  website?: string,
  industry?: string,
  employee_count?: number,
  annual_revenue?: number,
  email?: string,
  phone?: string,
  address?: string,
  city?: string,
  state?: string,
  postal_code?: string,
  country?: string,
  linkedin?: string,
  twitter?: string,
  facebook?: string,
  description?: string,
  notes?: string
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    name: string,
    website: string | null,
    industry: string | null,
    employee_count: number | null,
    annual_revenue: number | null,
    email: string | null,
    phone: string | null,
    address: string | null,
    city: string | null,
    state: string | null,
    postal_code: string | null,
    country: string | null,
    linkedin: string | null,
    twitter: string | null,
    facebook: string | null,
    description: string | null,
    notes: string | null,
    created_by: string,
    created_at: string,
    updated_at: string
  }
}
```

**Example:**
```typescript
const response = await fetch(`${API_BASE}/crm-companies-api`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'Acme Corporation',
    website: 'https://acme.com',
    industry: 'Technology',
    employee_count: 500,
    email: 'contact@acme.com',
    country: 'USA'
  })
});
```

### 2. List Companies

Get a paginated list of companies with optional search.

**Method:** `GET`  
**Path:** `/`

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Number of records to skip (default: 0)
- `search` (optional): Search term (searches name, email, website)

**Response:**
```typescript
{
  data: Company[],
  count: number
}
```

**Example:**
```typescript
// List all companies
const response = await fetch(
  `${API_BASE}/crm-companies-api?limit=20&offset=0`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);

// Search companies
const searchResponse = await fetch(
  `${API_BASE}/crm-companies-api?search=acme`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 3. Get Company

Get a specific company by ID with associated contacts.

**Method:** `GET`  
**Path:** `/{companyId}`

**Response:**
```typescript
{
  data: {
    id: string,
    name: string,
    // ... all company fields
    crm_company_contacts: Array<{
      id: string,
      contact_id: string,
      role: string,
      is_primary: boolean,
      created_at: string
    }>
  }
}
```

### 4. Update Company

Update an existing company.

**Method:** `PATCH`  
**Path:** `/{companyId}`

**Request:**
```typescript
{
  name?: string,
  website?: string,
  industry?: string,
  employee_count?: number,
  annual_revenue?: number,
  // ... any other company fields
}
```

**Response:**
```typescript
{
  data: Company  // Updated company
}
```

### 5. Delete Company

Delete a company.

**Method:** `DELETE`  
**Path:** `/{companyId}`

**Response:**
```typescript
{
  message: 'Company deleted successfully'
}
```

### 6. Link Contact to Company

Associate a contact with a company.

**Method:** `POST`  
**Path:** `/{companyId}/contacts`

**Request:**
```typescript
{
  contactId: string,
  role?: string,          // e.g., 'CEO', 'Manager', 'Sales Rep'
  isPrimary?: boolean     // Mark as primary contact
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    company_id: string,
    contact_id: string,
    role: string,
    is_primary: boolean,
    created_at: string
  }
}
```

### 7. Unlink Contact from Company

Remove a contact-company association.

**Method:** `DELETE`  
**Path:** `/{companyId}/contacts/{contactId}`

**Response:**
```typescript
{
  message: 'Contact unlinked from company successfully'
}
```

## Error Handling

All errors return a standard format:

```typescript
{
  error: string  // Error message
}
```

**Common Error Codes:**
- `401` - Unauthorized (missing or invalid token)
- `404` - Company not found
- `400` - Bad request (validation error, e.g., missing company name)
- `500` - Internal server error

