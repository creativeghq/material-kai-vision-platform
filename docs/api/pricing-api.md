# Pricing API

Admin-only API for sourcing, composing, and committing product prices from
the "Pricing" category of the Knowledge Base. Added 2026-04.

> **Access control.** Every endpoint in this document requires the caller to
> have `admin` or `owner` role in the target workspace. Non-admin callers
> get no tool, no endpoint, no data.

## Architecture (one picture)

```
          ┌──────────────────────────────────────────────┐
          │          KB "Pricing" category               │
          │  docs tagged with price_doc_type:            │
          │    price_list | discount_rule |              │
          │    contract_terms | promotion                │
          └────────────┬─────────────────┬───────────────┘
                       │                 │
   ┌───────────────────▼───────┐   ┌─────▼────────────────┐
   │ agent-chat                │   │ mivaa-gateway        │
   │   tool: price_lookup      │   │   action:            │
   │   (AI mode — reasoning)   │   │   search_knowledge_… │
   │                           │   │   (quick pick,       │
   │ tool_call_ids chunk       │   │    no LLM)           │
   │   → log_id (uuid)         │   │                      │
   │ price_lookup_matches      │   │ raw chunks with      │
   │ price_proposal            │   │ price_doc_type       │
   └───────────────┬───────────┘   └─────┬────────────────┘
                   │                     │
                   └─────────┬───────────┘
                             │
                  Admin clicks "Use this price"
                             │
          ┌──────────────────┴──────────────────┐
          │                                     │
┌─────────▼──────────┐              ┌───────────▼──────────┐
│ quote_items        │              │ product_prices       │
│  price_source      │              │  price_lookup_call_id│
│  price_lookup_call_id              │  source_kb_doc_ids  │
└────────────────────┘              └──────────────────────┘
          │                                     │
          └───────────────┬─────────────────────┘
                          ▼
                 agent_tool_call_logs
                 (traceable audit chain)
```

## 1. Setup — create the Pricing category (one-time)

```bash
POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "action": "kb_create_category",
  "payload": {
    "workspace_id": "<uuid>",
    "name": "Pricing",
    "slug": "pricing",
    "access_level": "admin",
    "trigger_keyword": "price"
  }
}
```

Or directly against MIVAA: `POST /api/kb/categories` with the same payload.

## 2. Ingest price docs

Admins upload markdown files (or edit inline) under the Pricing category.
Each doc must set `price_doc_type` so the agent can reason about how to
combine it.

```bash
POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway
{
  "action": "kb_create_document",
  "payload": {
    "workspace_id": "<uuid>",
    "title": "Factory X Q2 2026",
    "category_id": "<pricing_category_uuid>",
    "status": "published",
    "price_doc_type": "price_list",
    "content": "# Q2 2026 pricing\n\n| SKU | Name | Price / m² |\n|---|---|---|\n| CM-6060 | Carrara 60×60 | €85 |\n..."
  }
}
```

Re-uploading a doc with the same `(workspace_id, title, category_id)`
**updates** the existing row in place and re-embeds only if `content`
changed. Use this for quarterly price list refreshes.

### Sub-type semantics

| `price_doc_type` | When to use it |
|---|---|
| `price_list` | Tables / catalogs with rows of SKU → price |
| `discount_rule` | Blanket rules like "Eurolamp: all items 50% off" |
| `contract_terms` | Negotiated terms for a manufacturer |
| `promotion` | Time-limited offers (must include an effective range in the content) |

The agent combines them at composition time:
`final = list_price × (1 − discount_percent)`, with specific SKU prices
beating general rules.

## 3. Look up a price — AI mode

Streams `agent-chat` with a prompt that triggers the `price_lookup` tool.
Returns a full reasoning chain and `agent_tool_call_logs.id` for audit.

```bash
POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/agent-chat
Authorization: Bearer <admin_token>
Content-Type: application/json

{
  "agentId": "kai",
  "messages": [
    {
      "role": "user",
      "content": "Look up the current price for:\n- Name: Carrara Marble Tile 60×60\n- SKU: CM-6060\n- Manufacturer: Factory X\n- Quantity: 12\n- Expected unit: m²\n- Product ID: 7a3b…\n\nCall the price_lookup tool with category_slug=\"pricing\" and compose a price_proposal chunk with a full reasoning chain."
    }
  ],
  "context": { "source": "price_lookup_drawer", "product_id": "7a3b…" }
}
```

Response is newline-delimited JSON. Chunks to capture:

| Chunk type | What to do with it |
|---|---|
| `tool_call_ids` | Find the entry with `tool_name: "price_lookup"` and store `log_id` |
| `price_lookup_matches` | Render source snippets in the UI |
| `price_proposal` | The final answer — all pricing fields + reasoning |

The `price_proposal` chunk is the contract:

```typescript
{
  type: 'price_proposal',
  product_id?: string,
  product_name?: string,
  list_price: number | null,
  discount_percent: number | null,
  final_unit_price: number | null,
  currency: string,
  unit: string | null,
  quantity_applied: number | null,
  total: number | null,
  source_doc_ids: string[],      // kb_docs.id values
  source_titles: string[],
  reasoning_chain: string[],
  warnings: string[],
  confidence: 'high' | 'medium' | 'low',
  effective_through: string | null
}
```

The agent never fabricates numbers — when it cannot determine a reliable
price (no base price, conflicting docs, expired rules), `final_unit_price`
is `null`, `confidence` is `low`, and `warnings` explains the gap.

### Cost

- LLM: ~1–3K input tokens + ~500–1500 output tokens (Claude Sonnet 4.6)
- Embedding: one query embedding via Voyage AI per call (~$0.00006)
- No external API fees beyond the LLM call

## 4. Look up a price — Quick pick (no AI cost)

Bypasses the agent entirely. Goes straight to MIVAA's semantic KB search
filtered to `category_slug: 'pricing'`. Returns raw matches — admin reads
snippets and composes the price manually.

```bash
POST https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/mivaa-gateway
Authorization: Bearer <admin_token>

{
  "action": "search_knowledge_base",
  "payload": {
    "workspace_id": "<uuid>",
    "query": "Carrara Marble Tile 60×60 CM-6060 Factory X",
    "search_types": ["kb_docs"],
    "top_k": 8,
    "similarity_threshold": 0.35,
    "caller": "admin",
    "category_slug": "pricing"
  }
}
```

Response chunks each include:
```typescript
{
  id: string,                // kb_docs.id
  document_title: string,
  content: string,           // chunk text
  category_slug: 'pricing',
  category_name: 'Pricing',
  price_doc_type: 'price_list' | 'discount_rule' | ...,
  relevance_score: number
}
```

### When to use which

| Use case | Mode |
|---|---|
| High-volume price entry, want full audit + reasoning | AI |
| You already know the number, just want to confirm source | Quick |
| Debugging why a price came out wrong | Quick (see raw chunks) |
| Processing a batch of quote lines | AI (reasoning scales with admin review) |

## 5. Commit a price

Commit is explicit — no auto-fill. Two target tables depending on where
the price came from.

### To a quote line

```bash
PATCH https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/quote_items?id=eq.<item_id>
Authorization: Bearer <admin_token>
apikey: <anon_or_service_key>
Content-Type: application/json
Prefer: return=representation

{
  "unit_price": 85.00,
  "discounted_price": 62.00,
  "price_source": "kb:ai:<price_lookup_call_id>",
  "price_lookup_call_id": "<price_lookup_call_id>",
  "notes": "Applied Factory X Q2 2026 contract discount"
}
```

`price_source` values:
- `manual` — admin typed the number
- `catalog` — from products catalog row
- `kb:ai:<log_id>` — AI mode lookup (log_id is an `agent_tool_call_logs.id`)
- `kb:quick:<doc_id>` — Quick pick (doc_id is a `kb_docs.id`)
- `product_price:<id>` — inherited from `product_prices`

### To the product cache

```bash
POST https://bgbavxtjlbvgplozizxu.supabase.co/rest/v1/product_prices
Authorization: Bearer <admin_token>
apikey: <anon_or_service_key>
Prefer: resolution=merge-duplicates,return=representation

{
  "workspace_id": "<uuid>",
  "product_id": "<product_uuid>",
  "list_price": 85.00,
  "discount_price": 62.00,
  "discount_percent": 27.00,
  "currency": "EUR",
  "unit": "m²",
  "source_kb_doc_ids": ["<kb_doc_uuid>"],
  "source_snippet": "CM-6060 Carrara 60×60 €85/m²",
  "price_lookup_call_id": "<price_lookup_call_id>",
  "confirmed_by": "<user_uuid>",
  "notes": "Applied Q2 2026 contract discount"
}
```

`(workspace_id, product_id)` is a unique constraint — `Prefer:
resolution=merge-duplicates` upserts.

## 6. Audit a committed price

```sql
-- Quote line → original agent call
SELECT
  qi.id, qi.unit_price, qi.discounted_price, qi.price_source,
  atcl.created_at     AS lookup_ran_at,
  atcl.tool_args,     -- original product name, SKU, manufacturer
  atcl.result_summary -- match count, hints, timing
FROM quote_items qi
LEFT JOIN agent_tool_call_logs atcl
  ON atcl.id = qi.price_lookup_call_id
WHERE qi.id = '<item_id>';

-- Product cache → source docs
SELECT
  pp.list_price, pp.discount_price, pp.source_kb_doc_ids,
  kd.title        AS source_doc_title,
  kd.price_doc_type
FROM product_prices pp
LEFT JOIN kb_docs kd
  ON kd.id = ANY (ARRAY(SELECT jsonb_array_elements_text(pp.source_kb_doc_ids))::uuid[])
WHERE pp.product_id = '<product_uuid>';
```

## 7. Observability

All AI-mode price lookups are logged to `agent_tool_call_logs` with
`tool_name = 'price_lookup'`. Frontends can query this table directly
(admin RLS) to render analytics.

Useful aggregates:

```sql
-- Last 30-day commit rate (AI mode)
WITH calls AS (
  SELECT id, zero_result FROM agent_tool_call_logs
  WHERE tool_name = 'price_lookup'
    AND created_at > now() - interval '30 days'
),
committed AS (
  SELECT DISTINCT price_lookup_call_id AS id FROM quote_items
  WHERE price_lookup_call_id IN (SELECT id FROM calls)
  UNION
  SELECT DISTINCT price_lookup_call_id FROM product_prices
  WHERE price_lookup_call_id IN (SELECT id FROM calls)
)
SELECT
  (SELECT count(*) FROM calls) AS total,
  (SELECT count(*) FROM committed) AS committed,
  (SELECT count(*) FROM calls WHERE zero_result) AS no_match;
```

Quick-pick lookups never hit `agent_tool_call_logs` (no tool call) — they
are out of scope for these metrics by design.

## Schema reference

- `kb_docs.price_doc_type` — enum, nullable
- `quote_items.price_source` — text, nullable
- `quote_items.price_lookup_call_id` — uuid FK → `agent_tool_call_logs.id`
- `product_prices` — admin-RLS table, `(workspace_id, product_id)` unique
- `kb_match_docs` RPC — accepts `match_category_id`, `match_category_slug`,
  `match_price_doc_type`, `require_published` (default `true`)

## Related docs

- [MIVAA Gateway API](./mivaa-gateway-api.md) — underlying endpoints + actions
- [Agent Chat API](./agent-chat-api.md) — streaming protocol + tool contract
- [Quotes API](./quotes-api.md) — quote_items schema and pricing fields
