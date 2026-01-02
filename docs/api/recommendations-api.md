# Recommendations API

## Overview

The Recommendations API provides collaborative filtering recommendations and tracks user interactions with materials.

**Edge Function:** `recommendations-api`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/recommendations-api`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Endpoints

### 1. Track Interaction

Track a user interaction with a material.

**Method:** `POST`  
**Path:** `/track-interaction`

**Request:**
```typescript
{
  workspace_id: string,                    // Required
  material_id: string,                     // Required
  interaction_type: string,                // Required - see valid types below
  interaction_value?: number,              // Optional (default: 1.0)
  session_id?: string,                     // Optional session identifier
  metadata?: Record<string, any>           // Optional metadata
}
```

**Valid Interaction Types:**
- `view` - User viewed the material
- `click` - User clicked on the material
- `save` - User saved/bookmarked the material
- `purchase` - User purchased the material
- `rate` - User rated the material
- `add_to_quote` - User added material to quote
- `share` - User shared the material

**Response:**
```typescript
{
  data: {
    id: string,
    user_id: string,
    workspace_id: string,
    material_id: string,
    interaction_type: string,
    interaction_value: number,
    session_id: string | null,
    metadata: object,
    created_at: string
  },
  message: 'Interaction tracked successfully'
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/recommendations-api/track-interaction`,
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      workspace_id: 'workspace-123',
      material_id: 'material-456',
      interaction_type: 'view',
      interaction_value: 1.0,
      session_id: 'session-789'
    })
  }
);
```

### 2. Get Recommendations for User

Get personalized recommendations for the current user.

**Method:** `GET`  
**Path:** `/for-user`

**Query Parameters:**
- `workspace_id` (required): Workspace ID
- `limit` (optional): Number of recommendations (default: 20)
- `algorithm` (optional): Algorithm to use (default: 'user_user')
  - `user_user` - User-based collaborative filtering
  - `item_item` - Item-based collaborative filtering

**Response:**
```typescript
{
  data: Array<{
    material_id: string,
    score: number,
    confidence: number,
    algorithm: string,
    metadata: object
  }>,
  cached: boolean
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/recommendations-api/for-user?workspace_id=workspace-123&limit=10`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 3. Get Similar Materials

Get materials similar to a specific material.

**Method:** `GET`  
**Path:** `/similar-materials/{materialId}`

**Query Parameters:**
- `workspace_id` (required): Workspace ID
- `limit` (optional): Number of similar materials (default: 10)

**Response:**
```typescript
{
  data: Array<{
    material_id: string,
    similarity_score: number,
    common_users: number
  }>,
  message?: string  // If insufficient data
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/recommendations-api/similar-materials/material-456?workspace_id=workspace-123&limit=5`,
  {
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

### 4. Get Recommendation Analytics

Get analytics about recommendations for a workspace.

**Method:** `GET`  
**Path:** `/analytics/{workspaceId}`

**Response:**
```typescript
{
  data: {
    total_interactions: number,
    unique_users: number,
    unique_materials: number,
    interaction_breakdown: {
      view: number,
      click: number,
      save: number,
      purchase: number,
      rate: number,
      add_to_quote: number,
      share: number
    },
    top_materials: Array<{
      material_id: string,
      interaction_count: number
    }>,
    active_users: Array<{
      user_id: string,
      interaction_count: number
    }>
  }
}
```

### 5. Invalidate Cache

Invalidate the recommendation cache for a workspace.

**Method:** `DELETE`  
**Path:** `/cache`

**Query Parameters:**
- `workspace_id` (required): Workspace ID

**Response:**
```typescript
{
  message: 'Cache invalidated successfully',
  deleted_count: number
}
```

**Example:**
```typescript
const response = await fetch(
  `${API_BASE}/recommendations-api/cache?workspace_id=workspace-123`,
  {
    method: 'DELETE',
    headers: {
      'Authorization': `Bearer ${session.access_token}`
    }
  }
);
```

## Interaction Value Guidelines

The `interaction_value` parameter allows you to weight different interactions:

| Interaction Type | Suggested Value | Description |
|-----------------|-----------------|-------------|
| `view` | 1.0 | Basic view/impression |
| `click` | 2.0 | User clicked for details |
| `save` | 3.0 | User bookmarked |
| `add_to_quote` | 4.0 | Strong purchase intent |
| `rate` | 1.0-5.0 | User rating (1-5 stars) |
| `purchase` | 5.0 | Actual purchase |
| `share` | 3.0 | User shared with others |

## Error Handling

All errors return a standard format:

```typescript
{
  error: string  // Error message
}
```

**Common Error Codes:**
- `401` - Unauthorized
- `400` - Bad request (missing required fields, invalid interaction type)
- `500` - Internal server error

## Related Documentation

- [Collaborative Filtering System](../collaborative-filtering-recommendations.md)

