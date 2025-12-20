# Web Scraping Integration Guide

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
> - [Product Discovery Architecture](./product-discovery-architecture.md) - AI-powered product extraction
> - [Data Import System](./data-import-system.md) - Unified import hub

## 🌐 Overview

The Material Kai Vision Platform now supports **automatic product discovery from web scraping** using Firecrawl integration. This feature allows you to scrape product catalogs from manufacturer websites and automatically create products with AI-powered metadata extraction.

### Async Processing

Web scraping uses **fully async processing** with the same concurrency limits as PDF processing:
- ✅ 5 concurrent Llama Vision requests (image classification)
- ✅ 2 concurrent Claude requests (validation)
- ✅ 10 concurrent image uploads
- ✅ 20 images per CLIP batch
- ✅ Same timeout guards (300s product discovery, 120s AI)

See [Async Processing & Limits](./async-processing-and-limits.md) for complete details.

## 🎯 Key Features

- **Automatic Product Discovery**: AI analyzes scraped content to identify and extract products
- **Unified Pipeline**: Same AI models and quality as PDF processing
- **Background Processing**: Large scraping jobs processed asynchronously
- **Retry Logic**: Automatic retry with exponential backoff for failed operations
- **Real-time Progress**: Track scraping and processing status in real-time
- **Image Extraction**: Automatically downloads and links product images

## 📊 How It Works

```
┌─────────────────────┐
│  User Triggers      │
│  Web Scraping       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Firecrawl API      │
│  Scrapes Website    │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Edge Function      │
│  (scrape-session-   │
│   manager)          │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Python API         │
│  (WebScrapingService)│
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  AI Discovery       │
│  (Claude/GPT)       │
└──────────┬──────────┘
           │
           ▼
┌─────────────────────┐
│  Products Created   │
│  in Database        │
└─────────────────────┘
```

## 🚀 Getting Started

### 1. Trigger Web Scraping

From the admin panel or via API:

```typescript
// Frontend: Trigger scraping
const response = await supabase.functions.invoke('scrape-session-manager', {
  body: {
    url: 'https://example.com/products',
    workspace_id: 'my-workspace',
    scraping_service: 'firecrawl',
    max_pages: 10
  }
});
```

### 2. Monitor Progress

Track scraping progress in real-time:

```typescript
// Subscribe to session updates
const subscription = supabase
  .channel('scraping-sessions')
  .on('postgres_changes', {
    event: 'UPDATE',
    schema: 'public',
    table: 'scraping_sessions',
    filter: `id=eq.${sessionId}`
  }, (payload) => {
    console.log('Progress:', payload.new.progress_percentage);
  })
  .subscribe();
```

### 3. View Results

Once complete, products are available in the products table:

```typescript
// Fetch products from scraping session
const { data: products } = await supabase
  .from('products')
  .select('*')
  .eq('source_type', 'web_scraping')
  .eq('source_id', sessionId);
```

## 🔄 Processing Pipeline

### Stage 1: Web Scraping (0-50%)

**Firecrawl Edge Function**
- Scrapes website pages
- Extracts markdown content
- Downloads images
- Stores in `scraping_pages` table

**Progress Updates**:
- Page 1/10 scraped (5%)
- Page 5/10 scraped (25%)
- Page 10/10 scraped (50%)

### Stage 2: Product Discovery (50-100%)

**Python API Processing**
- Fetches all scraped markdown
- Combines content for AI analysis
- Calls `ProductDiscoveryService.discover_products_from_text()`
- Creates products with metadata
- Links images to products

**Progress Updates**:
- AI analysis started (55%)
- Products discovered (70%)
- Products created (85%)
- Images linked (95%)
- Complete (100%)

## 🤖 AI Models

### Claude Sonnet 4.5 (Default)
- **Best Quality**: Most comprehensive analysis
- **Use For**: High-value catalogs, complex products
- **Cost**: ~$0.015 per 1K tokens

### GPT-5
- **Fast Processing**: Good quality, faster than Claude
- **Use For**: Standard catalogs, quick processing
- **Cost**: ~$0.01 per 1K tokens

### Claude Haiku 4.5
- **Fastest**: Lower cost, good for simple products
- **Use For**: Simple product lists, high volume
- **Cost**: ~$0.0025 per 1K tokens

## 📋 Comparison with Other Methods

| Feature | Web Scraping | PDF Processing | XML Import |
|---------|-------------|----------------|------------|
| **AI Discovery** | ✅ Yes | ✅ Yes | ❌ No (direct mapping) |
| **Image Extraction** | ✅ Automatic | ✅ Automatic | ⚠️ Manual URLs |
| **Metadata Quality** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| **Processing Speed** | Fast (2-5 min) | Medium (5-15 min) | Very Fast (<1 min) |
| **Cost per Product** | $0.02-0.05 | $0.05-0.15 | $0.00 |
| **Best For** | Websites | PDF Catalogs | Structured Data |

## 🔧 Configuration

### Scraping Options

```typescript
interface ScrapingConfig {
  url: string;                    // Website URL to scrape
  workspace_id: string;           // Workspace ID
  scraping_service: 'firecrawl';  // Scraping service (currently only Firecrawl)
  max_pages?: number;             // Max pages to scrape (default: 10)
  categories?: string[];          // Categories to discover (default: ['products'])
  model?: 'claude' | 'gpt' | 'haiku'; // AI model (default: 'claude')
}
```

### Discovery Options

```typescript
interface DiscoveryConfig {
  categories: string[];  // ['products', 'certificates', 'logos']
  model: string;         // 'claude', 'gpt', 'haiku'
  workspace_id: string;  // Workspace context
}
```

## 📊 Monitoring & Debugging

### Check Session Status

```bash
# Via API
curl -X GET "https://v1api.materialshub.gr/api/scraping/session/{session_id}/status" \
  -H "Authorization: Bearer mk_your_api_key"
```

### View Scraping Logs

```sql
-- Check scraping session
SELECT * FROM scraping_sessions WHERE id = 'session-id';

-- Check scraped pages
SELECT url, status, markdown_length
FROM scraping_pages
WHERE session_id = 'session-id';

-- Check created products
SELECT name, metadata->>'source_url' as source_url
FROM products
WHERE source_type = 'web_scraping'
  AND source_id = 'session-id';
```

### Common Issues

#### Issue: "Session not found"
**Cause**: Invalid session ID or session deleted
**Solution**: Verify session ID exists in `scraping_sessions` table

#### Issue: "No products discovered"
**Cause**: Website content doesn't contain product information
**Solution**:
- Check scraped markdown in `scraping_pages.markdown_content`
- Verify website has product listings
- Try different URL (e.g., /products page instead of homepage)

#### Issue: "Webhook failed after 3 retries"
**Cause**: Python API unreachable or authentication failed
**Solution**:
- Check Python API is running
- Verify MIVAA_API_KEY is configured
- Check Edge Function logs for error details
- Manually retry from admin UI

#### Issue: "AI analysis timeout"
**Cause**: Too much content or AI API slow
**Solution**:
- Reduce `max_pages` to scrape fewer pages
- Use faster model (GPT or Haiku instead of Claude)
- Split into multiple smaller scraping sessions

## 🎯 Best Practices

### 1. Start Small
- Test with 1-2 pages first
- Verify product discovery quality
- Scale up to full catalog

### 2. Choose Right Model
- **Claude Sonnet**: High-value products, complex catalogs
- **GPT-5**: Standard products, good balance
- **Haiku**: Simple products, high volume

### 3. Monitor Costs
- Track AI token usage in job metadata
- Estimate: ~$0.02-0.05 per product
- Use Haiku for cost optimization

### 4. Handle Failures
- Enable automatic retry (built-in)
- Monitor webhook status
- Set up Sentry alerts

### 5. Optimize Performance
- Scrape during off-peak hours
- Use background processing for large jobs
- Batch similar products together

## 🔐 Security

### Authentication
- Edge Function → Python API: Material Kai API key (`mk_*`)
- Stored in Supabase secrets
- Validated by JWT middleware

### Data Privacy
- Scraped content stored in workspace-isolated tables
- Products linked to workspace
- Row-level security enforced

### Rate Limiting
- Firecrawl API: 100 requests/minute
- Python API: No hard limit (use responsibly)
- Automatic retry prevents abuse

## 📈 Performance Metrics

### Typical Processing Times

| Pages | Products | Time | Cost |
|-------|----------|------|------|
| 1-5 | 1-10 | 1-2 min | $0.10-0.50 |
| 5-10 | 10-25 | 2-5 min | $0.50-1.25 |
| 10-20 | 25-50 | 5-10 min | $1.25-2.50 |
| 20-50 | 50-100 | 10-20 min | $2.50-5.00 |

### Success Rates
- **Scraping Success**: 95%+ (Firecrawl reliability)
- **Product Discovery**: 85%+ (AI accuracy)
- **Image Extraction**: 90%+ (depends on website structure)

## 🚨 Troubleshooting

### Enable Debug Logging

```typescript
// In Edge Function
console.log('🔍 Debug: Session data:', session);
console.log('🔍 Debug: Markdown length:', markdown.length);
```

### Check Database State

```sql
-- Session status
SELECT status, progress_percentage, error_message
FROM scraping_sessions
WHERE id = 'session-id';

-- Webhook calls
SELECT * FROM scraping_sessions
WHERE id = 'session-id'
  AND scraping_config->>'webhook_retry_count' IS NOT NULL;
```

### Manual Retry

```bash
# Retry failed session
curl -X POST "https://v1api.materialshub.gr/api/scraping/session/{session_id}/retry" \
  -H "Authorization: Bearer mk_your_api_key"
```

## 📚 Related Documentation

- [Product Discovery Architecture](./product-discovery-architecture.md)
- [Web Scraping Authentication](./web-scraping-authentication.md)
- [Job Queue System](./job-queue-system.md)
- [API Documentation](./api-docs.md)

## 🆘 Support

For issues or questions:
1. Check this guide first
2. Review Edge Function logs
3. Check Python API logs
4. Contact support with session ID


