# Database Schema - Complete Reference

PostgreSQL 15 + pgvector schema for Material Kai Vision Platform.

---

## 📊 Core Tables

### workspaces

Multi-tenant workspace isolation.

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT workspace_name_unique UNIQUE(owner_id, name)
);
```

**Columns**:
- `id`: Unique workspace identifier
- `name`: Workspace name
- `owner_id`: Owner user ID
- `created_at`: Creation timestamp
- `updated_at`: Last update timestamp
- `metadata`: Additional workspace data

---

### documents

PDF document metadata and processing status.

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  filename VARCHAR(255) NOT NULL,
  file_path VARCHAR(512),
  file_size BIGINT,
  page_count INTEGER,
  content_type VARCHAR(50),
  processing_status VARCHAR(50) DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT document_workspace_unique UNIQUE(workspace_id, filename)
);
```

**Columns**:
- `id`: Document ID
- `workspace_id`: Associated workspace
- `filename`: Original filename
- `file_path`: Storage path
- `file_size`: File size in bytes
- `page_count`: Total pages
- `content_type`: MIME type
- `processing_status`: Current status
- `metadata`: Document metadata (title, description, tags)

---

### chunks

Text segments with embeddings and quality scores.

```sql
CREATE TABLE chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  content TEXT NOT NULL,
  page_number INTEGER,
  chunk_index INTEGER,
  quality_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT chunk_document_index UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_chunks_document ON chunks(document_id);
CREATE INDEX idx_chunks_workspace ON chunks(workspace_id);
```

**Columns**:
- `id`: Chunk ID
- `document_id`: Source document
- `workspace_id`: Associated workspace
- `content`: Text content
- `page_number`: Page number
- `chunk_index`: Chunk sequence
- `quality_score`: Quality metric (0-1)
- `metadata`: Chunk metadata

---

### products

Extracted products with metadata.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  document_id UUID REFERENCES documents(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  confidence_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT product_workspace_name UNIQUE(workspace_id, name)
);

CREATE INDEX idx_products_workspace ON products(workspace_id);
CREATE INDEX idx_products_document ON products(document_id);
```

**Columns**:
- `id`: Product ID
- `workspace_id`: Associated workspace
- `document_id`: Source document
- `name`: Product name
- `description`: Product description
- `confidence_score`: Detection confidence (0-1)
- `metadata`: Product metadata

---

### images

Extracted images with analysis results.

```sql
CREATE TABLE images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  filename VARCHAR(255) NOT NULL,
  storage_path VARCHAR(512),
  page_number INTEGER,
  quality_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT image_document_filename UNIQUE(document_id, filename)
);

CREATE INDEX idx_images_document ON images(document_id);
CREATE INDEX idx_images_workspace ON images(workspace_id);
```

**Columns**:
- `id`: Image ID
- `document_id`: Source document
- `workspace_id`: Associated workspace
- `filename`: Image filename
- `storage_path`: Supabase Storage path
- `page_number`: Page number
- `quality_score`: Quality metric (0-1)
- `metadata`: Image analysis results (OCR, materials, properties)

---

### metafields

Structured metadata definitions and values.

```sql
CREATE TABLE metafields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(50) NOT NULL, -- text, number, select, multiselect
  created_at TIMESTAMP DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT metafield_workspace_name UNIQUE(workspace_id, name)
);

CREATE TABLE metafield_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  metafield_id UUID NOT NULL REFERENCES metafields(id),
  product_id UUID REFERENCES products(id),
  chunk_id UUID REFERENCES chunks(id),
  image_id UUID REFERENCES images(id),
  value TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT metafield_value_unique UNIQUE(metafield_id, product_id, chunk_id, image_id)
);

CREATE INDEX idx_metafield_values_product ON metafield_values(product_id);
CREATE INDEX idx_metafield_values_chunk ON metafield_values(chunk_id);
CREATE INDEX idx_metafield_values_image ON metafield_values(image_id);
```

---

### embeddings

Vector storage with pgvector.

```sql
CREATE TABLE embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID REFERENCES chunks(id),
  image_id UUID REFERENCES images(id),
  embedding_type VARCHAR(50) NOT NULL, -- text, visual, color, texture, application, semantic
  embedding vector(1536), -- Dimension varies by type
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT embedding_unique UNIQUE(chunk_id, image_id, embedding_type)
);

-- Create similarity indexes
CREATE INDEX idx_embeddings_text ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding_type = 'text';
CREATE INDEX idx_embeddings_visual ON embeddings USING ivfflat (embedding vector_cosine_ops)
  WHERE embedding_type = 'visual';
```

**Columns**:
- `id`: Embedding ID
- `chunk_id`: Associated chunk
- `image_id`: Associated image
- `embedding_type`: Type of embedding
- `embedding`: Vector (pgvector)

**Embedding Types**:
- `text`: 1536D text embeddings
- `visual`: 512D visual embeddings
- `visual_large`: 1536D large visual embeddings
- `color`: 256D color embeddings
- `texture`: 256D texture embeddings
- `application`: 512D application embeddings

---

### background_jobs

Async job tracking.

```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id),
  document_id UUID REFERENCES documents(id),
  job_type VARCHAR(50) NOT NULL, -- pdf_processing, image_analysis, product_creation
  status VARCHAR(50) DEFAULT 'pending', -- pending, processing, completed, failed
  progress_percent INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  CONSTRAINT job_unique UNIQUE(workspace_id, document_id, job_type)
);

CREATE INDEX idx_jobs_workspace ON background_jobs(workspace_id);
CREATE INDEX idx_jobs_status ON background_jobs(status);
```

---

### job_progress

Real-time progress tracking.

```sql
CREATE TABLE job_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES background_jobs(id),
  stage VARCHAR(50) NOT NULL,
  progress_percent INTEGER,
  current_step VARCHAR(255),
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT progress_unique UNIQUE(job_id, stage)
);

CREATE INDEX idx_progress_job ON job_progress(job_id);
```

---

## 🔗 Relationships

### Product-Chunk Association

```sql
CREATE TABLE product_chunks (
  product_id UUID NOT NULL REFERENCES products(id),
  chunk_id UUID NOT NULL REFERENCES chunks(id),
  PRIMARY KEY (product_id, chunk_id)
);

CREATE INDEX idx_product_chunks_product ON product_chunks(product_id);
CREATE INDEX idx_product_chunks_chunk ON product_chunks(chunk_id);
```

### Product-Image Association

```sql
CREATE TABLE product_images (
  product_id UUID NOT NULL REFERENCES products(id),
  image_id UUID NOT NULL REFERENCES images(id),
  PRIMARY KEY (product_id, image_id)
);

CREATE INDEX idx_product_images_product ON product_images(product_id);
CREATE INDEX idx_product_images_image ON product_images(image_id);
```

---

## 🔐 Row-Level Security (RLS)

```sql
-- Enable RLS on all tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE images ENABLE ROW LEVEL SECURITY;

-- Workspace isolation policy
CREATE POLICY "workspace_isolation"
ON documents
FOR SELECT
USING (workspace_id IN (
  SELECT id FROM workspaces WHERE owner_id = auth.uid()
));

-- Similar policies for other tables
```

---

## 📈 Indexes

**Performance Indexes**:
- Document lookup: `idx_documents_workspace`
- Chunk retrieval: `idx_chunks_document`, `idx_chunks_workspace`
- Product search: `idx_products_workspace`, `idx_products_document`
- Image lookup: `idx_images_document`, `idx_images_workspace`
- Vector similarity: `idx_embeddings_text`, `idx_embeddings_visual`
- Job tracking: `idx_jobs_workspace`, `idx_jobs_status`

---

## 💾 Storage Capacity

**Estimated Capacity**:
- Documents: 100,000+
- Chunks: 10,000,000+
- Products: 1,000,000+
- Images: 5,000,000+
- Embeddings: 50,000,000+

---

## 🔄 Backup & Recovery

**Supabase Backups**:
- Daily automated backups
- 30-day retention
- Point-in-time recovery
- Backup encryption

---

**Last Updated**: October 31, 2025  
**PostgreSQL Version**: 15  
**pgvector Version**: Latest  
**Status**: Production

