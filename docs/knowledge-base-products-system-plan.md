# Knowledge Base & Products System - Comprehensive Plan

**Document Version**: 1.0  
**Date**: 2025-10-19  
**Status**: Requirements & Architecture Planning

---

## 📋 Executive Summary

This document outlines a comprehensive plan to:
1. **Fix critical Knowledge Base UI/UX issues** (12 identified problems)
2. **Implement a new "Products" system** that builds on processed materials
3. **Establish proper embedding-to-product relationships** for intelligent search and recommendations
4. **Create a unified Materials page** for end-user discovery and filtering

---

## 🔴 CRITICAL ISSUES - KNOWLEDGE BASE (Current State)

### Issue 1: Documents by Source - Incomplete Display
**Problem**: Section doesn't properly list PDFs with full details (name, filename, metadata)
**Impact**: Users can't identify which PDFs were processed
**Solution**: Enhance to show: filename, upload date, file size, page count, processing status

### Issue 2: Chunks - Missing Context Information
**Problem**: Chunks don't display which PDF they belong to or related metadata
**Impact**: Can't trace chunk origin or understand relationships
**Solution**: Add: source PDF name, page number, chunk position, related chunks count

### Issue 3: Embeddings - False "No Embedding" Messages
**Problem**: Shows "No embedding generated" even though embeddings should exist
**Impact**: Misleading status, unclear if embeddings are actually stored
**Solution**: Verify embedding generation and display actual embedding metadata (model, dimensions, timestamp)

### Issue 4: Related Chunks - Not Visible
**Problem**: No way to see which chunks are semantically related
**Impact**: Can't verify content relationships or chunk quality
**Solution**: Show related chunks with similarity scores and connection reasons

### Issue 5: Images - Not Displayed in Knowledge Base
**Problem**: Images section is empty despite images being extracted
**Impact**: Can't verify image extraction or see extracted content
**Solution**: Display images with metadata, source chunk, page number, confidence scores

### Issue 6: Image Metadata - Incomplete
**Problem**: Images lack proper metadata (category, relationships, source details)
**Impact**: Can't understand image context or relationships
**Solution**: Show: image type, source chunk, related chunks, OCR text, analysis results

### Issue 7: UI/UX - Accordions Instead of Modals
**Problem**: Current accordion-based UI is cluttered and hard to navigate
**Impact**: Poor user experience, information overload
**Solution**: Convert to modal-based interface (like PDF upload modal) for focused viewing

### Issue 8: Embeddings - Unclear Content Type
**Problem**: Embeddings don't show what they represent (text, image, hybrid)
**Impact**: Can't understand embedding purpose or quality
**Solution**: Display: embedding type, source content, model used, dimensions, generation timestamp

### Issue 9: PDF Upload - Duplicate Close Buttons
**Problem**: Two X buttons, only one works properly
**Impact**: Confusing UX, inconsistent behavior
**Solution**: Keep single, properly functioning close button

### Issue 10: Metadata - Eye Icon Non-Functional
**Problem**: Clicking eye icon on metadata does nothing
**Impact**: Can't view detailed metadata information
**Solution**: Implement metadata detail modal showing: relationships, categories, connections

### Issue 11: Metadata - Missing Relationships
**Problem**: Metadata doesn't show connections to chunks, images, or embeddings
**Impact**: Can't understand data relationships or dependencies
**Solution**: Show: related chunks, associated images, embedding references, category links

### Issue 12: Processing Status - Not Updatable
**Problem**: Processing status doesn't reflect real-time updates
**Impact**: Stale information, unclear current state
**Solution**: Implement real-time status polling and updates

---

## 🟢 NEW FEATURE - PRODUCTS SYSTEM

### Overview
A "Products" tab in Knowledge Base that transforms processed materials into structured product records with:
- Complete material details (name, description, properties, images)
- Embeddings for intelligent search
- Relationships to source PDFs and chunks
- Metadata and categorization
- User-facing Materials page for discovery

### Architecture

#### Database Schema Additions

```sql
-- Products table (built from processed materials)
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  category_id UUID REFERENCES material_categories(id),
  source_document_id UUID REFERENCES documents(id),
  source_chunks JSONB, -- Array of chunk IDs this product was built from
  
  -- Material properties
  properties JSONB, -- Material-specific properties
  specifications JSONB, -- Technical specifications
  metadata JSONB, -- Custom metadata
  
  -- Embeddings
  embedding VECTOR(1536), -- Product-level embedding
  embedding_model TEXT DEFAULT 'text-embedding-3-small',
  
  -- Status & tracking
  status TEXT DEFAULT 'draft', -- draft, published, archived
  created_from_type TEXT, -- 'pdf_processing', 'xml_import', 'manual', 'scraping'
  created_by UUID REFERENCES auth.users(id),
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product images (one-to-many)
CREATE TABLE product_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  image_id UUID REFERENCES document_images(id), -- Link to source image if from PDF
  image_url TEXT NOT NULL,
  image_type TEXT, -- primary, texture, sample, installation, etc.
  display_order INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product embeddings (for multi-type embeddings)
CREATE TABLE product_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  embedding_type TEXT, -- 'text', 'image', 'hybrid', 'clip'
  embedding VECTOR(1536),
  source_content TEXT, -- What was embedded
  model_name TEXT,
  dimensions INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product-to-chunk relationships
CREATE TABLE product_chunk_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  relationship_type TEXT, -- 'source', 'reference', 'related'
  relevance_score NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

## 🔄 EMBEDDING & SEARCH FLOW

### Current State
1. PDF uploaded → chunks created → embeddings generated → stored in `document_vectors`
2. Search queries → embedding generated → vector similarity search → results returned
3. Agents use search results for recommendations

### Proposed Enhancement
1. **PDF Processing** → Chunks + Embeddings (existing)
2. **Product Creation** → Build product from chunks + generate product embedding
3. **Product Embedding** → Stored in `product_embeddings` table
4. **Search Flow**:
   - User searches → Query embedding generated
   - Search both `document_vectors` (chunks) AND `product_embeddings` (products)
   - Return unified results with product suggestions
5. **Agent Recommendations**:
   - Agent receives search results
   - Agent identifies matching products
   - Agent suggests products with reasoning
   - Products displayed in Materials page

---

## 📊 KNOWLEDGE BASE UI IMPROVEMENTS

### New Modal-Based Layout

**Tab Structure**:
1. **Overview** - Statistics and document summary
2. **Documents** - PDF sources with full metadata
3. **Chunks** - Text chunks with relationships
4. **Images** - Extracted images with metadata
5. **Embeddings** - Embedding details and statistics
6. **Products** - NEW - Built products from materials
7. **Metadata** - Functional metadata with relationships

### Modal Components

Each section opens in a modal with:
- Detailed information display
- Related items sidebar
- Metadata panel
- Action buttons (edit, delete, export)
- Real-time status updates

---

## 🎯 MATERIALS PAGE (User-Facing)

### Purpose
Public-facing page where users can:
- Browse processed materials/products
- Filter by category, properties, source
- View product details with images
- Search using embeddings
- Get AI recommendations

### Features
- Category-based filtering
- Property-based search
- Image gallery
- Product details modal
- Related products suggestions
- Export/download options

---

## 🔗 RELATIONSHIPS & DATA FLOW

```
PDF Document
  ├─ Chunks (text segments)
  │  ├─ Embeddings (text vectors)
  │  ├─ Images (extracted visuals)
  │  │  └─ Image Embeddings (visual vectors)
  │  └─ Metadata (properties, categories)
  │
  └─ Product (built from chunks)
     ├─ Product Embedding (unified vector)
     ├─ Product Images (from source images)
     ├─ Product Metadata (consolidated)
     └─ Product Embeddings (multi-type)
```

---

## 📈 IMPLEMENTATION PHASES

### Phase 1: Fix Knowledge Base Issues (Weeks 1-2)
- Fix all 12 UI/UX issues
- Implement modal-based interface
- Add real-time status updates
- Verify embedding display

### Phase 2: Database & Products Foundation (Weeks 2-3)
- Create products tables
- Implement product CRUD APIs
- Create product-chunk relationships
- Set up product embedding generation

### Phase 3: Product Creation Workflow (Weeks 3-4)
- Implement product builder from chunks
- Auto-generate product embeddings
- Create product management UI
- Implement product publishing workflow

### Phase 4: Materials Page & Search (Weeks 4-5)
- Build Materials page UI
- Implement product search
- Add filtering and categorization
- Integrate with agent recommendations

### Phase 5: Integration & Testing (Weeks 5-6)
- End-to-end testing
- Performance optimization
- Documentation
- Deployment

---

## ✅ SUCCESS CRITERIA

1. **Knowledge Base**: All 12 issues resolved, modal UI implemented
2. **Products**: 100+ products can be created and managed
3. **Search**: Products appear in search results with proper ranking
4. **Materials Page**: Users can discover and filter products
5. **Embeddings**: All products have embeddings, search works accurately
6. **Performance**: Search <500ms, page load <2s
7. **Documentation**: Complete API and UI documentation

---

## 🚀 NEXT STEPS

1. Review and approve this plan
2. Create detailed task breakdown
3. Begin Phase 1 (Knowledge Base fixes)
4. Set up database migrations
5. Implement incrementally with testing at each phase

