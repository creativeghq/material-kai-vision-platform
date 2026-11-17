# Product Discovery Architecture

## 🎯 Overview

The Product Discovery system is designed with two distinct but complementary components:

1. **Product Discovery** (ALWAYS runs) - Products + Metadata as inseparable unit
2. **Document Entity Discovery** (OPTIONAL) - Certificates, Logos, Specifications as separate knowledge base

---

## 📊 Architecture Diagram

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

---

## 🗄️ Database Schema

### **1. Products Table (Core)**

The `products` table stores core product information including name, description, source_document_id, workspace_id, and a `metadata` JSONB field that holds all product metadata as an inseparable unit. The metadata structure includes designer, studio, dimensions, variants, category, page_range, confidence, factory, factory_group, manufacturer, country_of_origin, and technical specifications such as slip_resistance, fire_rating, thickness, water_absorption, finish, and material. Indexes are created on workspace_id, source_document_id, and GIN indexes on the factory and factory_group metadata fields.

### **2. Document Entities Table (for Docs Admin Page)**

The `document_entities` table stores extracted document entities with the following key fields: entity_type (e.g., 'certificate', 'logo', 'specification', 'marketing', 'bank_statement'), name, description, source_document_id, workspace_id, page_range, content (full extracted content), and a metadata JSONB field with entity-specific data. For certificates, the metadata includes certification_type, issue_date, expiry_date, certifying_body, certificate_number, and scope. For logos, it includes logo_type, brand_name, color_scheme, and usage_context. For specifications, it includes spec_type, language, page_count, and topics. The table also has factory_name, factory_group, and manufacturer fields for filtering. Indexes are created on entity_type, workspace_id, source_document_id, factory_name, and factory_group.

### **3. Product-Document Relationships Table**

The `product_document_relationships` table links products to document entities. It stores the product_id and document_entity_id as foreign keys, a relationship_type (e.g., 'certification', 'specification', 'logo', 'marketing'), a relevance_score from 0.0 to 1.0, and a metadata JSONB field containing extraction_method, confidence, and linking_reason. Indexes are created on product_id, document_entity_id, and relationship_type.

---

## 🔄 Service Implementation

### **ProductDiscoveryService (Updated)**

The `ProductInfo` dataclass represents a product with all its metadata as an inseparable unit. It includes name, page_range, optional description, and a metadata dictionary containing designer, dimensions, factory information, and technical specifications. The `ProductCatalog` dataclass groups discovered products along with processing statistics such as total_pages, total_images, content_classification, processing_time_ms, model_used, and confidence_score.

### **DocumentEntityDiscoveryService (NEW)**

The `DocumentEntity` dataclass represents a document entity (certificate, logo, specification, etc.) stored separately from products. It includes entity_type, name, page_range, optional description, optional content, factory identification fields (factory_name, factory_group, manufacturer), entity-specific metadata, and a confidence score. The `DocumentEntityCatalog` dataclass groups discovered entities with counts by type and processing statistics.

---

## 🎯 Use Cases

### **Use Case 1: Get Certifications for Product from Specific Factory**

To find certifications for a product from a specific factory, first query the products table filtering by product name and factory metadata, then query product_document_relationships filtered by product_id and relationship_type 'certification' to retrieve the linked document entities.

### **Use Case 2: Extract Documents After Product Processing**

After a user uploads a PDF and products are extracted immediately, document entity discovery can be triggered separately at any time. The async function retrieves the PDF content, runs the DocumentEntityDiscoveryService to discover entities for the requested categories (e.g., certificates, logos), saves the entities to the database, and then runs AI-based linking to connect entities to products.

---

## 🚀 Future Extensibility

### **Adding New Document Types**

New document types such as marketing content or bank statements can be added by creating new service classes that extract their respective content and save the results as document_entities with the appropriate entity_type value.

---

## Implementation Components

### Database Schema

The product discovery architecture requires the following database components:

**document_entities Table:**
- Stores certificates, logos, specifications, and other document entities
- Includes factory/manufacturer identification fields
- Supports entity-specific metadata in JSONB format
- Enables category-based filtering and retrieval

**product_document_relationships Table:**
- Links document entities to products
- Tracks relationship types (certification, specification, logo, marketing)
- Includes relevance scoring for relationship strength
- Supports AI-based linking metadata

### Service Architecture

**ProductDiscoveryService:**
- Stores all product metadata in product.metadata JSONB field
- Maintains inseparable product-metadata relationship
- Supports dynamic metadata extraction from PDFs
- Provides high-confidence product identification

**DocumentEntityDiscoveryService:**
- Handles optional document entity extraction
- Supports configurable extraction categories
- Enables async processing after product extraction
- Provides extensibility for new entity types

### Admin Interface

**Docs Admin Page:**
- Manages document entities (certificates, logos, specifications)
- Displays entity-product relationships
- Supports filtering by factory/manufacturer
- Enables manual entity management and linking

### AI Integration

**Entity Linking System:**
- Uses AI to identify relationships between entities and products
- Analyzes content context for relationship detection
- Assigns confidence scores to relationships
- Supports manual override and validation

---
