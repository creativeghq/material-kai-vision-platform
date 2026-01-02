# Scrape Session Manager API

## Overview

The Scrape Session Manager API controls web scraping sessions, allowing users to start, pause, resume, and stop scraping operations.

**Edge Function:** `scrape-session-manager`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/scrape-session-manager`

## Authentication

All requests require authentication via Supabase Auth:

```typescript
Authorization: Bearer <supabase_access_token>
```

## Request Format

**Method:** `POST`  
**Path:** `/`

**Request:**
```typescript
{
  sessionId: string,                    // Required - Scraping session ID
  action: 'start' | 'pause' | 'resume' | 'stop'  // Required - Action to perform
}
```

## Actions

### 1. Start Session

Start a new scraping session or resume a paused one.

**Action:** `start`

**Request:**
```typescript
{
  sessionId: 'session-123',
  action: 'start'
}
```

**Response:**
```typescript
{
  success: true,
  message: 'Scraping session started',
  sessionId: 'session-123',
  status: 'processing',
  metadata: {
    startedAt: string,
    totalPages: number,
    processedPages: number
  }
}
```

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('scrape-session-manager', {
  body: {
    sessionId: 'session-123',
    action: 'start'
  }
});
```

### 2. Pause Session

Pause an active scraping session.

**Action:** `pause`

**Request:**
```typescript
{
  sessionId: 'session-123',
  action: 'pause'
}
```

**Response:**
```typescript
{
  success: true,
  message: 'Scraping session paused',
  sessionId: 'session-123',
  status: 'paused',
  metadata: {
    pausedAt: string,
    processedPages: number,
    remainingPages: number
  }
}
```

### 3. Resume Session

Resume a paused scraping session.

**Action:** `resume`

**Request:**
```typescript
{
  sessionId: 'session-123',
  action: 'resume'
}
```

**Response:**
```typescript
{
  success: true,
  message: 'Scraping session resumed',
  sessionId: 'session-123',
  status: 'processing',
  metadata: {
    resumedAt: string,
    processedPages: number,
    remainingPages: number
  }
}
```

### 4. Stop Session

Stop and terminate a scraping session.

**Action:** `stop`

**Request:**
```typescript
{
  sessionId: 'session-123',
  action: 'stop'
}
```

**Response:**
```typescript
{
  success: true,
  message: 'Scraping session stopped',
  sessionId: 'session-123',
  status: 'stopped',
  metadata: {
    stoppedAt: string,
    totalPages: number,
    processedPages: number,
    successfulPages: number,
    failedPages: number
  }
}
```

## Session Status Flow

```
idle → processing → completed
         ↓     ↑
       paused  (resume)
         ↓
      stopped
```

## Session Statuses

| Status | Description |
|--------|-------------|
| `idle` | Session created but not started |
| `processing` | Actively scraping pages |
| `paused` | Temporarily paused by user |
| `stopped` | Manually stopped by user |
| `completed` | All pages scraped successfully |
| `failed` | Session failed with errors |

## Error Handling

```typescript
{
  success: false,
  error: string,
  code?: string
}
```

**Common Errors:**
- `400` - Missing required parameters (sessionId, action)
- `401` - Unauthorized (missing or invalid token)
- `404` - Session not found
- `409` - Invalid state transition (e.g., pausing a completed session)
- `500` - Internal server error

## Use Cases

### Starting a Scraping Session
```typescript
// Create session first (via scraping UI)
const session = await createScrapingSession({
  url: 'https://example.com/products',
  workspace_id: 'workspace-123'
});

// Start scraping
await supabase.functions.invoke('scrape-session-manager', {
  body: {
    sessionId: session.id,
    action: 'start'
  }
});
```

### Pausing and Resuming
```typescript
// Pause for rate limiting or user request
await supabase.functions.invoke('scrape-session-manager', {
  body: {
    sessionId: 'session-123',
    action: 'pause'
  }
});

// Resume later
await supabase.functions.invoke('scrape-session-manager', {
  body: {
    sessionId: 'session-123',
    action: 'resume'
  }
});
```

## Related Documentation

- [Web Scraping Integration](../web-scraping-integration.md)
- [Scraping Workflow Guide](../scraping-workflow-guide.md)
- [Scraping Job Integration](../scraping-job-integration.md)

