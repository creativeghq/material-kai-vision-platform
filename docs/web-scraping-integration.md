# Web Scraping Integration Guide

> **📚 Related Documentation:**
> - [Async Processing & Limits](./async-processing-and-limits.md) - Concurrency limits and async architecture
> - [Product Discovery Architecture](./product-discovery-architecture.md) - AI-powered product extraction
> - [Data Import System](./data-import-system.md) - Unified import hub

## 🌐 Overview

The Material Kai Vision Platform now supports **automatic product discovery from web scraping** using Firecrawl integration. This feature allows you to scrape product catalogs from manufacturer websites and automatically create products with AI-powered metadata extraction.

### Async Processing

Web scraping uses **fully async processing** with the same concurrency limits as PDF processing:
- ✅ 5 concurrent Qwen Vision requests (image classification)
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

Invoke the `scrape-session-manager` Supabase Edge Function with a request body containing `url`, `workspace_id`, `scraping_service` ('firecrawl'), and an optional `max_pages` limit.

### 2. Monitor Progress

Subscribe to the `scraping_sessions` table via Supabase real-time, filtering on the specific `session_id`, to receive progress updates including the `progress_percentage` field.

### 3. View Results

Query the `products` table filtering by `source_type = 'web_scraping'` and `source_id = sessionId` to fetch all products created from a specific scraping session.

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

The scraping configuration accepts: `url` (website URL to scrape), `workspace_id`, `scraping_service` (currently only 'firecrawl'), optional `max_pages` (default: 10), optional `categories` array (default: ['products']), and optional `model` ('claude', 'gpt', or 'haiku', default: 'claude').

### Discovery Options

The discovery configuration accepts: `categories` array (['products', 'certificates', 'logos']), `model` string ('claude', 'gpt', or 'haiku'), and `workspace_id`.

## 📊 Monitoring & Debugging

### Check Session Status

Send a GET request to `https://v1api.materialshub.gr/api/scraping/session/{session_id}/status` with your authorization token.

### View Scraping Logs

Query the `scraping_sessions` table by session ID to check session status. Query `scraping_pages` filtering by `session_id` to inspect individual page statuses and markdown lengths. Query `products` filtering by `source_type = 'web_scraping'` and `source_id` to see created products with their source URLs.

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

Add debug console.log statements in the Edge Function to output session data and markdown lengths during processing.

### Check Database State

Query `scraping_sessions` by session ID to check status, progress percentage, and error message. Query sessions with non-null `scraping_config->>'webhook_retry_count'` to find sessions that have experienced webhook retries.

### Manual Retry

Send a POST request to `https://v1api.materialshub.gr/api/scraping/session/{session_id}/retry` with your authorization token.

---

## 🛡️ Production Hardening

Web Scraping implements **complete production hardening** for reliability and monitoring:

### Source Tracking ✅

Every product, chunk, and image is tagged with source information. Products, chunks, and images all receive `source_type: 'web_scraping'` and `source_job_id: session_id` fields.

**Benefits:**
- Filter Materials Data page by specific scraping session
- Trace any data back to its source website
- Delete all data from a specific scraping session
- Audit data quality by source

---

### Heartbeat Monitoring ✅

Updates `last_heartbeat_at` field **every 30 seconds** to detect stuck jobs. The update writes the current timestamp and current status, plus session metadata (pages scraped, products found) to the `scraping_sessions` table.

**Implementation:**
- Location: `scrape-session-manager` Edge Function
- Frequency: Every 30 seconds during scraping
- Stuck Threshold: >5 minutes without heartbeat
- Auto-Recovery: Automatic retry of stuck sessions

---

### Sentry Error Tracking ✅

Comprehensive error tracking and performance monitoring. The implementation uses Sentry transaction tracking with `op: 'web_scraping'` and tags for session and workspace IDs, breadcrumbs for each page scraped, exception capture on error, and transaction status set to 'ok' on success or 'internal_error' on failure.

**Features:**
- Transaction tracking for performance monitoring
- Breadcrumbs for scraping progress context
- Exception capture with full stack traces
- Firecrawl API metrics
- Performance bottleneck identification

---

### Production Hardening Status

| Feature | Status | Details |
|---------|--------|---------|
| **Source Tracking** | ✅ COMPLETE | All tables have `source_type='web_scraping'` and `source_job_id` |
| **Heartbeat Monitoring** | ✅ COMPLETE | Updates every 30s, 5-minute stuck threshold |
| **Sentry Tracking** | ✅ COMPLETE | Transactions, breadcrumbs, exception capture |
| **Error Handling** | ✅ COMPLETE | Comprehensive try-catch with Sentry integration |
| **Progress Tracking** | ✅ COMPLETE | Real-time progress updates via `scraping_sessions` table |
| **Checkpoint Recovery** | ✅ COMPLETE | Resume from last scraped page |
| **Auto-Recovery** | ✅ COMPLETE | Automatic retry of stuck/failed sessions |

---

## 📚 Related Documentation

- [Product Discovery Architecture](./product-discovery-architecture.md)
- [Web Scraping Authentication](./web-scraping-authentication.md)
- [Job Queue System](./job-queue-system.md)
- [API Documentation](./api-docs.md)
- [Unified Product Generation Flow](./unified-product-generation-flow.md) - Complete production hardening details

## 🆘 Support

For issues or questions:
1. Check this guide first
2. Review Edge Function logs
3. Check Python API logs
4. Contact support with session ID
