# AI Re-rank API

**Function:** `ai-rerank`
**Base URL:** `https://bgbavxtjlbvgplozizxu.supabase.co/functions/v1/ai-rerank`
**Auth:** Authenticated users (JWT required)

Full documentation: [ai-reranking.md](../ai-reranking.md)

---

## Re-rank search results

```
POST /functions/v1/ai-rerank
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "query": "matte black tiles for wet areas",
  "results": [
    {
      "id": "uuid-1",
      "name": "Matte Black Porcelain Tile",
      "description": "R11 anti-slip rating, suitable for wet areas...",
      "relevanceScore": 0.87
    },
    {
      "id": "uuid-2",
      "name": "Matte Black Ceramic Wall Tile",
      "description": "Interior wall application only...",
      "relevanceScore": 0.85
    }
  ],
  "maxResults": 10,
  "includeExplanations": true,
  "model": "claude-opus-4-7"
}
```

### Parameters

| Field | Type | Default | Description |
|---|---|---|---|
| `query` | string | required | Original search query |
| `results` | SearchResult[] | required | Up to 50 candidates |
| `maxResults` | number | all | Trim output to N results |
| `includeExplanations` | boolean | false | Add per-result reasoning text |
| `model` | string | `claude-opus-4-7` | `claude-opus-4-7` or `claude-haiku-4-5` |

---

## Response

```json
{
  "rerankedResults": [
    { "id": "uuid-1", "name": "...", "relevanceScore": 0.94 },
    { "id": "uuid-2", "name": "...", "relevanceScore": 0.71 }
  ],
  "explanations": {
    "uuid-1": "Ranked #1: explicitly matches wet-area requirements with R11 anti-slip.",
    "uuid-2": "Ranked #2: good material match but interior-only — not wet area rated."
  },
  "processingTimeMs": 820,
  "model": "claude-opus-4-7",
  "usage": { "inputTokens": 1240, "outputTokens": 380 }
}
```

## Errors

| Status | Meaning |
|---|---|
| `400` | Missing `query` or `results` |
| `401` | Unauthorized |
| `500` | Claude API error |
