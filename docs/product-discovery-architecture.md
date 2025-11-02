# Product Discovery Architecture

## 🎯 Overview

The Product Discovery system is designed with two distinct but complementary components:

1. **Product Discovery** (ALWAYS runs) - Products + Metadata as inseparable unit
2. **Document Entity Discovery** (OPTIONAL) - Certificates, Logos, Specifications as separate knowledge base

---

## 📊 Architecture Diagram

```
PDF Upload
    ↓
┌─────────────────────────────────────────────────────────┐
│ Stage 0A: Product Discovery (ALWAYS)                    │
│ - Extract products with ALL metadata                    │
│ - Store in products table with metadata JSONB           │
│ - Products + Metadata = Inseparable                     │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Stage 0B: Document Entity Discovery (OPTIONAL)          │
│ - Extract certificates, logos, specifications           │
│ - Store in document_entities table                      │
│ - Link to products via relationships                    │
│ - Can run DURING or AFTER product processing            │
└─────────────────────────────────────────────────────────┘
    ↓
┌─────────────────────────────────────────────────────────┐
│ Stage 1-4: Chunking, Images, Embeddings                 │
│ - Create semantic chunks for RAG search                 │
│ - Extract images and generate embeddings                │
│ - Link entities (chunks, images, products, documents)   │
└─────────────────────────────────────────────────────────┘
```

---

## 🗄️ Database Schema

### **1. Products Table (Core)**

```sql
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    source_document_id UUID REFERENCES processed_documents(id),
    workspace_id UUID NOT NULL,
    
    -- ALL product metadata stored here (inseparable from product)
    metadata JSONB DEFAULT '{}'::jsonb,
    /*
    metadata structure:
    {
        "designer": "SG NY",
        "studio": "SG NY",
        "dimensions": ["15×38", "20×40"],
        "variants": [{"type": "color", "value": "beige"}],
        "category": "tiles",
        "page_range": [12, 13, 14],
        "confidence": 0.95,
        
        // Factory/Group identification
        "factory": "Castellón Factory",
        "factory_group": "Harmony Group",
        "manufacturer": "Harmony Materials",
        "country_of_origin": "Spain",
        
        // Technical specifications
        "slip_resistance": "R11",
        "fire_rating": "A1",
        "thickness": "8mm",
        "water_absorption": "Class 3",
        "finish": "matte",
        "material": "ceramic"
    }
    */
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_workspace ON products(workspace_id);
CREATE INDEX idx_products_source_doc ON products(source_document_id);
CREATE INDEX idx_products_metadata_factory ON products USING gin((metadata->'factory'));
CREATE INDEX idx_products_metadata_group ON products USING gin((metadata->'factory_group'));
```

### **2. Document Entities Table (NEW - for Docs Admin Page)**

```sql
CREATE TABLE document_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Entity classification
    entity_type VARCHAR(50) NOT NULL,  -- 'certificate', 'logo', 'specification', 'marketing', 'bank_statement'
    name VARCHAR(255) NOT NULL,
    description TEXT,
    
    -- Source tracking
    source_document_id UUID REFERENCES processed_documents(id),
    workspace_id UUID NOT NULL,
    page_range INT[],
    
    -- Content
    content TEXT,  -- Full extracted content
    metadata JSONB DEFAULT '{}'::jsonb,
    /*
    metadata structure (entity-specific):
    
    For certificates:
    {
        "certification_type": "ISO 9001",
        "issue_date": "2024-01-15",
        "expiry_date": "2027-01-15",
        "certifying_body": "TÜV SÜD",
        "certificate_number": "12345678",
        "scope": "Quality Management System"
    }
    
    For logos:
    {
        "logo_type": "company",
        "brand_name": "Harmony",
        "color_scheme": ["blue", "white"],
        "usage_context": "header"
    }
    
    For specifications:
    {
        "spec_type": "installation",
        "language": "en",
        "page_count": 3,
        "topics": ["preparation", "installation", "maintenance"]
    }
    */
    
    -- Factory/Group identification (for filtering)
    factory_name VARCHAR(255),
    factory_group VARCHAR(255),
    manufacturer VARCHAR(255),
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_doc_entities_type ON document_entities(entity_type);
CREATE INDEX idx_doc_entities_workspace ON document_entities(workspace_id);
CREATE INDEX idx_doc_entities_source_doc ON document_entities(source_document_id);
CREATE INDEX idx_doc_entities_factory ON document_entities(factory_name);
CREATE INDEX idx_doc_entities_group ON document_entities(factory_group);
```

### **3. Product-Document Relationships Table**

```sql
CREATE TABLE product_document_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    document_entity_id UUID NOT NULL REFERENCES document_entities(id) ON DELETE CASCADE,
    
    -- Relationship classification
    relationship_type VARCHAR(50) NOT NULL,  -- 'certification', 'specification', 'logo', 'marketing'
    relevance_score FLOAT DEFAULT 1.0,  -- 0.0-1.0 (how relevant is this document to this product)
    
    -- Relationship metadata
    metadata JSONB DEFAULT '{}'::jsonb,
    /*
    {
        "extraction_method": "ai_linking",
        "confidence": 0.95,
        "linking_reason": "Certificate mentions product name on page 45"
    }
    */
    
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_prod_doc_rel_product ON product_document_relationships(product_id);
CREATE INDEX idx_prod_doc_rel_document ON product_document_relationships(document_entity_id);
CREATE INDEX idx_prod_doc_rel_type ON product_document_relationships(relationship_type);
```

---

## 🔄 Service Implementation

### **ProductDiscoveryService (Updated)**

```python
@dataclass
class ProductInfo:
    """
    Product with ALL metadata (inseparable).
    Metadata is stored in product.metadata JSONB, not separate tables.
    """
    name: str
    page_range: List[int]
    description: Optional[str] = None
    
    # ALL metadata stored here
    metadata: Dict[str, Any] = None  # Contains designer, dimensions, factory, specs, etc.
    
    image_indices: List[int] = None
    confidence: float = 0.0

@dataclass
class ProductCatalog:
    """Product catalog with discovered products."""
    products: List[ProductInfo]
    total_pages: int = 0
    total_images: int = 0
    content_classification: Dict[int, str] = None
    processing_time_ms: float = 0.0
    model_used: str = ""
    confidence_score: float = 0.0
```

### **DocumentEntityDiscoveryService (NEW)**

```python
@dataclass
class DocumentEntity:
    """
    Document entity (certificate, logo, specification, etc.)
    Stored separately from products in document_entities table.
    """
    entity_type: str  # 'certificate', 'logo', 'specification'
    name: str
    page_range: List[int]
    description: Optional[str] = None
    content: Optional[str] = None
    
    # Factory/Group identification
    factory_name: Optional[str] = None
    factory_group: Optional[str] = None
    manufacturer: Optional[str] = None
    
    # Entity-specific metadata
    metadata: Dict[str, Any] = None
    confidence: float = 0.0

@dataclass
class DocumentEntityCatalog:
    """Catalog of discovered document entities."""
    entities: List[DocumentEntity]
    total_entities: int = 0
    by_type: Dict[str, int] = None  # Count by entity_type
    processing_time_ms: float = 0.0
    model_used: str = ""
```

---

## 🎯 Use Cases

### **Use Case 1: Get Certifications for Product from Specific Factory**

```python
# Query: "Get certifications for material NOVA from Castellón Factory"

# Step 1: Find product
product = supabase.table('products')\
    .select('*')\
    .eq('name', 'NOVA')\
    .contains('metadata', {'factory': 'Castellón Factory'})\
    .single()

# Step 2: Get related certifications
certifications = supabase.table('product_document_relationships')\
    .select('document_entities(*)')\
    .eq('product_id', product.id)\
    .eq('relationship_type', 'certification')\
    .execute()

# Returns all certifications linked to NOVA from Castellón Factory
```

### **Use Case 2: Extract Documents After Product Processing**

```python
# User uploads PDF → Products extracted immediately
# Later, user requests: "Extract certificates from this PDF"

async def extract_documents_async(document_id: str, categories: List[str]):
    # Get PDF content
    pdf_content = get_pdf_content(document_id)
    
    # Run document entity discovery
    entity_service = DocumentEntityDiscoveryService()
    catalog = await entity_service.discover_entities(
        pdf_content=pdf_content,
        categories=categories  # ['certificates', 'logos']
    )
    
    # Save entities to database
    for entity in catalog.entities:
        save_document_entity(entity)
    
    # Link to products (AI-based)
    await link_entities_to_products(document_id, catalog.entities)
```

---

## 🚀 Future Extensibility

### **Adding New Document Types**

```python
# Example: Marketing Content Extraction
class MarketingExtractionService:
    async def extract_marketing(self, pdf_content):
        # Extract marketing content
        marketing_entities = await self._extract_marketing_content(pdf_content)
        
        # Save as document_entities with entity_type='marketing'
        for entity in marketing_entities:
            entity.entity_type = 'marketing'
            save_document_entity(entity)

# Example: Bank Statement Extraction
class BankStatementExtractionService:
    async def extract_statements(self, pdf_content):
        # Extract bank statements
        statement_entities = await self._extract_statements(pdf_content)
        
        # Save as document_entities with entity_type='bank_statement'
        for entity in statement_entities:
            entity.entity_type = 'bank_statement'
            save_document_entity(entity)
```

---

## 📋 Next Steps

1. **Create document_entities table** in Supabase
2. **Create product_document_relationships table** in Supabase
3. **Update ProductDiscoveryService** to store metadata in product.metadata JSONB
4. **Create DocumentEntityDiscoveryService** for optional document extraction
5. **Create "Docs" Admin Page** to manage document entities
6. **Implement AI-based entity linking** to connect documents to products

---

**Would you like me to proceed with implementing these changes?**

