# AI Usage Logging Implementation Guide

## Quick Start

### 1. Import Required Modules

Import `AIPricingConfig` from `app.config.ai_pricing` and `AIUsageLogger` from `app.services.ai_usage_logger`.

### 2. Log an AI API Call

#### For OpenAI/Anthropic/HuggingFace Endpoint (Token-based)

After making an API call, extract the usage from the response and pass it to `AIUsageLogger.log_usage()` with the following fields: `user_id`, `model_name`, `provider`, `operation_type`, `input_tokens`, `output_tokens`, `request_metadata`, and `response_metadata`.

#### For Firecrawl (Credit-based)

After making a Firecrawl API call, extract `credits_used` from the response and pass it to `AIUsageLogger.log_usage()` with `provider="firecrawl"` and the `firecrawl_credits` field instead of token counts.

---

## Complete Examples

### Example 1: OpenAI Chat Completion

Call the OpenAI chat completions API, then log usage by passing `response.usage.prompt_tokens` as `input_tokens` and `response.usage.completion_tokens` as `output_tokens` to `AIUsageLogger.log_usage()`.

### Example 2: Anthropic Claude with Caching

Call the Anthropic messages API, then log usage including `cached_tokens` (from `usage.cache_read_input_tokens` if available) by passing all token counts to `AIUsageLogger.log_usage()`.

### Example 3: Firecrawl Web Scraping

Call the Firecrawl scrape URL method, extract `credits_used` from the response, and log using `AIUsageLogger.log_usage()` with `provider="firecrawl"` and `firecrawl_credits=credits_used`.

---

## Cost Calculation

The `AIUsageLogger` automatically calculates costs using `AIPricingConfig`. For token-based models, it uses `AIPricingConfig.calculate_cost(model, input_tokens, output_tokens)`. For Firecrawl, it uses `AIPricingConfig.calculate_firecrawl_cost(credits_used)`. Platform credits are computed as `int(cost_usd * 100)`.

---

## Best Practices

1. **Always log immediately after API call** - Don't wait or batch logs
2. **Include relevant metadata** - Helps with debugging and analysis
3. **Handle errors gracefully** - Log even if API call fails
4. **Use correct provider names** - "openai", "anthropic", "firecrawl", etc.
5. **Track all token types** - input, output, cached (if applicable)

---

## Querying Usage Data

Use `AIUsageLogger.get_user_total_credits(user_id)` to get total usage. Use `AIUsageLogger.get_usage_by_date_range(user_id, start_date, end_date)` to get usage for a date range. Use `AIUsageLogger.get_usage_by_model(user_id, model_name)` to get usage for a specific model.
