# Material Scraping Workflow Guide

## Quick Start

### Step 1: Enter Your URL
Start by entering the website URL or search query you want to scrape.

**Examples:**
- Single product page: `https://example.com/products/ceramic-tile-white`
- Sitemap: `https://example.com/sitemap.xml`
- Website to crawl: `https://example.com`
- Search query: `ceramic tiles suppliers Italy`

### Step 2: Choose Scraping Mode

#### 🎯 Single Page
**When to use:** Testing extraction on one specific page
- Perfect for: Product detail pages, sample testing
- Speed: Fastest (1 page)
- Best for: Initial testing before bulk scraping

**Example:** Scrape one product page to test field mappings

#### 🗺️ Sitemap
**When to use:** You have a sitemap.xml with product URLs
- Perfect for: E-commerce sites with sitemaps
- Speed: Fast (parallel processing)
- Best for: Bulk scraping known URLs

**Example:** `https://example.com/sitemap.xml` → scrapes all product URLs

#### 🕷️ Crawl
**When to use:** Auto-discover all pages on a website
- Perfect for: Unknown site structure
- Speed: Slower (sequential discovery)
- Best for: Comprehensive site scraping

**Example:** Start at homepage, find all product pages automatically

#### 🔍 Search
**When to use:** Find pages via search engines
- Perfect for: Finding suppliers across the web
- Speed: Medium (search + scrape)
- Best for: Market research, supplier discovery

**Example:** "marble suppliers Greece" → finds and scrapes relevant pages

#### 📋 Map
**When to use:** Get URL list without scraping content
- Perfect for: Planning, URL discovery
- Speed: Fastest (no content extraction)
- Best for: Site mapping before scraping

**Example:** Get all URLs from a website to review before scraping

### Step 3: Configure Field Mappings

Define what data to extract from each page:

**Standard Fields:**
- **Name** (required): Material/product name
- **Description**: Product description
- **Price**: Price with currency
- **Images**: Product images (URLs)
- **Category**: Material category (tiles, stone, wood, etc.)
- **Properties**: Dimensions, color, finish, etc.
- **Supplier**: Manufacturer/supplier name

**Custom Fields:**
You can add custom fields based on your needs.

### Step 4: Preview Extraction

Before running the full scrape:
1. System scrapes one sample page
2. Shows extracted materials
3. You review the data quality
4. Adjust field mappings if needed
5. Confirm to proceed

### Step 5: Run Full Scrape

Once confirmed:
- System processes all pages
- Extracts materials using AI
- Creates embeddings for search
- Chunks data for AI processing
- Stores in database

## Scraping Mode Comparison

| Feature | Single Page | Sitemap | Crawl | Search | Map |
|---------|-------------|---------|-------|--------|-----|
| **Speed** | ⚡⚡⚡ | ⚡⚡ | ⚡ | ⚡⚡ | ⚡⚡⚡ |
| **Pages** | 1 | 10-1000 | 10-1000 | 10-100 | 100-10000 |
| **Discovery** | Manual | Sitemap | Auto | Search | Auto |
| **Best For** | Testing | Bulk | Unknown | Research | Planning |
| **Complexity** | Simple | Medium | High | Medium | Low |

## Configuration Tips

### Firecrawl Options

#### Essential Settings:
- **LLM Extraction**: ✅ Always ON (best accuracy)
- **Remove Base64 Images**: ❌ Always OFF (we need images!)
- **Main Content Only**: ✅ ON (cleaner extraction)
- **Wait For**: 2000ms (dynamic content)
- **Block Ads**: ✅ ON (cleaner data)

#### Output Formats:
- **Markdown**: ✅ Recommended (structured text)
- **HTML**: ✅ Recommended (preserves structure)
- **Links**: Optional (for crawling)
- **Screenshot**: Optional (visual verification)

### Performance Settings:
- **Timeout**: 30000ms (30 seconds per page)
- **Retry Count**: 3 (automatic retries)
- **Concurrent Pages**: 5 (parallel processing)

## Common Workflows

### Workflow 1: Test Single Product
1. Mode: **Single Page**
2. URL: One product page
3. Preview: Review extraction
4. Adjust: Fix field mappings
5. Scale: Switch to Sitemap/Crawl mode

### Workflow 2: Bulk Scrape E-commerce
1. Mode: **Sitemap**
2. URL: `https://example.com/sitemap.xml`
3. Max Pages: 100
4. Preview: Test on first page
5. Run: Process all pages

### Workflow 3: Discover Suppliers
1. Mode: **Search**
2. Query: "ceramic tile suppliers Spain"
3. Max Results: 20
4. Preview: Review found pages
5. Run: Scrape all results

### Workflow 4: Map Then Scrape
1. Mode: **Map**
2. URL: `https://example.com`
3. Get: All URLs
4. Review: Filter product URLs
5. Switch: Use Sitemap mode with filtered URLs

## Troubleshooting

### No Materials Found
- ✅ Check if page has product data
- ✅ Verify LLM extraction is enabled
- ✅ Adjust extraction prompt
- ✅ Review field mappings

### Missing Images
- ✅ Ensure "Remove Base64 Images" is OFF
- ✅ Check if images are in HTML
- ✅ Verify image URLs are valid

### Timeout Errors
- ✅ Increase timeout setting
- ✅ Reduce concurrent pages
- ✅ Check website speed

### Rate Limit Errors
- ✅ Reduce concurrent pages
- ✅ Add delays between requests
- ✅ Check Firecrawl plan limits

## Best Practices

### Before Scraping:
1. ✅ Test with single page first
2. ✅ Review website's robots.txt
3. ✅ Set reasonable page limits
4. ✅ Configure field mappings
5. ✅ Preview before full scrape

### During Scraping:
1. ✅ Monitor progress
2. ✅ Check for errors
3. ✅ Review extracted data
4. ✅ Adjust if needed

### After Scraping:
1. ✅ Verify data quality
2. ✅ Check image URLs
3. ✅ Review embeddings
4. ✅ Test search functionality

## Next Steps

After successful scraping:
1. **Materials Created**: View in Materials section
2. **Embeddings Generated**: Ready for AI search
3. **Chunks Created**: Optimized for AI processing
4. **Search Enabled**: Find materials semantically

## Support

For issues or questions:
- Check Firecrawl documentation
- Review error messages
- Test with single page mode
- Adjust configuration settings
