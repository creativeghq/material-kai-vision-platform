# Admin Knowledge Base - User Guide

## Overview

The Admin Knowledge Base is a comprehensive dashboard for monitoring and analyzing the quality, metadata, embeddings, and insights of your material recognition platform's knowledge base.

**Access:** Navigate to `/admin/knowledge-base` from the admin panel.

---

## Features

### 1. **Overview Tab**
- **Purpose:** High-level statistics and quick access to all knowledge base entities
- **Displays:**
  - Total documents, chunks, images, embeddings, products
  - Average chunk size and confidence scores
  - Quick navigation to detailed views

### 2. **Chunks Tab**
- **Purpose:** View and search all document chunks
- **Features:**
  - Search by content, chunk index, or document name
  - Pagination (20 items per page)
  - Quality scores display
  - Related embeddings count
  - Document source information

### 3. **Images Tab**
- **Purpose:** Browse extracted images from documents
- **Features:**
  - Grid view with thumbnails
  - Image metadata (caption, context, heading)
  - Related chunks display
  - Quality validation scores
  - Delete functionality

### 4. **Embeddings Tab**
- **Purpose:** Explore vector embeddings for semantic search
- **Features:**
  - Embedding type (text, image, hybrid)
  - Model information
  - Dimensions and metadata
  - Associated chunk/image references

### 5. **Products Tab**
- **Purpose:** View products extracted from materials
- **Features:**
  - Product name, description, metadata
  - Quality and confidence scores
  - Associated images and chunks
  - Completeness assessment

### 6. **Metadata Tab** ⭐ NEW
- **Purpose:** Centralized metadata management across all entities
- **Features:**
  - **Summary Stats:** Total entities, entities with metadata, unique fields
  - **Metadata Fields:** All unique metadata fields with badges
  - **Chunks Metadata:** 20 chunks with quality scores and metadata
  - **Images Metadata:** 10 images with metadata in grid view
  - **Products Metadata:** 20 products with quality badges
  - **Navigation:** Click "View" buttons to jump to entity details

### 7. **Quality Scores Tab** ⭐ NEW
- **Purpose:** Comprehensive quality metrics and distributions
- **Features:**
  - **Chunks Quality KPIs:**
    - Total validated chunks
    - Average scores (overall, content, boundary, semantic, completeness)
    - Valid/invalid/needs review counts
  - **Quality Dimensions:** Content, Boundary, Semantic, Completeness
  - **Distribution Charts:** Excellent/Good/Fair/Poor breakdown
  - **Images Quality:** Quality, relevance, OCR confidence scores
  - **Products Quality:** Quality, confidence, completeness metrics
  - **Documents Quality:** Aggregate document-level metrics

### 8. **Embeddings Stats Tab** ⭐ NEW
- **Purpose:** Vector embedding coverage and quality metrics
- **Features:**
  - **Total Embeddings:** Count across all types
  - **By Type:** Text, image, hybrid embeddings
  - **By Model:** OpenAI, Cohere, custom models
  - **Coverage Metrics:**
    - Chunks: Total vs. with embeddings (percentage)
    - Images: Total vs. with embeddings (percentage)
    - Products: Total vs. with embeddings (percentage)
  - **Visual Indicators:** Progress bars for coverage percentages

### 9. **Detections Tab** ⭐ NEW
- **Purpose:** Detection event tracking and confidence monitoring
- **Features:**
  - **Timeline:** Recent detection events (last 50)
  - **Event Details:** Type, entity ID, confidence, timestamp
  - **Confidence Stats:** Average, min, max confidence scores
  - **Event Summary:** Total events by type (product, image, chunk)
  - **Filters:** By detection type, date range

### 10. **Quality Dashboard Tab** ⭐ NEW
- **Purpose:** Daily quality KPIs, trends, and alerts
- **Features:**
  - **Current KPIs:**
    - Total chunks, images, products, embeddings
    - Average quality scores
    - Coverage percentages
  - **Trends (30 days):**
    - Daily chunk creation
    - Daily image extraction
    - Daily product detection
    - Daily embedding generation
  - **Alerts:**
    - Low quality scores
    - Missing embeddings
    - Incomplete products
    - Processing errors
  - **Daily Metrics:** Historical data for performance tracking

### 11. **Insights Tab** ⭐ NEW
- **Purpose:** AI-driven patterns, anomalies, and recommendations
- **Features:**
  - **Patterns:** Detected patterns with severity levels
  - **Anomalies:** Unusual behaviors or data inconsistencies
  - **Recommendations:** Actionable suggestions for improvement
  - **Severity Indicators:** Critical, high, medium, low
  - **Impact Assessment:** Affected entities and potential fixes

---

## Real-Time Features

### Auto-Refresh
- **Toggle:** Click "Auto-Refresh ON/OFF" button in header
- **Interval:** 30 seconds (default)
- **Scope:** Refreshes all 6 new admin tabs simultaneously
- **Indicator:** Spinning icon when auto-refresh is enabled
- **Notifications:** Toast notification on each refresh

### Manual Refresh
- **Refresh All:** Refreshes all 6 admin tabs on demand
- **Reload Data:** Reloads base knowledge base data (chunks, images, products)
- **Last Updated:** Timestamp displayed in header

---

## Search & Filtering

### Search Functionality
- **Debounced Search:** 300ms delay for optimal performance
- **Search Scope:**
  - Chunks: Content, chunk index, document name
  - Images: Caption, contextual name, nearest heading
  - Products: Name, description
- **Real-Time:** Results update as you type (with debounce)

### Pagination
- **Chunks Tab:** 20 items per page
- **Navigation:** Previous/Next buttons
- **Total Pages:** Displayed in pagination controls

---

## Cross-Tab Navigation

### Quick Navigation
- **From Metadata Tab:** Click "View" buttons to jump to entity details
- **From Quality Scores Tab:** Click "View Insights" to see AI analysis
- **From Dashboard Tab:** Click "View All Patterns & Insights" for detailed recommendations
- **Smooth Scrolling:** Automatic scroll to target entity
- **Highlighting:** Visual feedback on navigation

---

## Performance Optimizations

### Built-In Optimizations
- **Memoization:** Filtered data cached to prevent re-computation
- **Debounced Search:** Reduces filtering operations during typing
- **Lazy Loading:** Data loaded on-demand for faster initial load
- **Pagination:** Large datasets split into manageable pages
- **useCallback:** Event handlers optimized to prevent re-renders

---

## Data Sources

All data is **live** from the database - **no mocks or fallbacks**:

### Database Tables
- `document_chunks` - Chunk data
- `document_images` - Image data
- `products` - Product data
- `embeddings` - Vector embeddings
- `chunk_validation_scores` - Chunk quality scores
- `image_validations` - Image quality validations
- `quality_scoring_logs` - Detection events
- `quality_metrics_daily` - Daily aggregated metrics
- `document_quality_metrics` - Document-level quality

### API Endpoints
- `/admin-kb-metadata` - Metadata management
- `/admin-kb-quality-scores` - Quality scores aggregation
- `/admin-kb-embeddings-stats` - Embeddings statistics
- `/admin-kb-detections` - Detection event tracking
- `/admin-kb-quality-dashboard` - Daily quality dashboard
- `/admin-kb-patterns` - Pattern detection & insights

---

## Best Practices

### Monitoring Quality
1. **Check Quality Scores Tab** regularly for quality trends
2. **Review Alerts** in Quality Dashboard for issues
3. **Investigate Low Scores** using cross-tab navigation
4. **Track Trends** over 30-day periods

### Optimizing Performance
1. **Use Search** to narrow down large datasets
2. **Enable Auto-Refresh** for live monitoring
3. **Review Insights Tab** for optimization recommendations
4. **Monitor Coverage** in Embeddings Stats tab

### Data Management
1. **Review Metadata Tab** for completeness
2. **Check Detections Tab** for confidence scores
3. **Use Cross-Tab Navigation** to explore relationships
4. **Export Data** using Download buttons (where available)

---

## Troubleshooting

### No Data Displayed
- **Check Workspace:** Ensure you're in the correct workspace
- **Reload Data:** Click "Reload Data" button
- **Check Permissions:** Verify admin access

### Slow Performance
- **Use Search:** Filter data instead of viewing all
- **Disable Auto-Refresh:** Turn off if not needed
- **Check Network:** Verify stable internet connection

### Missing Embeddings
- **Check Embeddings Stats Tab:** Review coverage percentages
- **Review Alerts:** Look for embedding generation errors
- **Reprocess Documents:** Trigger re-embedding if needed

---

## Keyboard Shortcuts

- **Search:** Click search box or use Tab to navigate
- **Pagination:** Use arrow keys when pagination is focused
- **Refresh:** Click refresh buttons or use browser refresh (F5)

---

## Support

For issues or questions:
1. Check this user guide
2. Review the Insights Tab for recommendations
3. Contact platform administrator
4. Check system logs for errors

---

**Last Updated:** 2025-10-25
**Version:** 1.0.0

