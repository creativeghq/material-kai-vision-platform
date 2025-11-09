# Agent Chat - Mastra Multi-Agent System

Supabase Edge Function for AI agent orchestration using Mastra framework.

## Overview

This Edge Function provides a server-side execution environment for Mastra agents, enabling:
- Multi-agent orchestration with intelligent routing
- Role-based access control (RBAC)
- Integration with MIVAA Python API for search
- Secure API key management (server-side only)

## Architecture

```
Frontend (Browser)
  ↓ HTTP Request
Supabase Edge Function (agent-chat)
  ↓ Mastra Agent Execution
  ↓ API Calls
MIVAA Python API (v1api.materialshub.gr)
```

## Agents

### Currently Implemented

1. **Routing Agent** - Routes queries to appropriate specialized agent
2. **Search Agent** - Material search and discovery (PUBLIC - member role)

### Coming Soon

3. **Research Agent** - Deep research and analysis (ADMIN)
4. **Analytics Agent** - Data analysis and insights (ADMIN)
5. **Business Agent** - Business intelligence (ADMIN)
6. **Product Agent** - Product management (ADMIN)
7. **Admin Agent** - System administration (OWNER)

## Environment Variables

Required environment variables in Supabase:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ANTHROPIC_API_KEY=your-anthropic-api-key
MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
```

## Deployment

### 1. Install Supabase CLI

```bash
npm install -g supabase
```

### 2. Login to Supabase

```bash
supabase login
```

### 3. Link to your project

```bash
supabase link --project-ref bgbavxtjlbvgplozizxu
```

### 4. Set environment variables

```bash
supabase secrets set ANTHROPIC_API_KEY=your-key-here
supabase secrets set MIVAA_GATEWAY_URL=https://v1api.materialshub.gr
```

### 5. Deploy the function

```bash
supabase functions deploy agent-chat
```

### 6. Verify deployment

```bash
curl -i --location --request POST 'https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-chat' \
  --header 'Authorization: Bearer YOUR_ANON_KEY' \
  --header 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"Find sustainable concrete materials"}],"agentId":"search"}'
```

## API Usage

### Request Format

```typescript
POST /functions/v1/agent-chat

Headers:
  Authorization: Bearer <user-jwt-token>
  Content-Type: application/json

Body:
{
  "messages": [
    {
      "role": "user",
      "content": "Find sustainable concrete materials"
    }
  ],
  "agentId": "search",  // Optional, defaults to "search"
  "model": "claude-sonnet-4",  // Optional
  "images": []  // Optional, for multimodal input
}
```

### Response Format

```typescript
{
  "success": true,
  "text": "Here are the sustainable concrete materials I found...",
  "agentId": "routing",
  "model": "claude-sonnet-4",
  "timestamp": "2025-11-09T18:30:00.000Z"
}
```

### Error Response

```typescript
{
  "success": false,
  "error": "Error message here"
}
```

## Frontend Integration

The AgentHub UI component calls this Edge Function:

```typescript
// src/components/AI/AgentHub.tsx
const { data, error } = await supabase.functions.invoke('agent-chat', {
  body: {
    messages: messages,
    agentId: selectedAgent,
    model: selectedModel,
    images: attachedImages,
  },
});
```

## RBAC (Role-Based Access Control)

Agents are filtered by user role:

- **viewer** - Read-only access (no agents)
- **member** - Standard user access + Search Agent
- **admin** - Full access to all agents (except Admin Agent)
- **owner** - Full access to all agents including Admin Agent

## Search Strategies

The Search Agent supports 7 search strategies via MIVAA API:

1. `semantic` - Semantic search using text embeddings
2. `visual` - Visual search using CLIP embeddings
3. `multi_vector` - Multi-vector search combining all embeddings
4. `hybrid` - Hybrid search combining semantic and keyword
5. `material` - Material property-based search
6. `keyword` - Keyword/exact match search
7. `all` - ALL 6 strategies in parallel (3-4x faster!)

## Development

### Local Testing

```bash
# Start Supabase locally
supabase start

# Serve function locally
supabase functions serve agent-chat --env-file ./supabase/.env.local

# Test locally
curl -i --location --request POST 'http://localhost:54321/functions/v1/agent-chat' \
  --header 'Authorization: Bearer eyJhbGc...' \
  --header 'Content-Type: application/json' \
  --data '{"messages":[{"role":"user","content":"test"}]}'
```

### Logs

View function logs:

```bash
supabase functions logs agent-chat
```

## Next Steps

1. **Add remaining agents** (Research, Analytics, Business, Product, Admin)
2. **Implement streaming responses** for real-time chat
3. **Add conversation memory** using Mastra's Memory API
4. **Migrate CrewAI 3D generation** to Mastra workflow
5. **Add agent performance metrics** and monitoring

## Related Documentation

- [Agent System Architecture](../../../docs/agent-system-architecture.md)
- [Mastra Documentation](https://github.com/mastra-ai/mastra)
- [Supabase Edge Functions](https://supabase.com/docs/guides/functions)

