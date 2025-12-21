# Web Scraping Implementation Analysis

## 🔍 Current Implementation Overview

### Architecture
Your platform uses a **hybrid architecture** combining:
1. **Firecrawl API** (Cloud service) - Primary scraping engine
2. **Jina Reader API** (Fallback) - Alternative scraping service
3. **Python FastAPI Backend** - Product discovery and processing
4. **Supabase Edge Functions** - Orchestration and session management

---

## 📋 Current Scraping Flow (Step-by-Step)

### **Step 1: User Initiates Scraping** (Frontend)
**File:** `src/components/Scraper/NewScraperPage.tsx`

**Scraping Modes Available:**
1. **Single Page** - Scrape one URL
2. **Sitemap** - Scrape from sitemap.xml
3. **Crawl** - Crawl entire website (up to max pages)
4. **Search** - Search web and scrape results
5. **Map** - Get all URLs from a website

**User Input:**
- URL or search query
- Max pages (for crawl mode)
- Extraction prompt (optional)
- Service selection (Firecrawl or Jina)

---

### **Step 2: Session Creation** (Edge Function)
**File:** `supabase/functions/scrape-session-manager/index.ts`

**What Happens:**
1. Creates `scraping_sessions` record in database
2. Creates `scraping_pages` records for each URL to scrape
3. Sets status to `pending`
4. Returns session ID to frontend

**Database Tables:**
```sql
scraping_sessions:
- id, workspace_id, status, total_pages, pages_scraped, materials_processed

scraping_pages:
- id, session_id, url, status, markdown_content, images
```

---

### **Step 3: Page Scraping** (Edge Function → Firecrawl/Jina)
**File:** `supabase/functions/scrape-single-page/index.ts`

**Process:**
1. Fetches pending pages from `scraping_pages` table
2. Processes in batches (configurable batch size)
3. For each page:
   - Calls Firecrawl API or Jina API
   - Extracts markdown content
   - Downloads images
   - Stores in `scraping_pages` table
4. Updates progress in `scraping_sessions`

**Firecrawl API Call:**
```typescript
POST https://api.firecrawl.dev/v1/scrape
{
  url: "https://example.com",
  formats: ["markdown", "html"],
  timeout: 30000,
  extractorOptions: {
    mode: "llm-extraction",
    extractionPrompt: "Extract material information..."
  }
}
```

**Jina API Call (Fallback):**
```typescript
GET https://r.jina.ai/{url}
Headers: {
  Authorization: "Bearer {JINA_API_KEY}",
  X-Return-Format: "markdown"
}
```

---

### **Step 4: Product Discovery** (Python API)
**File:** `mivaa-pdf-extractor/app/services/web_scraping_service.py`

**Process:**
1. Fetches all scraped markdown from `scraping_pages`
2. Combines markdown content
3. Calls `ProductDiscoveryService.discover_products_from_text()`
4. Uses Claude AI to extract product information
5. Creates products in database
6. Links images to products
7. Updates session status to `completed`

**AI Model:** Claude (Anthropic)
**Timeout:** 5 minutes for product discovery
**Retry Logic:** 3 attempts with exponential backoff

---

## 🆚 Firecrawl v1 vs v2 Comparison

### **Current Implementation: Firecrawl v1**
Your code uses:
```typescript
POST /v1/scrape
{
  url: string,
  formats: ["markdown", "html"],
  extractorOptions: {
    mode: "llm-extraction",
    extractionPrompt: string
  }
}
```

### **Firecrawl v2 (Latest)**
New API structure:
```typescript
POST /v2/scrape
{
  url: string,
  formats: ["markdown", "html", "screenshot"],
  actions: [  // NEW: Browser automation
    { type: "wait", milliseconds: 1000 },
    { type: "click", selector: "button" },
    { type: "screenshot" }
  ],
  extract: {  // NEW: Structured extraction
    schema: {...},
    systemPrompt: string
  }
}
```

---

## 🚨 Key Differences (v1 vs v2)

### **1. Actions (Browser Automation)** ⭐ NEW
v2 adds powerful browser automation:
- `wait` - Wait for elements/time
- `click` - Click elements
- `write` - Fill forms
- `press` - Press keys
- `screenshot` - Take screenshots
- `scroll` - Scroll page

**Use Case:** Scrape pages behind login, infinite scroll, dynamic content

### **2. Structured Extraction** ⭐ IMPROVED
v1: Basic LLM extraction with prompt
v2: Schema-based extraction with validation

```typescript
// v2 Example
extract: {
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      price: { type: "number" },
      images: { type: "array", items: { type: "string" } }
    },
    required: ["name"]
  }
}
```

### **3. Batch Scraping** ⭐ NEW
v2 adds native batch scraping:
```typescript
POST /v2/batch/scrape
{
  urls: ["url1", "url2", ...],
  formats: ["markdown"]
}
```

### **4. Crawl Improvements** ⭐ IMPROVED
v2 has better crawl control:
- `limit` - Max pages to crawl
- `maxDepth` - How deep to crawl
- `allowBackwardLinks` - Follow links to parent pages
- `allowExternalLinks` - Follow external domains
- `ignoreSitemap` - Skip sitemap.xml

### **5. Map Endpoint** ⭐ NEW
v2 adds dedicated map endpoint:
```typescript
POST /v2/map
{
  url: "https://example.com",
  search: "products"  // Optional: filter URLs
}
```

---

## ✅ Recommendations

### **Option 1: Stay on v1 (Current)**
**Pros:**
- ✅ Working implementation
- ✅ No migration needed
- ✅ Stable API

**Cons:**
- ❌ Missing browser automation
- ❌ Missing structured extraction
- ❌ Missing batch scraping
- ❌ v1 may be deprecated soon

### **Option 2: Migrate to v2** ⭐ RECOMMENDED
**Pros:**
- ✅ Browser automation (login, forms, infinite scroll)
- ✅ Better structured extraction
- ✅ Native batch scraping
- ✅ Future-proof
- ✅ Better performance

**Cons:**
- ⚠️ Requires code changes
- ⚠️ Testing needed

---

## 🔧 Migration Plan (If Upgrading to v2)

### **Phase 1: Update Edge Function**
File: `supabase/functions/scrape-single-page/index.ts`

**Changes:**
1. Update API endpoint: `/v1/scrape` → `/v2/scrape`
2. Update request body structure
3. Add `actions` support for dynamic pages
4. Add `extract.schema` for structured data

### **Phase 2: Update Python Service**
File: `mivaa-pdf-extractor/app/services/web_scraping_service.py`

**Changes:**
1. Handle new response format
2. Parse structured extraction results
3. Update error handling

### **Phase 3: Add Preview Support**
Similar to XML preview, add scraping preview:
1. Scrape 1 sample page
2. Show extracted product preview
3. User confirms before full scrape

---

## 📊 Current vs Recommended Flow

### **Current Flow:**
```
User Input → Session Creation → Scrape Pages (v1) → Store Markdown → 
AI Discovery → Create Products
```

### **Recommended Flow (v2):**
```
User Input → Session Creation → Scrape Sample (v2) → Preview Product → 
User Confirms → Scrape All Pages (v2 Batch) → AI Discovery → Create Products
```

**Benefits:**
- ✅ Preview before full scrape (like XML)
- ✅ Faster batch scraping
- ✅ Better data quality with schema validation
- ✅ Support for complex pages (login, forms)

---

## 🎯 Conclusion

**Your current implementation is GOOD but using v1 API.**

**Recommendation:** Migrate to Firecrawl v2 for:
1. **Browser automation** - Handle dynamic content, logins, forms
2. **Structured extraction** - Better data quality
3. **Batch scraping** - Faster processing
4. **Future-proofing** - v1 may be deprecated

**Priority:** MEDIUM (not urgent, but beneficial)

**Estimated Effort:** 2-3 days
- Day 1: Update Edge Function to v2
- Day 2: Update Python service + testing
- Day 3: Add preview feature

Would you like me to start the migration to Firecrawl v2?

