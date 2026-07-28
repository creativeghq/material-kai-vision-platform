# AI Usage Pricing & Monitoring System

## Overview
This document explains how the platform tracks and converts AI service costs into platform credits.

## Platform Credit System

**1 Platform Credit = $0.01 USD**

Platform billing applies a **50% markup** on top of the raw provider cost before converting to credits:

```
billed_cost_usd = raw_cost_usd × 1.50         # MARKUP_MULTIPLIER
platform_credits = billed_cost_usd × 100      # 1 credit = $0.01
```

Example: A raw $0.15 Anthropic API call → billed $0.225 → **22.5 platform credits** (rounded up to 23).

The markup constant is centralized to keep ecosystems aligned:
- Edge functions: [`supabase/functions/_shared/pricing-constants.ts`](../supabase/functions/_shared/pricing-constants.ts) → `MARKUP_MULTIPLIER`
- Python backend: [`mivaa-pdf-extractor/app/config/ai_pricing.py`](../mivaa-pdf-extractor/app/config/ai_pricing.py) → `AIPricingConfig.MARKUP_MULTIPLIER`
- Frontend admin dashboard: [`src/components/Admin/OperationsDashboard/constants.ts`](../src/components/Admin/OperationsDashboard/constants.ts) → `MARKUP_MULTIPLIER`

All three MUST be updated together.

---

## Supported AI Services

### 1. **OpenAI Models (GPT)**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - GPT-4o, GPT-4o-mini
  - GPT-4-turbo, GPT-3.5-turbo
  - o1-preview, o1-mini
- **Cost Calculation**: USD Cost = (input_tokens / 1M × input_price) + (output_tokens / 1M × output_price). Platform Credits = USD Cost × 100.

### 2. **Anthropic Models (Claude)**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - Claude Opus 4.7 (with prompt caching)
  - Claude Haiku 4.5
- **Special Features**:
  - Prompt caching support (reduced cost for cached tokens)
- **Cost Calculation**: USD Cost = (input_tokens / 1M × input_price) + (output_tokens / 1M × output_price) + (cached_tokens / 1M × cached_price). Platform Credits = USD Cost × 100.

### 3. **~~HuggingFace Endpoint Vision~~ — RETIRED**
- **Status**: HuggingFace hosts nothing. Vision runs on Anthropic Claude Opus 4.7 via tool use and is billed under section 2 (Anthropic); the GPU endpoints that remain are Modal-hosted (sections 3a and 4).

### 3a. **Modal Endpoint OCR (PaddleOCR-VL)**
- **Pricing Unit**: Modal GPU (L4) usage, billed per second of container runtime (scale-to-zero when idle: `min_containers=0`, $0 idle)
- **Models Tracked**: PaddleOCR-VL (0.9B, PP-DocLayoutV2 detector + 0.9B VLM) on Modal — layout+OCR backbone post-2026-06-13. Replaced Surya-2, which had replaced Chandra v2.
- **Cost Calculation**: Modal runtime cost amortized across all OCR'd pages/images. Per-attempt telemetry tracked in `paddleocr_metrics`.

### 3b. **Modal Endpoint Visual Embeddings (SLIG SigLIP2)**
- **Pricing Unit**: Modal GPU endpoint (scale-to-zero when idle, $0 idle). SLIG moved off HuggingFace to Modal 2026-06-14.
- **Models Tracked**: SLIG (SigLIP2 base, `siglip2-base-patch16-512`, 768D) — 5 specialized 768D embedding types per image
- **Cost Calculation**: Endpoint runtime cost amortized across all images embedded.

### 4. **Embedding Models** (updated 2026-04)
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - Voyage AI `voyage-4` (1024D) — sole production text embedder
  - OpenAI `text-embedding-3-small` — legacy CI changelog workflow only
- **Cost Calculation**: USD Cost = (tokens / 1M × price). Platform Credits = USD Cost × 100.

### 5. **Vision Models**
- **Pricing Unit**: Per image
- **Models Tracked**:
  - GPT-4o vision
  - Claude Opus 4.7 vision
- **Cost Calculation**: USD Cost = image_count × price_per_image. Platform Credits = USD Cost × 100.

### 6. **Firecrawl Web Scraping**
- **Pricing Unit**: Per credit
- **Firecrawl System**:
  - 1 Firecrawl credit = 15 tokens
  - Pricing varies by plan
- **Cost Calculation**: USD Cost = firecrawl_credits × cost_per_credit. Platform Credits = USD Cost × 100.
- **Default Estimate**: $0.001 per Firecrawl credit

### 7. **Perplexity Sonar** (price discovery engine, 2026-04)
- **Pricing Unit**: Tokens + per-search fee
- **Model**: `sonar-pro` — $3/M input, $15/M output, plus $5 per 1K high-context searches.
- **Cost Calculation**: USD = (input/1M × $3) + (output/1M × $15) + ($0.005 × search_calls). Platform credits = USD × 100.
- **Typical**: ~$0.02/query, ~5-8s latency, 6-10 retailers.
- **Logged as**: `operation_type='price_search'`, `provider='perplexity'` in `ai_usage_logs`.

### 8. **DataForSEO Merchant** (Google Shopping feed, 2026-04)
- **Pricing Unit**: Flat per task (~$0.002 regardless of depth)
- **Endpoint**: async `task_post` → `task_get/advanced`. Depth defaults to ≥30 for broad merchant coverage.
- **Cost Calculation**: USD = $0.002 × tasks_posted. Platform credits = USD × 100.
- **Logged as**: `operation_type='price_search'`, `provider='dataforseo'`.

### 9. **Claude Haiku 4.5** (identity classifier + query facet extractor, 2026-04-25)
- **Pricing Unit**: Per million tokens
- **Model**: `claude-haiku-4-5-20251001` — cheap, fast, cache-aware
- **Two operation types in price monitoring**:
  - `operation_type='price_search'` (query facet extraction) — ~$0.0005/call. Cached on `tracked_queries.query_facets` so repeated refreshes don't re-pay.
  - `operation_type='product_match_classifier'` (batched identity verdict over N hits per discovery) — ~$0.002 per batch.
- **Cost Calculation**: standard token-based — (input/1M × $0.80) + (output/1M × $4.00). Cache hits reduce input cost by ~90%.
- **Logged as**: `provider='anthropic'`. Full `{query_facets, candidates, verdicts}` payload stored in `metadata` jsonb for auditability.

---

## Database Schema

### `ai_usage_logs` Table
Tracks all AI API calls with detailed cost breakdown. The table stores the following fields: a UUID primary key, `user_id` referencing `auth.users`, `model_name` (e.g., `"gpt-4o"`, `"claude-opus-4-7"`), `provider` (e.g., `"openai"`, `"anthropic"`, `"firecrawl"`), `operation_type` (e.g., `"chat"`, `"embedding"`, `"scrape"`), `input_tokens`, `output_tokens`, `cached_tokens`, `total_tokens`, `firecrawl_credits` (Firecrawl-specific), `cost_usd` (DECIMAL 10,6 — cost in USD), `platform_credits` (integer — cost in platform credits, i.e., USD × 100), `request_metadata` (JSONB), `response_metadata` (JSONB), and `created_at` timestamp.

---

## Usage Examples

### Example 1: Claude Opus 4.7 API Call (with markup)

For 1,000 input tokens at $15.00/1M and 500 output tokens at $75.00/1M:
- Raw USD cost = (1,000/1,000,000 × $15.00) + (500/1,000,000 × $75.00) = $0.015 + $0.0375 = $0.0525
- Billed USD = $0.0525 × 1.50 (markup) = $0.07875
- Platform credits = $0.07875 × 100 = 7.875 credits (rounded up to **8**)

### Example 2: Firecrawl Scrape (with markup)

For 5 Firecrawl credits at an estimated $0.001 per credit:
- Raw USD cost = 5 × $0.001 = $0.005
- Billed USD = $0.005 × 1.50 = $0.0075
- Platform credits = $0.0075 × 100 = 0.75 credits (rounded up to **1**)

---

## Monitoring & Reporting

### Query Total Usage by User

To get total platform credits, total USD spend, and API call count per user over the last 30 days, query `ai_usage_logs` grouped by `user_id`, summing `platform_credits` and `cost_usd`, and filtering by `created_at >= NOW() - INTERVAL '30 days'`.

### Query Usage by Model

To see which models are consuming the most credits over the last 7 days, query `ai_usage_logs` grouped by `model_name` and `provider`, summing `total_tokens` and `platform_credits`, ordered by `total_credits` descending.

---

## Configuration

Pricing is split across two layers:

| Layer | What it covers | Storage | How to update |
|-------|----------------|---------|---------------|
| **MIVAA gateway action pricing** | RAG search, image analysis (flat per-action credits) | Hardcoded TypeScript in [`mivaa-pricing.ts`](../supabase/functions/_shared/mivaa-pricing.ts) | Manual — these are platform-internal action-level prices, not third-party costs |

### Runtime behaviour
The edge-function billing path ([`credit-utils.ts`](../supabase/functions/_shared/credit-utils.ts)) reads `ai_model_pricing` rows where `billing_type='per_unit'` AND `category='external_service'` at runtime, caches the result in memory for **5 minutes**, and falls back to a small embedded constant only if the DB query fails. Admin price edits propagate within 5 minutes (or immediately via `invalidatePricingCache()`).

The Python mirror in [`ai_pricing.py`](../mivaa-pdf-extractor/app/config/ai_pricing.py) `EXTERNAL_SERVICE_PRICING` is a **fallback for standalone Python use only** — the DB row is canonical.

### Per-model metadata
Each row in `ai_model_pricing` carries:
- `cost_per_unit` / `cost_per_generation` / `input_price_per_million` + `output_price_per_million` / `hourly_rate_usd` (depending on `billing_type`)
- `unit_label` (per-unit rows only — e.g. `message`, `enrichment`, `image`, `second`)
- `markup_multiplier` (default 1.50)
- `source_url` and `last_verified_at`
- `auto_update_enabled` flag and optional `auto_update_source_url`

## Credit Purchase Volume Discounts

Users can purchase credits for any dollar amount ($1–$500). Larger purchases unlock better rates:

| Tier | Spend | Rate | Credits per $1 | Discount |
|------|-------|------|-----------------|----------|
| Standard | $1–$9.99 | $0.010/credit | 100 | 0% |
| Silver | $10–$44.99 | $0.009/credit | ~111 | 10% |
| Gold | $45–$79.99 | $0.008/credit | 125 | 20% |
| Platinum | $80+ | $0.007/credit | ~143 | 30% |

Pricing logic: `src/services/stripe.service.ts` → `calculateCreditsForAmount()`

Stripe setup: A single "Material KAI Credits" product (`STRIPE_CREDITS_PRODUCT_ID`) is reused for all purchases. Prices are set dynamically at checkout via `price_data`.

## Notes
- Platform credits are always rounded up to nearest integer
- All billed amounts include the **50% platform markup** described above
- Firecrawl pricing is an estimate ($0.001/credit) — adjust against the active plan if usage scales (editable from the admin UI)
- External service pricing lives in `ai_model_pricing` and is editable from the admin UI; edits propagate to live billing within 5 minutes via the edge-function cache
- MIVAA gateway action pricing (RAG search, image analysis) is hardcoded in `mivaa-pricing.ts` because these are platform-internal action-level credits, not third-party provider costs
- All costs are logged in both raw USD, billed USD, markup multiplier, and platform credits for transparency (`ai_usage_logs`)
