# CRM Users API

## Overview

The CRM Users API manages user accounts and profiles. This is an admin-only API.

**Edge Function:** `crm-users-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/crm-users-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Access Control

⚠️ **Admin Only** - Only users with the **Admin** role can access this API.

## Endpoints

### 1. List All Users

Get a paginated list of all users with their profiles and credits.

**Method:** `GET`  
**Path:** `/`

**Query Parameters:**
- `limit` (optional): Number of records to return (default: 1000)
- `offset` (optional): Number of records to skip (default: 0)

**Response:**
```typescript
{
  data: Array<{
    id: string,                    // Profile ID
    user_id: string,               // Auth user ID
    email: string,
    role_id: string,
    subscription_tier: string,     // 'free', 'pro', 'enterprise'
    status: string,                // 'active', 'inactive', 'suspended'
    credits: number,               // Current credit balance
    created_at: string,
    roles: {
      id: string,
      name: string,
      level: number
    }
  }>,
  count: number
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/crm-users-api?limit=100&offset=0`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 2. Get User Details

Get detailed information about a specific user.

**Method:** `GET`  
**Path:** `/{userId}`

**Response:**
```typescript
{
  data: {
    id: string,
    user_id: string,
    role_id: string,
    subscription_tier: string,
    status: string,
    created_at: string,
    updated_at: string,
    roles: {
      name: string,
      level: number,
      description: string
    }
  }
}
```

### 3. Update User

Update user profile information.

**Method:** `PATCH`  
**Path:** `/{userId}`

**Request:**
```typescript
{
  role_id?: string,
  subscription_tier?: 'free' | 'pro' | 'enterprise',
  status?: 'active' | 'inactive' | 'suspended'
}
```

**Response:**
```typescript
{
  data: {
    id: string,
    user_id: string,
    role_id: string,
    subscription_tier: string,
    status: string,
    updated_at: string
  }
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/crm-users-api/${userId}`,
  {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      subscription_tier: 'pro',
      status: 'active'
    })
  }
);
```

### 4. Delete User

Delete a user account (soft delete - marks as inactive).

**Method:** `DELETE`  
**Path:** `/{userId}`

**Response:**
```typescript
{
  message: 'User deleted successfully'
}
```

⚠️ **Warning:** This operation cannot be undone. The user will be marked as inactive and will lose access to the platform.

## User Roles

The system supports the following roles:

| Role | Level | Description |
|------|-------|-------------|
| **Admin** | 100 | Full system access |
| **Manager** | 75 | CRM and user management |
| **Factory** | 50 | Factory operations |
| **Member** | 25 | Standard user access |
| **Viewer** | 10 | Read-only access |

## Subscription Tiers

| Tier | Description |
|------|-------------|
| **free** | Free tier with limited features |
| **pro** | Professional tier with advanced features |
| **enterprise** | Enterprise tier with full features |

## Error Handling

All errors return a standard format:

```typescript
{
  error: string  // Error message
}
```

**Common Error Codes:**
- `401` - Unauthorized (missing or invalid token)
- `403` - Forbidden (admin access required)
- `404` - User not found
- `400` - Bad request (validation error)
- `500` - Internal server error

## Related Documentation

- [User Management System](../user-management.md)
- [Role-Based Access Control](../rbac.md)

