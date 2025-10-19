# Products System - Technical Architecture

**Document Version**: 1.0  
**Date**: 2025-10-19

---

## 🏗️ SYSTEM ARCHITECTURE

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PDF PROCESSING PIPELINE                   │
├─────────────────────────────────────────────────────────────┤
│  Upload → Extract → Chunk → Embed → Store → Analyze        │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │   PRODUCT BUILDER SERVICE    │
        ├──────────────────────────────┤
        │ • Analyze chunks             │
        │ • Extract properties         │
        │ • Generate product embedding │
        │ • Create product record      │
        └──────────────────────────────┘
                       │
                       ▼
        ┌──────────────────────────────┐
        │    PRODUCTS DATABASE         │
        ├──────────────────────────────┤
        │ • products                   │
        │ • product_images             │
        │ • product_embeddings         │
        │ • product_chunk_relationships│
        └──────────────────────────────┘
                       │
        ┌──────────────┴──────────────┐
        ▼                             ▼
   ┌─────────────┐          ┌──────────────────┐
   │ SEARCH API  │          │ MATERIALS PAGE   │
   │ (Unified)   │          │ (User-Facing)    │
   └─────────────┘          └──────────────────┘
```

---

## 📦 CORE SERVICES

### 1. ProductBuilderService
**Purpose**: Transform chunks into products

```typescript
class ProductBuilderService {
  // Analyze chunks and extract product information
  async buildProductFromChunks(
    chunkIds: string[],
    documentId: string
  ): Promise<Product>
  
  // Generate product embedding
  async generateProductEmbedding(product: Product): Promise<void>
  
  // Extract properties from content
  async extractProductProperties(content: string): Promise<Properties>
  
  // Create product record
  async createProduct(data: ProductInput): Promise<Product>
  
  // Update product
  async updateProduct(id: string, data: Partial<ProductInput>): Promise<Product>
  
  // Publish product
  async publishProduct(id: string): Promise<void>
}
```

### 2. ProductSearchService
**Purpose**: Search products and chunks unified

```typescript
class ProductSearchService {
  // Search both products and chunks
  async unifiedSearch(
    query: string,
    options: SearchOptions
  ): Promise<UnifiedSearchResults>
  
  // Search products only
  async searchProducts(
    query: string,
    filters?: ProductFilters
  ): Promise<Product[]>
  
  // Get related products
  async getRelatedProducts(
    productId: string,
    limit?: number
  ): Promise<Product[]>
  
  // Filter by properties
  async filterByProperties(
    properties: PropertyFilter[]
  ): Promise<Product[]>
}
```

### 3. ProductEmbeddingService
**Purpose**: Manage product embeddings

```typescript
class ProductEmbeddingService {
  // Generate embeddings for product
  async generateProductEmbeddings(
    product: Product,
    types: EmbeddingType[]
  ): Promise<ProductEmbedding[]>
  
  // Store embeddings
  async storeEmbeddings(
    productId: string,
    embeddings: ProductEmbedding[]
  ): Promise<void>
  
  // Search by embedding
  async searchByEmbedding(
    embedding: number[],
    limit?: number
  ): Promise<Product[]>
}
```

---

## 🔌 API ENDPOINTS

### Products Management
```
POST   /api/products                    # Create product
GET    /api/products                    # List products
GET    /api/products/:id                # Get product
PATCH  /api/products/:id                # Update product
DELETE /api/products/:id                # Delete product
POST   /api/products/:id/publish        # Publish product
POST   /api/products/:id/embeddings     # Generate embeddings
```

### Product Search
```
POST   /api/search/unified              # Search products + chunks
POST   /api/search/products             # Search products only
GET    /api/products/:id/related        # Get related products
POST   /api/products/filter             # Filter by properties
```

### Product Images
```
POST   /api/products/:id/images         # Add image
GET    /api/products/:id/images         # List images
DELETE /api/products/:id/images/:imgId  # Delete image
```

---

## 🗄️ DATABASE SCHEMA

### Products Table
```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  long_description TEXT,
  category_id UUID REFERENCES material_categories(id),
  source_document_id UUID REFERENCES documents(id),
  source_chunks JSONB,
  properties JSONB,
  specifications JSONB,
  metadata JSONB,
  embedding VECTOR(1536),
  embedding_model TEXT,
  status TEXT,
  created_from_type TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX products_category_id_idx ON products(category_id);
CREATE INDEX products_status_idx ON products(status);
CREATE INDEX products_embedding_idx ON products USING ivfflat(embedding);
```

### Product Images Table
```sql
CREATE TABLE product_images (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  image_id UUID REFERENCES document_images(id),
  image_url TEXT NOT NULL,
  image_type TEXT,
  display_order INTEGER,
  metadata JSONB,
  created_at TIMESTAMPTZ
);

CREATE INDEX product_images_product_id_idx ON product_images(product_id);
```

### Product Embeddings Table
```sql
CREATE TABLE product_embeddings (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  embedding_type TEXT,
  embedding VECTOR(1536),
  source_content TEXT,
  model_name TEXT,
  dimensions INTEGER,
  created_at TIMESTAMPTZ
);

CREATE INDEX product_embeddings_product_id_idx ON product_embeddings(product_id);
CREATE INDEX product_embeddings_type_idx ON product_embeddings(embedding_type);
```

### Product-Chunk Relationships
```sql
CREATE TABLE product_chunk_relationships (
  id UUID PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES products(id),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id),
  relationship_type TEXT,
  relevance_score NUMERIC,
  created_at TIMESTAMPTZ
);

CREATE INDEX product_chunk_relationships_product_id_idx 
  ON product_chunk_relationships(product_id);
CREATE INDEX product_chunk_relationships_chunk_id_idx 
  ON product_chunk_relationships(chunk_id);
```

---

## 🔍 SEARCH IMPLEMENTATION

### Unified Search Flow
1. **Query Preprocessing**: Clean and normalize query
2. **Embedding Generation**: Create query embedding
3. **Parallel Search**:
   - Vector search in `product_embeddings`
   - Vector search in `document_vectors` (chunks)
   - Keyword search in products
4. **Result Merging**: Combine and rank results
5. **Deduplication**: Remove duplicates
6. **Ranking**: Sort by relevance score

### Search Result Structure
```typescript
interface UnifiedSearchResult {
  type: 'product' | 'chunk';
  id: string;
  title: string;
  content: string;
  relevance_score: number;
  source_document?: string;
  metadata: Record<string, any>;
  relatedItems?: UnifiedSearchResult[];
}
```

---

## 🎯 PRODUCT CREATION WORKFLOW

### From PDF Chunks
1. User selects chunks in Knowledge Base
2. System analyzes chunks for product potential
3. Extract: name, description, properties, images
4. Generate product embedding
5. Create product record
6. Link to source chunks
7. Display in Products tab

### From XML/Scraping
1. Parse external data
2. Map to product schema
3. Generate embedding
4. Create product record
5. Mark source as 'xml_import' or 'scraping'

### Manual Creation
1. User fills product form
2. Upload images
3. Set properties and metadata
4. Generate embedding
5. Publish

---

## 🔐 SECURITY & PERMISSIONS

### Row-Level Security (RLS)
```sql
-- Products visible to workspace members
CREATE POLICY "Users can view workspace products"
  ON products FOR SELECT
  USING (created_by = auth.uid() OR workspace_id = current_workspace_id());

-- Only creators can modify
CREATE POLICY "Users can modify own products"
  ON products FOR UPDATE
  USING (created_by = auth.uid());
```

### API Authentication
- All endpoints require JWT token
- Validate user workspace access
- Check product ownership for modifications

---

## 📊 PERFORMANCE CONSIDERATIONS

### Indexing Strategy
- Vector indexes on embeddings (ivfflat)
- B-tree indexes on foreign keys
- Hash indexes on status/type fields
- Composite indexes for common filters

### Query Optimization
- Batch embedding generation
- Cache popular searches
- Pagination for large result sets
- Lazy load related items

### Scaling
- Partition products by category
- Archive old products
- Separate read replicas for search
- CDN for image delivery

---

## 🧪 TESTING STRATEGY

### Unit Tests
- Service methods
- Embedding generation
- Property extraction
- Search ranking

### Integration Tests
- End-to-end product creation
- Search functionality
- Relationship integrity
- Permission checks

### Performance Tests
- Search latency (<500ms)
- Embedding generation time
- Concurrent user load
- Database query performance

---

## 📝 MIGRATION STRATEGY

### Phase 1: Schema Creation
- Create new tables
- Set up indexes
- Configure RLS policies

### Phase 2: Data Migration
- Migrate existing materials to products
- Generate embeddings for existing products
- Create chunk relationships

### Phase 3: Service Deployment
- Deploy ProductBuilderService
- Deploy ProductSearchService
- Deploy API endpoints

### Phase 4: UI Rollout
- Enable Products tab
- Deploy Materials page
- Update search interface

---

## 🔄 INTEGRATION POINTS

### With Existing Systems
- **PDF Processing**: Trigger product creation on chunk generation
- **Search**: Integrate products into unified search
- **Agents**: Use products for recommendations
- **Categories**: Link products to material categories
- **Embeddings**: Use existing embedding service

### With External Systems
- **XML Import**: Map XML to products
- **Web Scraping**: Create products from scraped data
- **3D Models**: Link products to 3D assets
- **Moodboards**: Add products to moodboards

