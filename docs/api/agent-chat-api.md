# Agent Chat API

## Overview

The Agent Chat API provides a multi-agent AI system powered by LangChain.js and Claude (Anthropic). It supports specialized agents for different tasks with role-based access control.

**Edge Function:** `agent-chat`  
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-chat`

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
  agentType: string,           // Required - Agent to use (see available agents below)
  message: string,             // Required - User message
  workspaceId?: string,        // Optional workspace context
  conversationId?: string,     // Optional conversation ID for context
  stream?: boolean,            // Optional - Enable streaming (default: false)
  metadata?: {
    sessionId?: string,
    userId?: string,
    [key: string]: any
  }
}
```

**Response (Non-streaming):**
```typescript
{
  success: true,
  response: string,            // Agent's response
  agentType: string,
  conversationId: string,
  metadata: {
    model: string,
    tokensUsed: number,
    processingTime: number
  }
}
```

**Response (Streaming):**
Server-Sent Events (SSE) stream with chunks:
```typescript
data: {"type": "chunk", "content": "partial response..."}
data: {"type": "done", "metadata": {...}}
```

## Available Agents

### 1. Search Agent

Helps users find materials using RAG search and semantic search.

**Agent Type:** `search`  
**Access:** Member, Admin, Owner  
**Tools:**
- Material search (RAG)
- Semantic search
- Image search

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('agent-chat', {
  body: {
    agentType: 'search',
    message: 'Find me sustainable wood materials for flooring',
    workspaceId: 'workspace-123'
  }
});
```

### 2. Interior Designer Agent

AI-powered interior design with spatial analysis and material matching.

**Agent Type:** `interior-designer`  
**Access:** Viewer, Member, Admin, Owner  
**Tools:**
- Material search
- Image analysis
- Spaceformer spatial analysis
- 3D generation (async)

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('agent-chat', {
  body: {
    agentType: 'interior-designer',
    message: 'Design a modern minimalist living room with natural materials',
    workspaceId: 'workspace-123'
  }
});
```

**Note:** The `generate_3d` tool triggers async generation and returns a job ID. The frontend should poll the database for real-time updates.

### 3. Product Agent

Provides product information and recommendations.

**Agent Type:** `product`  
**Access:** Member, Admin, Owner  
**Tools:**
- Product search
- Product details
- Product recommendations

**Example:**
```typescript
const { data, error } = await supabase.functions.invoke('agent-chat', {
  body: {
    agentType: 'product',
    message: 'Tell me about eco-friendly insulation materials',
    workspaceId: 'workspace-123'
  }
});
```

## Agent Configuration

Agents can be configured with custom system prompts stored in the `prompts` table:

- **Table:** `prompts`
- **Filters:**
  - `prompt_type = 'agent'`
  - `category = <agentType>`
  - `is_active = true`
  - `status = 'active'`

If no custom prompt is found, the agent uses a default prompt.

## Streaming Responses

Enable streaming for real-time responses:

```typescript
const response = await fetch(
  'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-chat',
  {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${session.access_token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      agentType: 'search',
      message: 'Find sustainable materials',
      stream: true
    })
  }
);

const reader = response.body.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  
  const chunk = decoder.decode(value);
  const lines = chunk.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const data = JSON.parse(line.slice(6));
      console.log(data);
    }
  }
}
```

## Tool Integration

### Material Search Tool

Searches for materials using the MIVAA Python API.

**Parameters:**
- `query` (string): Search query
- `limit` (number): Max results (default: 10)
- `filters` (object): Optional filters

### Image Analysis Tool

Analyzes images using Spaceformer or other vision models.

**Parameters:**
- `imageUrl` (string): URL of image to analyze
- `analysisType` (string): Type of analysis

### 3D Generation Tool

Creates interior design generations (async).

**Parameters:**
- `prompt` (string): Design description
- `roomType` (string): Type of room
- `style` (string): Design style
- `referenceImageUrl` (string): Optional reference image
- `models` (array): Optional list of models to use

**Returns:** Job ID for tracking generation progress

## Error Handling

All errors return a standard format:

```typescript
{
  success: false,
  error: string,
  code?: string
}
```

**Common Error Codes:**
- `401` - Unauthorized
- `403` - Forbidden (insufficient role permissions)
- `400` - Bad request (missing agentType or message)
- `500` - Internal server error

## Rate Limiting

- **Default:** 60 requests per minute per user
- **Streaming:** 30 requests per minute per user

## Related Documentation

- [Agent System Documentation](../agent-system.md)
- [Interior Designer Agent Guide](../interior-designer-agent-user-guide.md)
- [AI Models Architecture](../ai-models-architecture.md)

