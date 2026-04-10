# AI Usage Pricing & Monitoring System

## Overview
This document explains how the platform tracks and converts AI service costs into platform credits.

## Platform Credit System

**1 Platform Credit = $0.01 USD**

All AI service costs are converted to platform credits using the formula: `Platform Credits = USD Cost × 100`.

Example: A $0.15 USD API call = **15 platform credits**

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
  - Claude 3.5 Sonnet (with prompt caching)
  - Claude 3 Opus, Sonnet, Haiku
- **Special Features**:
  - Prompt caching support (reduced cost for cached tokens)
- **Cost Calculation**: USD Cost = (input_tokens / 1M × input_price) + (output_tokens / 1M × output_price) + (cached_tokens / 1M × cached_price). Platform Credits = USD Cost × 100.

### 3. **HuggingFace Endpoint Models (Qwen3-VL Vision)**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - Qwen3-VL-32B, Qwen3-VL-8B (vision models)
- **Cost Calculation**: Same formula as OpenAI.

### 4. **Embedding Models** (updated 2026-04)
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - Voyage AI `voyage-3.5` (1024D) — sole production text embedder
  - OpenAI `text-embedding-3-small` — legacy CI changelog workflow only
- **Cost Calculation**: USD Cost = (tokens / 1M × price). Platform Credits = USD Cost × 100.

### 5. **Vision Models**
- **Pricing Unit**: Per image
- **Models Tracked**:
  - GPT-4o vision
  - Claude 3.5 Sonnet vision
- **Cost Calculation**: USD Cost = image_count × price_per_image. Platform Credits = USD Cost × 100.

### 6. **Firecrawl Web Scraping**
- **Pricing Unit**: Per credit
- **Firecrawl System**:
  - 1 Firecrawl credit = 15 tokens
  - Pricing varies by plan
- **Cost Calculation**: USD Cost = firecrawl_credits × cost_per_credit. Platform Credits = USD Cost × 100.
- **Default Estimate**: $0.001 per Firecrawl credit

---

## Database Schema

### `ai_usage_logs` Table
Tracks all AI API calls with detailed cost breakdown. The table stores the following fields: a UUID primary key, `user_id` referencing `auth.users`, `model_name` (e.g., `"gpt-4o"`, `"claude-3-5-sonnet"`), `provider` (e.g., `"openai"`, `"anthropic"`, `"firecrawl"`), `operation_type` (e.g., `"chat"`, `"embedding"`, `"scrape"`), `input_tokens`, `output_tokens`, `cached_tokens`, `total_tokens`, `firecrawl_credits` (Firecrawl-specific), `cost_usd` (DECIMAL 10,6 — cost in USD), `platform_credits` (integer — cost in platform credits, i.e., USD × 100), `request_metadata` (JSONB), `response_metadata` (JSONB), and `created_at` timestamp.

---

## Usage Examples

### Example 1: GPT-4o API Call

For 1,000 input tokens at $2.50/1M and 500 output tokens at $10.00/1M:
- USD cost = (1,000/1,000,000 × $2.50) + (500/1,000,000 × $10.00) = $0.0025 + $0.005 = $0.0075
- Platform credits = $0.0075 × 100 = 0.75 credits (rounded up to 1)

### Example 2: Firecrawl Scrape

For 5 Firecrawl credits at an estimated $0.001 per credit:
- USD cost = 5 × $0.001 = $0.005
- Platform credits = $0.005 × 100 = 0.5 credits (rounded up to 1)

---

## Monitoring & Reporting

### Query Total Usage by User

To get total platform credits, total USD spend, and API call count per user over the last 30 days, query `ai_usage_logs` grouped by `user_id`, summing `platform_credits` and `cost_usd`, and filtering by `created_at >= NOW() - INTERVAL '30 days'`.

### Query Usage by Model

To see which models are consuming the most credits over the last 7 days, query `ai_usage_logs` grouped by `model_name` and `provider`, summing `total_tokens` and `platform_credits`, ordered by `total_credits` descending.

---

## Configuration

All pricing is centralized in `app/config/ai_pricing.py`:
- Prices are stored as `Decimal` for precision
- Each model includes `last_verified` date and `source` URL
- Prices should be updated when providers change rates

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
- Firecrawl pricing is estimated and should be adjusted based on actual plan
- All costs are logged in both USD and platform credits for transparency
