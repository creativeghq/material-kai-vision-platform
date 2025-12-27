# AI Usage Logging Implementation Guide

## Quick Start

### 1. Import Required Modules
```python
from app.config.ai_pricing import AIPricingConfig
from app.services.ai_usage_logger import AIUsageLogger
```

### 2. Log an AI API Call

#### For OpenAI/Anthropic/TogetherAI (Token-based)
```python
# After making an API call
response = openai_client.chat.completions.create(...)

# Extract usage from response
usage = response.usage

# Log the usage
await AIUsageLogger.log_usage(
    user_id=current_user.id,
    model_name="gpt-4o",
    provider="openai",
    operation_type="chat_completion",
    input_tokens=usage.prompt_tokens,
    output_tokens=usage.completion_tokens,
    request_metadata={
        "messages": messages,
        "temperature": 0.7
    },
    response_metadata={
        "finish_reason": response.choices[0].finish_reason
    }
)
```

#### For Firecrawl (Credit-based)
```python
# After making a Firecrawl API call
response = firecrawl_client.scrape_url(url)

# Extract credits from response
credits_used = response.get("credits_used", 1)

# Log the usage
await AIUsageLogger.log_usage(
    user_id=current_user.id,
    model_name="firecrawl-scrape",
    provider="firecrawl",
    operation_type="scrape",
    firecrawl_credits=credits_used,
    request_metadata={
        "url": url,
        "options": scrape_options
    },
    response_metadata={
        "success": response.get("success"),
        "pages_scraped": response.get("pages", 1)
    }
)
```

---

## Complete Examples

### Example 1: OpenAI Chat Completion
```python
from openai import AsyncOpenAI
from app.services.ai_usage_logger import AIUsageLogger

async def generate_summary(text: str, user_id: str):
    client = AsyncOpenAI()
    
    messages = [
        {"role": "system", "content": "You are a helpful assistant."},
        {"role": "user", "content": f"Summarize: {text}"}
    ]
    
    # Make API call
    response = await client.chat.completions.create(
        model="gpt-4o",
        messages=messages,
        temperature=0.7
    )
    
    # Log usage
    await AIUsageLogger.log_usage(
        user_id=user_id,
        model_name="gpt-4o",
        provider="openai",
        operation_type="chat_completion",
        input_tokens=response.usage.prompt_tokens,
        output_tokens=response.usage.completion_tokens,
        request_metadata={"messages": messages, "temperature": 0.7},
        response_metadata={
            "finish_reason": response.choices[0].finish_reason,
            "model": response.model
        }
    )
    
    return response.choices[0].message.content
```

### Example 2: Anthropic Claude with Caching
```python
from anthropic import AsyncAnthropic
from app.services.ai_usage_logger import AIUsageLogger

async def analyze_document(document: str, user_id: str):
    client = AsyncAnthropic()
    
    # Make API call
    response = await client.messages.create(
        model="claude-3-5-sonnet-20241022",
        max_tokens=1024,
        messages=[
            {"role": "user", "content": document}
        ]
    )
    
    # Extract usage (including cache info)
    usage = response.usage
    
    # Log usage
    await AIUsageLogger.log_usage(
        user_id=user_id,
        model_name="claude-3-5-sonnet-20241022",
        provider="anthropic",
        operation_type="message_create",
        input_tokens=usage.input_tokens,
        output_tokens=usage.output_tokens,
        cached_tokens=getattr(usage, 'cache_read_input_tokens', 0),
        request_metadata={
            "max_tokens": 1024,
            "document_length": len(document)
        },
        response_metadata={
            "stop_reason": response.stop_reason,
            "model": response.model
        }
    )
    
    return response.content[0].text
```

### Example 3: Firecrawl Web Scraping
```python
from firecrawl import FirecrawlApp
from app.services.ai_usage_logger import AIUsageLogger

async def scrape_website(url: str, user_id: str):
    app = FirecrawlApp(api_key=settings.FIRECRAWL_API_KEY)
    
    # Make API call
    response = app.scrape_url(url, params={
        'formats': ['markdown', 'html']
    })
    
    # Extract credits (check response structure)
    credits_used = response.get("credits_used", 1)
    
    # Log usage
    await AIUsageLogger.log_usage(
        user_id=user_id,
        model_name="firecrawl-scrape",
        provider="firecrawl",
        operation_type="scrape",
        firecrawl_credits=credits_used,
        request_metadata={
            "url": url,
            "formats": ['markdown', 'html']
        },
        response_metadata={
            "success": response.get("success"),
            "content_length": len(response.get("markdown", ""))
        }
    )
    
    return response
```

---

## Cost Calculation

The `AIUsageLogger` automatically calculates costs using `AIPricingConfig`:

```python
# For token-based models
cost_usd = AIPricingConfig.calculate_cost(
    model="gpt-4o",
    input_tokens=1000,
    output_tokens=500
)

# For Firecrawl
cost_usd = AIPricingConfig.calculate_firecrawl_cost(
    credits_used=5
)

# Convert to platform credits
platform_credits = int(cost_usd * 100)
```

---

## Best Practices

1. **Always log immediately after API call** - Don't wait or batch logs
2. **Include relevant metadata** - Helps with debugging and analysis
3. **Handle errors gracefully** - Log even if API call fails
4. **Use correct provider names** - "openai", "anthropic", "firecrawl", etc.
5. **Track all token types** - input, output, cached (if applicable)

---

## Querying Usage Data

```python
from app.services.ai_usage_logger import AIUsageLogger

# Get user's total usage
total_credits = await AIUsageLogger.get_user_total_credits(user_id)

# Get usage by date range
usage = await AIUsageLogger.get_usage_by_date_range(
    user_id=user_id,
    start_date="2025-01-01",
    end_date="2025-01-31"
)

# Get usage by model
model_usage = await AIUsageLogger.get_usage_by_model(
    user_id=user_id,
    model_name="gpt-4o"
)
```

