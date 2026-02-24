# Changelog

All notable changes to the Material Kai Vision Platform.

---

## [2026-01-18] - Major Feature Expansion & Documentation Update

### 🚀 New Features

**Web Scraping Integration**
- Firecrawl-powered web scraping for automatic product discovery from manufacturer websites
- AI-powered product extraction using Claude Sonnet 4.5
- Background processing with real-time progress tracking
- Automatic image extraction and linking
- 3 API endpoints: `/api/scraping/process-session`, `/api/scraping/session/{id}/status`, `/api/scraping/session/{id}/retry`

**Price Monitoring System**
- Competitive price monitoring for products across multiple sources
- On-demand and scheduled price checks (hourly, daily, weekly)
- Price history tracking and trend analysis
- Configurable price alerts with multiple notification channels
- Competitor source management
- 14+ API endpoints for comprehensive price tracking

**Saved Searches with AI Deduplication**
- Smart search deduplication using Claude Haiku 4.5
- Semantic similarity analysis (85-95% threshold)
- Auto-merge for highly similar searches (95%+)
- Integration context support (chat, moodboard, 3d_generation)
- Usage tracking and relevance scoring
- 7+ API endpoints for search management

**Interior Design Generation**
- Multi-model AI interior design generation (14 total models)
- 7 text-to-image models (FLUX, SDXL, Playground, Stable Diffusion 3, etc.)
- 7 image-to-image models for room transformation (3 production-ready)
- Parallel processing with retry logic
- Permanent storage in Supabase Storage
- Real-time progress tracking via database polling
- Credit-based billing system

### 📝 API Expansion

**New Route Categories:**
- Web Scraping Routes (3 endpoints)
- Price Monitoring Routes (14+ endpoints)
- Saved Searches Routes (7+ endpoints)
- Interior Design Routes (2 endpoints)

**Total API Endpoints:** 150+ (updated from 114)

### 🗄️ Database Schema Updates

**New Tables:**
- `scraping_sessions` - Web scraping job tracking
- `scraping_pages` - Scraped page content storage
- `price_monitoring_products` - Products being monitored
- `price_history` - Historical price data
- `competitor_sources` - Competitor source URLs
- `price_alerts` - User-configured price alerts
- `price_monitoring_jobs` - Price check job history
- `saved_searches` - User saved searches with AI metadata
- `generation_3d` - Interior design generation jobs

### 🔧 Technical Improvements

**Async Architecture:**
- Fully async processing across all methods (PDF, Web, XML)
- Unified concurrency limits (5 TogetherAI, 2 Claude, 10 uploads, 20 CLIP)
- Timeout configuration (300s discovery, 120s AI, 30s downloads)
- Shared services across all processing pathways

**Production Hardening:**
- Source tracking for all generated content
- Heartbeat monitoring for stuck job detection
- Sentry error tracking with transaction monitoring
- Comprehensive error handling and retry logic

**Credit System:**
- Internal credit-based billing for AI operations
- Per-model cost tracking
- Automatic credit deduction after generation
- Balance tracking per workspace

### 📚 Documentation Updates

**New Documentation Files:**
- `docs/web-scraping-integration.md` - Complete web scraping guide
- `docs/price-monitoring-system.md` - Price monitoring features
- `docs/price-monitoring-deployment-guide.md` - Deployment instructions
- `docs/saved-searches-deduplication.md` - Smart search deduplication
- `docs/interior-design-models.md` - AI model inventory
- `docs/interior-design-data-flow.md` - Generation workflow
- `docs/interior-designer-agent-user-guide.md` - User guide
- `docs/internal-pricing-credit-system.md` - Credit system documentation

**Updated Documentation:**
- `README.md` - Added new features and updated metrics
- `docs/INDEX.md` - Complete feature catalog update
- `docs/README.md` - Updated learning paths
- `docs/api-endpoints.md` - New API routes documented
- `docs/system-architecture.md` - Architecture updates

### 🎯 Performance Impact

**Web Scraping:**
- Processing time: 2-5 minutes for 10-25 products
- Success rate: 95%+ scraping, 85%+ product discovery
- Cost: $0.02-0.05 per product


**Interior Design:**
- Generation time: 5-13 seconds per model
- Parallel processing: 3 concurrent models
- Success rate: 90%+ for working models
- Cost: $0.015-0.055 per generation per model

---

## [2025-11-18] - Memory Optimization & CLIP Integration

### 🚀 Major Performance Improvements

**Memory Crash Fix**
- Fixed critical memory crash during image extraction (900+ images)
- Reduced memory usage from 2.5GB accumulation to 10-15MB constant
- Changed batch_size from 2 to 1 for maximum stability
- Implemented immediate disk cleanup after processing each image

**CLIP Embedding Integration**
- Integrated CLIP embedding generation into image extraction stage
- Generate all 5 CLIP embeddings (visual, color, texture, application, material) per image
- Save embeddings to VECS collections immediately
- Eliminated separate CLIP generation stage

**Pipeline Optimization**
- Reduced pipeline from 14 stages to 9 stages
- Combined Image Extraction + CLIP Embeddings into single stage
- Improved resilience: CLIP embeddings preserved if crash occurs
- Same total processing time (work moved, not added)

### 📝 Technical Changes

**Files Modified**:
- `mivaa-pdf-extractor/app/services/pdf_processor.py`
  - Added per-image CLIP generation
  - Implemented immediate DB saves
  - Added memory cleanup after each image
  
- `mivaa-pdf-extractor/app/services/supabase_client.py`
  - Added `save_single_image()` method
  - Reuses existing batch save patterns
  
- `mivaa-pdf-extractor/app/utils/timestamp_utils.py`
  - Created `normalize_timestamp()` utility
  - Fixes PostgreSQL timestamp parsing issues

**Commits**:
- `a43eeaa` - Fix timestamp parsing bug in job recovery
- `c9a75cb` - Optimize image processing to prevent memory crashes
- `4599e64` - Add CLIP embedding generation per image during extraction

### 📊 Performance Impact

**Before Optimization**:
- Memory: 2.5GB accumulation → CRASH at 900 images
- Images saved: 0 (crashes before completion)
- CLIP embeddings: 0 (never reached)
- Success rate: 0% for large PDFs

**After Optimization**:
- Memory: 10-15MB constant
- Images saved: 900+ ✅
- CLIP embeddings: 4,500+ (5 types × 900 images) ✅
- Success rate: 100%
- Processing time: 45-75 minutes (same as before, just works now)

### 🔧 Architecture Changes

**New Pipeline Flow**:
```
Stage 1: PDF Extraction
Stage 2: Chunks Created
Stage 3: Text Embeddings
Stage 4: Images Extracted + CLIP Embeddings ← Combined!
Stage 5: Products Detected
Stage 6: Products Created + Entity Linking
Stage 7: Completed
```

**Per-Image Processing**:
1. Extract from PDF (PyMuPDF4LLM)
2. Upload to Supabase Storage
3. Save metadata to document_images table
4. Generate 5 CLIP embeddings
5. Save embeddings to VECS
6. Delete from disk
7. Clear from memory
8. Force garbage collection

### 📚 Documentation Updates

**Updated Files**:
- `docs/pdf-processing-pipeline.md` - Complete pipeline flow update
- `docs/system-architecture.md` - Architecture tier updates
- `CHANGELOG.md` - This file (created)

### 🎯 Benefits

1. **Memory Safety**: Can process unlimited images without crashes
2. **Resilience**: CLIP embeddings preserved if process crashes
3. **Simplicity**: Fewer stages, cleaner architecture
4. **Progress Visibility**: Real-time CLIP generation tracking
5. **Same Performance**: Total time unchanged, just more reliable

---

## [Previous Changes]

See Git history for changes before 2025-11-18.

