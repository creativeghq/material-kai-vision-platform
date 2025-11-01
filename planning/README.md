# Category-Based Extraction System - Planning Documentation

## Overview

This directory contains comprehensive planning documentation for the **Category-Based Extraction System**, a major architectural redesign of the PDF processing pipeline.

---

## Problem Statement

### **Current Issues**

1. **Boolean `focused_extraction` is too simplistic**
   - Only True/False, doesn't specify WHAT to extract
   - Assumes "products" is the only category
   - Doesn't support future categories (certificates, logos, specifications)

2. **Two conflicting endpoints**
   - `/documents/upload-with-discovery` - Uses Claude discovery (CORRECT)
   - `/documents/upload-focused` - Uses hardcoded product names (WRONG)
   - Should consolidate into ONE endpoint

3. **Inconsistent behavior when `focused_extraction=False`**
   - Chunks: Extracted from ALL pages ✅
   - Images: Extracted from ALL pages ✅
   - BUT: No way to specify WHAT to extract from those pages

4. **Metafield extraction is product-centric**
   - Only extracts metafields for products
   - Doesn't support metafields for certificates, logos, etc.
   - No dynamic metafield creation for new categories

5. **No NLP-based extraction support**
   - Can't send natural language prompts like "extract products and certificates"
   - Requires manual parameter specification

---

## Solution Overview

### **Key Changes**

1. **Replace `focused_extraction` with `categories` parameter**
   - `categories="products"` - Extract products only
   - `categories="products,certificates"` - Extract multiple categories
   - `categories="all"` - Extract everything

2. **Support NLP-based prompts**
   - `custom_prompt="extract products and environmental certifications"`
   - System parses prompt and determines categories

3. **Ensure consistency across all stages**
   - Same pages processed for chunks, images, products, metafields
   - Category tags consistent for all entities
   - No data loss when re-extracting

4. **Support metafields for ANY category**
   - Certificates: certification_type, issue_date, expiry_date
   - Logos: logo_type, color, brand_name
   - Specifications: spec_type, page_count, language
   - Auto-create new metafields if not in database

5. **Make it configurable from admin panel**
   - Enable/disable categories
   - Set default categories
   - Create custom extraction prompts
   - View extraction history

---

## 🎯 Core Question Answered

**"How do we extract metafields that appear on non-product pages?"**

**Answer**: Use **three separate extraction scopes**:
1. **Content Processing** (selected pages) - Create chunks and images
2. **Global Metafield Search** (ALL pages) - Find universal metafields
3. **Category-Specific Metafield Search** (selected pages) - Find category-specific metafields

---

## 📚 Documentation Files

### **START HERE** ⭐

### **1. COMPLETE-EXTRACTION-ARCHITECTURE.md** ⭐⭐⭐
**Purpose**: Full system design answering all core questions

**Contents**:
- Three-scope extraction model
- Complete processing pipeline (Stages 0-4)
- Behavior when categories="all"
- Consistency guarantees
- Database schema updates
- API endpoint specifications

**Read this first** to understand the complete architecture.

---

### **2. METAFIELD-STRATEGY-SUMMARY.md** ⭐⭐
**Purpose**: Quick reference with visual diagrams

**Contents**:
- Core question answered
- Three-layer metafield extraction
- How it works: complete flow
- Key differences from current approach
- Implementation checklist
- Benefits and next steps

**Read this second** for a quick overview.

---

### **3. metafield-dynamic-extraction-strategy.md** ⭐
**Purpose**: Detailed implementation guide

**Contents**:
- Problem statement
- Architecture overview
- Three-layer metafield extraction
- Implementation strategy for all stages
- Metafield hierarchy
- Real-world NOVA product example

**Read this third** for implementation details.

---

### **4. category-based-extraction-architecture.md**
**Purpose**: High-level architecture and design decisions

**Contents**:
- Current state analysis
- Proposed solution overview
- Implementation plan (5 phases)
- NLP-based prompt support
- Database schema updates
- Consistency guarantees
- Migration strategy
- Testing strategy
- Success criteria
- Timeline

**Reference this** for architectural decisions.

---

### **2. implementation-details.md**
**Purpose**: Step-by-step implementation guide

**Contents**:
- API endpoint changes (old vs new)
- Background task function updates
- Stage 0: Enhanced product discovery
- Stage 1: Category-based page selection
- Stages 2-5: Category-aware processing
- NLP prompt parsing
- Database migrations
- Testing strategy
- Admin panel configuration

**Use this** when implementing the changes.

---

### **3. api-specification.md**
**Purpose**: Complete API specification with examples

**Contents**:
- New unified `/documents/upload` endpoint
- Request parameters and response format
- Request examples (5 scenarios)
- Job status endpoint
- Data retrieval endpoints (chunks, images, products, certificates, logos, specifications)
- Metafield endpoints
- Admin endpoints
- Error responses
- Backward compatibility
- Rate limiting
- Webhook events

**Reference this** when building API clients or testing.

---

### **4. consistency-and-metafields.md**
**Purpose**: Consistency guarantees and metafield handling

**Contents**:
- 4 consistency guarantees
- Metafield handling for ANY category (4 steps)
- Database schema for metafields
- Validation and testing
- Summary of guarantees

**Use this** to ensure no debug issues and proper metafield extraction.

---

## Key Concepts

### **Categories**

```
"products"       - Product pages (default)
"certificates"   - Certification pages (EPD, LEED, FSC, etc.)
"logos"          - Logo/branding pages
"specifications" - Technical specification pages
"all"            - All content
```

### **Processing Stages**

```
Stage 0: Product Discovery (0-15%)
  - Analyze entire PDF
  - Identify all content by category
  - Extract metadata and metafields

Stage 1: Category Extraction (15-30%)
  - Build pages_to_process based on categories
  - Track category for each page

Stage 2: Chunking (30-50%)
  - Create chunks from pages_to_process
  - Tag chunks with category

Stage 3: Image Processing (50-70%)
  - Extract images from pages_to_process
  - Tag images with category

Stage 4: Entity Creation (70-90%)
  - Create products, certificates, logos, specifications
  - All from discovery results

Stage 5: Metafield Linking (90-100%)
  - Link metafields to all entities
  - Create new metafields if needed
```

### **Consistency Guarantees**

1. **Same pages processed across all stages**
   - Use single `pages_to_process` set throughout pipeline

2. **Category tags consistent**
   - Use `page_to_category` mapping for all entities

3. **Metafields linked to correct entities**
   - Track entity type and category together

4. **No data loss**
   - Append to existing data, don't replace

---

## Implementation Phases

### **Phase 1: API Endpoint Updates**
- Consolidate endpoints
- Add `categories` parameter
- Support backward compatibility

### **Phase 2: Product Discovery Service**
- Add category classification to Claude prompt
- Return `EnhancedProductCatalog` with all categories
- Support custom prompts from agents

### **Phase 3: Processing Pipeline**
- Update all stages to use categories
- Ensure consistency across stages
- Test thoroughly

### **Phase 4: Metafield Extraction**
- Support category-specific metafields
- Extract for certificates, logos, specifications
- Create new metafields if not in database

### **Phase 5: Admin Panel**
- Category management
- Metafield mapping
- Custom prompts
- Extraction history

---

## Quick Start

### **For Developers**

1. Read `category-based-extraction-architecture.md` for overview
2. Read `implementation-details.md` for step-by-step guide
3. Reference `api-specification.md` when building APIs
4. Use `consistency-and-metafields.md` to ensure correctness

### **For API Users**

1. Read `api-specification.md` for endpoint details
2. Check request examples for your use case
3. Use new `categories` parameter instead of `focused_extraction`

### **For Testing**

1. Read `consistency-and-metafields.md` for validation approach
2. Use consistency checks to verify extraction
3. Test all 4 scenarios: single category, multiple categories, all, NLP prompt

---

## Success Criteria

✅ All API endpoints updated to use categories  
✅ No debug issues when `categories=["all"]`  
✅ Metafields extracted for ANY category  
✅ NLP prompts supported from agents  
✅ Admin panel configurable  
✅ Backward compatible during migration  
✅ All tests passing  
✅ Documentation complete  

---

## Timeline

- **Week 1**: API endpoint updates + Phase 1 implementation
- **Week 2**: Product discovery service updates
- **Week 3**: Processing pipeline updates + testing
- **Week 4**: Metafield extraction updates + admin panel
- **Week 5**: Migration + deprecation + cleanup

---

## Questions?

Refer to the specific documentation file for your question:

- **"How does it work?"** → `category-based-extraction-architecture.md`
- **"How do I implement it?"** → `implementation-details.md`
- **"What's the API?"** → `api-specification.md`
- **"How do I ensure consistency?"** → `consistency-and-metafields.md`

---

## Related Documentation

- `/docs/extract-categories-guide.md` - User guide for extract_categories
- `/docs/pdf-processing-architecture-analysis.md` - Current architecture analysis
- `/docs/metafield-extraction-guide.md` - Metafield extraction details

