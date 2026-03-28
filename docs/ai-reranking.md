# AI Search Re-ranking

Claude-powered re-ranking that improves search result ordering using semantic understanding beyond vector similarity scores.

---

## Overview

The `ai-rerank` edge function takes a list of search results and a query, then uses Claude to re-order them by true semantic relevance. It optionally produces per-result explanations for why each item was ranked where it was.

**Edge Function:** `ai-rerank`

---

## Why Re-ranking?

Vector similarity scores are good proxies for relevance but miss:
- Contextual nuance (e.g., "matte black tiles for wet areas" vs. "matte black tiles")
- Ranking diversity (avoiding clusters of near-identical results at the top)
- Domain-specific relevance factors (material properties, application suitability)

Re-ranking runs as a second pass after initial retrieval, taking the top-N candidates and returning them in optimal order.

---

## API

```
POST /functions/v1/ai-rerank
Authorization: Bearer <jwt>
Content-Type: application/json
```

### Request Body

| Field | Type | Required | Description |
|---|---|---|---|
| `query` | string | Yes | The original search query |
| `results` | SearchResult[] | Yes | Search results to re-rank (see schema below) |
| `maxResults` | number | No | Max results to return (default: all) |
| `includeExplanations` | boolean | No | Include per-result reasoning (default: false) |
| `model` | string | No | `claude-sonnet-4-5` (default) or `claude-haiku-4-5` (faster) |

### SearchResult Schema

```typescript
{
  id: string;
  name: string;
  description: string;
  category?: string;
  relevanceScore: number;       // original vector similarity score
  semanticScore?: number;       // optional semantic score
  understandingScore?: number;  // optional understanding embedding score
  qualityMetrics?: {
    precision?: number;
    recall?: number;
    mrr?: number;
  };
}
```

### Response

```json
{
  "rerankedResults": [
    {
      "id": "uuid",
      "name": "Matte Black Porcelain Tile",
      "relevanceScore": 0.94,
      ...
    }
  ],
  "explanations": {
    "uuid-1": "Ranked #1 because it explicitly matches wet-area slip resistance requirements in the query.",
    "uuid-2": "Ranked #2 — strong material match but no slip resistance data available."
  },
  "processingTimeMs": 820,
  "model": "claude-sonnet-4-5",
  "cost": 0.0034,
  "usage": {
    "inputTokens": 1240,
    "outputTokens": 380
  }
}
```

---

## Models

| Model | Speed | Quality | Use Case |
|---|---|---|---|
| `claude-sonnet-4-5` | ~800ms | Highest | Complex queries, full catalog search |
| `claude-haiku-4-5` | ~300ms | Good | Simple queries, real-time suggestions |

---

## Integration with Search

Re-ranking is an optional post-processing step in the search pipeline:

```
1. Run unified_search / multi-vector search → top-50 candidates
2. POST /functions/v1/ai-rerank with candidates + query
3. Display re-ranked top-10 to user
```

The re-ranker receives the raw relevance scores from step 1 and uses them as hints alongside its semantic understanding.

---

## Quality Metrics

The re-ranker can return quality signal fields:

- **MRR (Mean Reciprocal Rank)**: How early the best result appears
- **Precision**: Fraction of returned results that are relevant
- **Recall**: Fraction of all relevant results that were returned

These feed into the analytics dashboard's search quality tracking.

---

**Last Updated:** March 2026
