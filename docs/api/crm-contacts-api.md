# CRM Contacts API

## Overview

The CRM Contacts API manages contact records in the CRM system.

**Edge Function:** `crm-contacts-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/crm-contacts-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Access Control

Only users with the following roles can access this API:
- **Admin**
- **Manager**
- **Factory**

## Endpoints

### 1. Create Contact

Create a new contact.

**Method:** `POST`  
**Path:** `/`

**Request:**
```typescript
{
  name: string,        // Required
  email?: string,
  phone?: string,
  company?: string,
  notes?: string
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    name: string,
    email: string | null,
    phone: string | null,
    company: string | null,
    notes: string | null,
    created_by: string,
    created_at: string,
    updated_at: string
  }
}
```

**Example:**
```typescript
const response = await fetch(`${API_BASE}/crm-contacts-api`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${session.access_token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    name: 'John Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    company: 'Acme Corp'
  })
});
```

### 2. List Contacts

Get a paginated list of contacts.

**Method:** `GET`  
**Path:** `/`

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 50)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**
```typescript
{
  data: Contact[],
  count: number
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/crm-contacts-api?limit=20&offset=0`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 3. Get Contact

Get a specific contact by ID with relationships.

**Method:** `GET`  
**Path:** `/{contactId}`

**Response:**
```typescript
{
  data: {
    id: string,
    name: string,
    email: string | null,
    phone: string | null,
    company: string | null,
    notes: string | null,
    created_by: string,
    created_at: string,
    updated_at: string,
    crm_contact_relationships: Array<{
      id: string,
      user_id: string,
      relationship_type: string,
      created_at: string
    }>
  }
}
```

### 4. Update Contact

Update an existing contact.

**Method:** `PATCH`  
**Path:** `/{contactId}`

**Request:**
```typescript
{
  name?: string,
  email?: string,
  phone?: string,
  company?: string,
  notes?: string
}
```

**Response:**
```typescript
{
  data: Contact  // Updated contact
}
```

### 5. Delete Contact

Delete a contact.

**Method:** `DELETE`  
**Path:** `/{contactId}`

**Response:**
```typescript
{
  message: 'Contact deleted successfully'
}
```

### 6. Link User to Contact

Link a user to a contact with a relationship type.

**Method:** `POST`  
**Path:** `/{contactId}/link-user`

**Request:**
```typescript
{
  userId: string,
  relationshipType?: string  // e.g., 'primary', 'secondary'
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    contact_id: string,
    user_id: string,
    relationship_type: string,
    created_at: string
  }
}
```

### 7. Unlink User from Contact

Remove a user-contact relationship.

**Method:** `DELETE`  
**Path:** `/{contactId}/unlink-user/{userId}`

**Response:**
```typescript
{
  message: 'User unlinked from contact successfully'
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
- `403` - Forbidden (insufficient permissions)
- `404` - Contact not found
- `400` - Bad request (validation error)
- `500` - Internal server error

