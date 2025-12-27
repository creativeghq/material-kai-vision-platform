# AI Usage Pricing & Monitoring System

## Overview
This document explains how the platform tracks and converts AI service costs into platform credits.

## Platform Credit System

**1 Platform Credit = $0.01 USD**

All AI service costs are converted to platform credits using this formula:
```
Platform Credits = USD Cost × 100
```

Example: A $0.15 USD API call = **15 platform credits**

---

## Supported AI Services

### 1. **OpenAI Models (GPT)**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - GPT-4o, GPT-4o-mini
  - GPT-4-turbo, GPT-3.5-turbo
  - o1-preview, o1-mini
- **Cost Calculation**:
  ```
  USD Cost = (input_tokens / 1M × input_price) + (output_tokens / 1M × output_price)
  Platform Credits = USD Cost × 100
  ```

### 2. **Anthropic Models (Claude)**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - Claude 3.5 Sonnet (with prompt caching)
  - Claude 3 Opus, Sonnet, Haiku
- **Special Features**:
  - Prompt caching support (reduced cost for cached tokens)
- **Cost Calculation**:
  ```
  USD Cost = (input_tokens / 1M × input_price) + 
             (output_tokens / 1M × output_price) +
             (cached_tokens / 1M × cached_price)
  Platform Credits = USD Cost × 100
  ```

### 3. **TogetherAI Models (Qwen Vision)**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - Qwen3-VL-32B, Qwen3-VL-8B (vision models)
- **Cost Calculation**: Same as OpenAI

### 4. **Embedding Models**
- **Pricing Unit**: Per million tokens
- **Models Tracked**:
  - text-embedding-3-small/large
  - text-embedding-ada-002
- **Cost Calculation**:
  ```
  USD Cost = (tokens / 1M × price)
  Platform Credits = USD Cost × 100
  ```

### 5. **Vision Models**
- **Pricing Unit**: Per image
- **Models Tracked**:
  - GPT-4o vision
  - Claude 3.5 Sonnet vision
- **Cost Calculation**:
  ```
  USD Cost = image_count × price_per_image
  Platform Credits = USD Cost × 100
  ```

### 6. **Firecrawl Web Scraping**
- **Pricing Unit**: Per credit
- **Firecrawl System**:
  - 1 Firecrawl credit = 15 tokens
  - Pricing varies by plan
- **Cost Calculation**:
  ```
  USD Cost = firecrawl_credits × cost_per_credit
  Platform Credits = USD Cost × 100
  ```
- **Default Estimate**: $0.001 per Firecrawl credit

---

## Database Schema

### `ai_usage_logs` Table
Tracks all AI API calls with detailed cost breakdown:

```sql
CREATE TABLE ai_usage_logs (
    id UUID PRIMARY KEY,
    user_id UUID REFERENCES auth.users,
    model_name VARCHAR(255),           -- e.g., "gpt-4o", "claude-3-5-sonnet"
    provider VARCHAR(100),              -- e.g., "openai", "anthropic", "firecrawl"
    operation_type VARCHAR(100),        -- e.g., "chat", "embedding", "scrape"
    
    -- Token usage
    input_tokens INTEGER,
    output_tokens INTEGER,
    cached_tokens INTEGER,
    total_tokens INTEGER,
    
    -- Firecrawl specific
    firecrawl_credits INTEGER,
    
    -- Cost tracking
    cost_usd DECIMAL(10, 6),           -- Cost in USD
    platform_credits INTEGER,           -- Cost in platform credits (USD × 100)
    
    -- Metadata
    request_metadata JSONB,
    response_metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);
```

---

## Usage Examples

### Example 1: GPT-4o API Call
```python
# API call details
input_tokens = 1000
output_tokens = 500

# Pricing (from config)
input_price = $2.50 per 1M tokens
output_price = $10.00 per 1M tokens

# Cost calculation
usd_cost = (1000/1M × $2.50) + (500/1M × $10.00)
         = $0.0025 + $0.005
         = $0.0075

platform_credits = $0.0075 × 100 = 0.75 credits (rounded to 1)
```

### Example 2: Firecrawl Scrape
```python
# API call details
firecrawl_credits = 5

# Pricing (estimated)
cost_per_credit = $0.001

# Cost calculation
usd_cost = 5 × $0.001 = $0.005

platform_credits = $0.005 × 100 = 0.5 credits (rounded to 1)
```

---

## Monitoring & Reporting

### Query Total Usage by User
```sql
SELECT 
    user_id,
    SUM(platform_credits) as total_credits,
    SUM(cost_usd) as total_usd,
    COUNT(*) as api_calls
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY user_id;
```

### Query Usage by Model
```sql
SELECT 
    model_name,
    provider,
    COUNT(*) as calls,
    SUM(total_tokens) as total_tokens,
    SUM(platform_credits) as total_credits
FROM ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY model_name, provider
ORDER BY total_credits DESC;
```

---

## Configuration

All pricing is centralized in `app/config/ai_pricing.py`:
- Prices are stored as `Decimal` for precision
- Each model includes `last_verified` date and `source` URL
- Prices should be updated when providers change rates

## Notes
- Platform credits are always rounded up to nearest integer
- Firecrawl pricing is estimated and should be adjusted based on actual plan
- All costs are logged in both USD and platform credits for transparency

