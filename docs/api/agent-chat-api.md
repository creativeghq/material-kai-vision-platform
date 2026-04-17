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
Newline-delimited JSON chunks (each chunk is one JSON object followed by `\n`):
```typescript
{"type": "status", "message": "Initializing agent..."}
{"type": "heartbeat", "timestamp": 1712345678901}
{"type": "iteration", "iteration": 1, "maxIterations": 10}
{"type": "tool_progress", "status": "Searching price knowledge base..."}
{"type": "tool_call_ids", "mapping": [
   { "tool_name": "price_lookup", "tool_call_id": "call_abc", "log_id": "<agent_tool_call_logs.id>" }
]}
{"type": "price_lookup_matches", "matches": [...], "hints": {...}}
{"type": "price_proposal", "product_name": "...", "list_price": 85, "discount_percent": 27, "final_unit_price": 62, "reasoning_chain": [...], "source_doc_ids": [...], "confidence": "high"}
{"type": "text", "text": "Here's the price I found..."}
{"type": "done"}
```

**Chunk types of interest for the pricing flow:**
- `tool_call_ids` — emitted once after tool-call logs are inserted. Contains the `agent_tool_call_logs.id` for each tool call. Use this to populate `quote_items.price_lookup_call_id` / `product_prices.price_lookup_call_id` when committing a price.
- `price_lookup_matches` — emitted by the `price_lookup` tool before the agent composes. Raw KB chunks grouped by `price_doc_type`.
- `price_proposal` — emitted by the agent's final message. Full structured proposal with reasoning chain and source doc IDs. This is what the UI commits.

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

Analyzes images using Claude Vision.

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

### Price Lookup Tool (admin/owner only)

Looks up a product price from the Pricing category of the Knowledge Base.
Only registered for users with `admin` or `owner` workspace role — regular
users never see the tool. Added 2026-04.

**Tool name:** `price_lookup`

**Parameters:**
```typescript
{
  product_name: string,          // required — full product name
  sku?: string,                  // strongest match signal when present
  manufacturer?: string,         // narrows discount rule scope
  quantity?: number,             // used for MOQ / tier math
  unit?: string,                 // expected unit ("m²", "piece", "box")
  product_id?: string,           // UUID — threaded into the price_proposal chunk
  category_slug?: string,        // defaults to "pricing"
  top_k?: number                 // max chunks to fetch (default 8)
}
```

**Returns (JSON string passed back into the model):**
```typescript
{
  success: boolean,
  query_used: string,
  matches: [
    {
      doc_id: string,
      doc_title: string,
      doc_type: 'price_list' | 'discount_rule' | 'contract_terms' | 'promotion' | 'unknown',
      snippet: string,            // ≤800 chars from the matching chunk
      relevance_score: number,
      category_slug?: string
    }
  ],
  hints: {
    total_matches: number,
    by_type: Record<string, number>,
    has_price_list: boolean,
    has_discount_rule: boolean,
    has_contract_terms: boolean,
    has_promotion: boolean,
    manufacturer_hint?: string
  },
  guidance: string,               // reasoning instructions for the model
  product_context: { product_name, sku, manufacturer, quantity, unit, product_id }
}
```

**Side effects (streamed chunks):**
- `price_lookup_matches` — emitted before the model composes, mirrors `matches`
- `price_proposal` — emitted by the model after reasoning, shape below

**`price_proposal` chunk shape:**
```typescript
{
  type: 'price_proposal',
  product_id?: string,
  product_name?: string,
  list_price: number | null,
  discount_percent: number | null,
  final_unit_price: number | null,
  currency: 'EUR' | 'USD' | ...,
  unit: string | null,
  quantity_applied: number | null,
  total: number | null,
  source_doc_ids: string[],       // kb_docs.id values
  source_titles: string[],
  reasoning_chain: string[],      // step-by-step explanation for admin review
  warnings: string[],             // conflicts, expired rules, unit mismatch
  confidence: 'high' | 'medium' | 'low',
  effective_through: string | null  // ISO date from the source doc
}
```

**Provenance contract.** When the caller commits a proposal to `quote_items`
or `product_prices`, it should:
1. Read the `log_id` for `price_lookup` from the `tool_call_ids` chunk.
2. Write that `log_id` into `quote_items.price_lookup_call_id` or
   `product_prices.price_lookup_call_id`.
3. Set `price_source` on `quote_items` to `kb:ai:<log_id>` (AI mode) or
   `kb:quick:<doc_id>` (quick-pick direct search) or `manual`.

This forms the audit chain: every price on a quote can be traced back to
the exact AI call that produced it.

### Direct Price Search (no AI, no LLM cost)

For "quick pick" UIs that only want raw matches without AI reasoning,
skip this endpoint entirely and call `mivaa-gateway` with action
`search_knowledge_base` + `category_slug: 'pricing'` + `caller: 'admin'`.
See [mivaa-gateway-api.md](./mivaa-gateway-api.md#search-knowledge-base-agent-facing).

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

