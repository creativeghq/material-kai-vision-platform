# Category-Based Extraction - Q&A and Critical Issues

## Questions & Answers

### Q1: Why is confidence_score set to 0.0?

**A:** This is just the Python dataclass default value pattern. The actual confidence scores are set when parsing AI results:

```python
# Default in dataclass (just for type safety)
confidence: float = 0.0

# Actual values set during parsing
confidence=p.get("confidence", 0.8)  # Products: 0.8 default
confidence=c.get("confidence", 0.8)  # Certificates: 0.8 default
confidence_score=result.get("confidence_score", 0.85)  # Overall: 0.85 default
```

---

### Q2: How do Certificates/Logos/Specifications relate to Factory/Manufacturer?

**Current State:** ❌ NO relationship exists yet

**What "Factory" Means:**
- Factory = Manufacturing facility/producer (e.g., "Castellón, Spain")
- Group of Companies = Parent organization
- These are stored as metadata describing WHO made the product

**What We Need:**

#### For Certificates:
```python
@dataclass
class CertificateInfo:
    name: str  # "ISO 9001:2015"
    issuer: str  # "TÜV SÜD"
    factory: Optional[str]  # NEW: Which factory is certified
    manufacturer: Optional[str]  # NEW: Which company holds the certificate
    applies_to_products: List[str]  # NEW: Which products this certifies
```

#### For Logos:
```python
@dataclass
class LogoInfo:
    name: str  # "Company Logo"
    logo_type: str  # "company", "brand", "certification"
    company: Optional[str]  # NEW: Which company/brand
    factory: Optional[str]  # NEW: Which factory if applicable
```

#### For Specifications:
```python
@dataclass
class SpecificationInfo:
    name: str  # "Installation Guide"
    spec_type: str  # "technical", "installation", "maintenance"
    manufacturer: Optional[str]  # NEW: Which manufacturer's specs
    applies_to_products: List[str]  # NEW: Which products these specs cover
```

**Action Required:** Update dataclasses and discovery prompts to extract factory/manufacturer information.

---

### Q3: How do Certificates/Logos/Specifications relate to Products?

**Current State:** ❌ NO relationship exists yet

**What We Need:**

#### Database Relationships:
```sql
-- Certificate to Product
CREATE TABLE certificate_product_relationships (
    certificate_id UUID REFERENCES certificates(id),
    product_id UUID REFERENCES products(id),
    relevance_score FLOAT DEFAULT 1.0,
    PRIMARY KEY (certificate_id, product_id)
);

-- Logo to Product (brand association)
CREATE TABLE logo_product_relationships (
    logo_id UUID REFERENCES logos(id),
    product_id UUID REFERENCES products(id),
    relationship_type VARCHAR(50),  -- 'brand', 'certification', 'quality_mark'
    PRIMARY KEY (logo_id, product_id)
);

-- Specification to Product
CREATE TABLE specification_product_relationships (
    specification_id UUID REFERENCES specifications(id),
    product_id UUID REFERENCES products(id),
    relevance_score FLOAT DEFAULT 1.0,
    PRIMARY KEY (specification_id, product_id)
);
```

#### Discovery Enhancement:
The AI discovery should identify these relationships:
```json
{
  "products": [
    {"name": "NOVA", "page_range": [12, 13, 14]}
  ],
  "certificates": [
    {
      "name": "ISO 9001:2015",
      "applies_to_products": ["NOVA", "BEAT"],  // NEW
      "page_range": [45, 46]
    }
  ],
  "specifications": [
    {
      "name": "Installation Guide",
      "applies_to_products": ["NOVA"],  // NEW
      "page_range": [50, 52]
    }
  ]
}
```

**Action Required:** Create database tables and update discovery service to identify relationships.

---

### Q4: Are the Prompt Templates Already Used in the System?

**A:** ❌ **NO** - These are NEW templates I created based on best practices.

**Current System:**
- Uses hardcoded prompts in `_build_default_discovery_prompt()`
- No admin customization
- No database storage

**New System:**
- Admin-configurable prompts stored in database
- Version control and audit trail
- Fallback to detailed default templates
- Agent prompt enhancement

**Action Required:** Seed default prompts to database, then admins can customize.

---

### Q5: "Search Nova" Without PDF - Should Query RAG System

**A:** 🎯 **CRITICAL POINT!** You're absolutely right!

**Current Implementation:** ❌ Only works with PDF upload

**What We Need:**

```python
# In unified_upload.py or new search endpoint
async def handle_agent_request(
    agent_prompt: str,
    file: Optional[UploadFile] = None,
    categories: List[str] = ["products"]
):
    if file:
        # PDF Processing Flow
        return await process_pdf_with_discovery(
            file=file,
            agent_prompt=agent_prompt,
            categories=categories
        )
    else:
        # RAG Search Flow
        return await search_existing_knowledge_base(
            query=agent_prompt,
            categories=categories
        )
```

**RAG Search Flow:**
```
Agent: "Search for Nova"
   ↓
No PDF attached
   ↓
Query existing chunks/embeddings
   ↓
Search document_chunks WHERE:
  - content ILIKE '%Nova%'
  - OR embedding similarity to "Nova"
  - Filter by category if specified
   ↓
Return existing products/chunks/images
```

**Action Required:** Create separate endpoint or add logic to detect PDF vs RAG search.

---

### Q6: Are All Database Tables Created?

**Status Check:**

✅ **EXIST:**
- `extraction_prompts` - Admin-configurable prompts
- `extraction_prompt_history` - Audit trail
- `extraction_config` - Workspace settings
- `document_chunks` - Semantic chunks (PRIMARY storage)
- `document_images` - Extracted images
- `products` - Product records
- `chunk_product_relationships` - Chunk-to-product links

❌ **MISSING:**
- `certificates` - Certificate records
- `logos` - Logo records
- `specifications` - Specification records
- `certificate_product_relationships` - Certificate-to-product links
- `logo_product_relationships` - Logo-to-product links
- `specification_product_relationships` - Specification-to-product links

**Action Required:** Create missing tables for certificates, logos, specifications.

---

## Critical Architecture Decision: Chunks-First Approach

### ✅ CORRECT Understanding:

**Everything is stored as CHUNKS, not metafields!**

```
PDF → Discovery → Chunking → Chunks with Categories
                              ↓
                    document_chunks table:
                    - content: "NOVA is a 15×38 tile..."
                    - category: "product"
                    - metadata: {"product_name": "NOVA", "factory": "Spain"}
                    - embedding: [vector for RAG search]
```

**NOT:**
```
❌ PDF → Discovery → Metafield Extraction → metafield_values table
```

### What Discovery Service Does:

1. **Identifies** what content exists (products, certificates, logos, specs)
2. **Classifies** pages by category
3. **Maps** relationships (which certificate applies to which product)
4. **Returns** structured catalog for subsequent processing

### What Chunking Stage Does:

1. **Creates** semantic chunks from identified content
2. **Tags** chunks with category ("product", "certificate", "logo", "specification")
3. **Stores** all metadata IN the chunk (not separate metafields)
4. **Generates** embeddings for RAG search

### Example Flow:

```
Stage 0 (Discovery):
  Input: harmony.pdf
  Output: {
    "products": [{"name": "NOVA", "page_range": [12-14]}],
    "certificates": [{"name": "ISO 9001", "page_range": [45-46]}]
  }

Stage 1 (Chunking):
  Input: Discovery results + PDF text
  Output: document_chunks records:
    - Chunk 1: content="NOVA 15×38 tile...", category="product", metadata={...}
    - Chunk 2: content="ISO 9001:2015 certified...", category="certificate", metadata={...}

Stage 2 (Embedding):
  Input: Chunks
  Output: embeddings table with vectors for RAG search

RAG Search:
  Query: "Search for Nova"
  Process: Vector similarity search on chunks
  Return: Chunks with category="product" matching "Nova"
```

---

## Implementation Requirements

### Database Schema

The following database components are required for full category extraction functionality:

**Completed Components:**
- Discovery service documentation
- extraction_prompts tables for admin-configurable prompts

**Required Components:**
- Database tables for certificates, logos, and specifications
- Factory/manufacturer fields in dataclasses
- Relationship tables linking entities to products
- RAG search endpoint for queries without PDF upload

### Processing Pipeline Enhancements

The chunking and embedding stages require updates to support category-based extraction:

- Chunking stage must use category tags for proper content classification
- Embedding generation must handle all content categories (products, certificates, logos, specifications)
- Entity records must be created for all discovered content types
- Relationship linking between entities and chunks must be established

---

## Summary

### Key Architectural Decisions

**Confidence Scoring:**
- Default confidence scores (0.0) are placeholder values in dataclass definitions
- Actual confidence scores are set during AI parsing (typically 0.8-0.98)

**Entity Relationships:**
- Certificates, logos, and specifications require factory/manufacturer identification
- Product relationships must be established for all entity types
- Prompt templates are stored in database for admin customization

**Search Capabilities:**
- RAG search endpoint enables queries without PDF upload
- Existing chunks and embeddings can be searched directly
- Category filtering allows targeted content retrieval

**Storage Architecture:**
- CHUNKS-FIRST approach: All content stored as semantic chunks
- Metadata stored within chunks, not in separate metafield tables
- Category tags enable content classification and filtering
- Embeddings support semantic search across all content types

