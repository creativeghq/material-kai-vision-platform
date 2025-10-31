# Database Schema

**Material Kai Vision Platform** - Supabase PostgreSQL Database

---

## Overview

The platform uses **Supabase PostgreSQL 15** with **pgvector extension** for vector similarity search. The database implements **Row-Level Security (RLS)** for multi-tenant workspace isolation and includes **real-time subscriptions** for live updates.

### Key Features

- **Multi-tenant architecture** with workspace-based isolation
- **Vector embeddings** using pgvector (1536D text, 512D visual)
- **Row-Level Security (RLS)** on all tables
- **Real-time subscriptions** for live data updates
- **Full-text search** with PostgreSQL tsvector
- **Automatic timestamps** with triggers
- **Foreign key constraints** for data integrity

---

## Core Tables

### workspaces

Multi-tenant workspace management.

```sql
CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) UNIQUE NOT NULL,
  owner_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their workspaces"
  ON workspaces FOR SELECT
  USING (
    owner_id = auth.uid() OR
    id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
  );
```

**Columns**:
- `id` - Unique workspace identifier
- `name` - Workspace display name
- `slug` - URL-friendly identifier
- `owner_id` - Workspace owner (user ID)
- `settings` - Workspace configuration (JSON)
- `created_at`, `updated_at` - Timestamps

---

### documents

PDF documents and metadata.

```sql
CREATE TABLE documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  filename VARCHAR(500) NOT NULL,
  file_size INTEGER,
  mime_type VARCHAR(100) DEFAULT 'application/pdf',
  storage_path TEXT NOT NULL,
  storage_bucket VARCHAR(100) DEFAULT 'pdf-documents',
  page_count INTEGER,
  processing_status VARCHAR(50) DEFAULT 'pending',
  category_id UUID,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_documents_workspace ON documents(workspace_id);
CREATE INDEX idx_documents_status ON documents(processing_status);
CREATE INDEX idx_documents_category ON documents(category_id);

-- RLS Policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace documents"
  ON documents FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

**Columns**:
- `id` - Document identifier
- `workspace_id` - Parent workspace
- `filename` - Original filename
- `file_size` - Size in bytes
- `storage_path` - Path in Supabase Storage
- `page_count` - Number of pages
- `processing_status` - pending, processing, completed, failed
- `metadata` - Additional document metadata (JSON)

---

### document_chunks

Semantic text chunks with embeddings.

```sql
CREATE TABLE document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  page_number INTEGER,
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_workspace ON document_chunks(workspace_id);
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- RLS Policies
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view workspace chunks"
  ON document_chunks FOR SELECT
  USING (workspace_id IN (
    SELECT id FROM workspaces WHERE owner_id = auth.uid()
    UNION
    SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
  ));
```

**Columns**:
- `id` - Chunk identifier
- `document_id` - Parent document
- `content` - Text content
- `chunk_index` - Position in document
- `page_number` - Source page
- `embedding` - 1536D vector (OpenAI text-embedding-3-small)
- `metadata` - Chunk metadata (JSON)

---

### document_images

Extracted images with AI analysis.

```sql
CREATE TABLE document_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  storage_bucket VARCHAR(100) DEFAULT 'pdf-tiles',
  page_number INTEGER,
  image_index INTEGER,
  width INTEGER,
  height INTEGER,
  format VARCHAR(50),
  file_size INTEGER,
  clip_embedding VECTOR(512),
  ai_analysis JSONB DEFAULT '{}',
  quality_score INTEGER,
  image_type VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_images_document ON document_images(document_id);
CREATE INDEX idx_images_workspace ON document_images(workspace_id);
CREATE INDEX idx_images_clip ON document_images USING ivfflat (clip_embedding vector_cosine_ops);

-- RLS Policies
ALTER TABLE document_images ENABLE ROW LEVEL SECURITY;
```

**Columns**:
- `id` - Image identifier
- `document_id` - Parent document
- `storage_path` - Path in Supabase Storage
- `clip_embedding` - 512D visual embedding (CLIP)
- `ai_analysis` - Llama/Claude analysis results (JSON)
- `quality_score` - 0-100 quality rating
- `image_type` - product, detail, mood, diagram, etc.

---

### products

Product records from PDFs.

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE SET NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  designer VARCHAR(255),
  dimensions JSONB,
  variants JSONB DEFAULT '[]',
  page_ranges JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- Indexes
CREATE INDEX idx_products_workspace ON products(workspace_id);
CREATE INDEX idx_products_document ON products(document_id);
CREATE INDEX idx_products_name ON products USING gin(to_tsvector('english', name));

-- RLS Policies
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
```

**Columns**:
- `id` - Product identifier
- `name` - Product name
- `description` - Product description
- `designer` - Designer/studio name
- `dimensions` - Width, height, depth (JSON)
- `variants` - Color/finish variants (JSON array)
- `page_ranges` - Source page ranges (JSON array)

---

### background_jobs

Async job tracking.

```sql
CREATE TABLE background_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
  job_type VARCHAR(100) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  current_stage VARCHAR(100),
  checkpoint_stage VARCHAR(100),
  total_stages INTEGER DEFAULT 14,
  stages_completed INTEGER DEFAULT 0,
  result JSONB,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_jobs_workspace ON background_jobs(workspace_id);
CREATE INDEX idx_jobs_status ON background_jobs(status);
CREATE INDEX idx_jobs_document ON background_jobs(document_id);
```

**Columns**:
- `id` - Job identifier
- `job_type` - pdf_processing, image_analysis, etc.
- `status` - pending, processing, completed, failed
- `progress` - 0-100 percentage
- `current_stage` - Current pipeline stage
- `checkpoint_stage` - Last completed checkpoint
- `result` - Job results (JSON)

---

### material_metadata_fields

Dynamic metafield definitions.

```sql
CREATE TABLE material_metadata_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  field_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL,
  field_category VARCHAR(100),
  is_searchable BOOLEAN DEFAULT true,
  is_filterable BOOLEAN DEFAULT true,
  display_order INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_metafields_workspace ON material_metadata_fields(workspace_id);
CREATE INDEX idx_metafields_category ON material_metadata_fields(field_category);
```

**Columns**:
- `field_name` - Metafield name (e.g., "Material Type")
- `field_type` - text, number, boolean, select, multi-select
- `field_category` - physical, visual, functional, etc.
- `is_searchable` - Enable in search
- `is_filterable` - Enable in filters

---

### metafield_values

Metafield data for entities.

```sql
CREATE TABLE metafield_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  metafield_id UUID REFERENCES material_metadata_fields(id) ON DELETE CASCADE,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID NOT NULL,
  value JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_metafield_values_workspace ON metafield_values(workspace_id);
CREATE INDEX idx_metafield_values_entity ON metafield_values(entity_type, entity_id);
CREATE INDEX idx_metafield_values_metafield ON metafield_values(metafield_id);
```

**Columns**:
- `metafield_id` - Reference to field definition
- `entity_type` - chunk, product, image
- `entity_id` - Entity UUID
- `value` - Field value (JSON)

---

## Storage Buckets

### pdf-documents
- **Purpose**: Original PDF files
- **Access**: Private (RLS)
- **Max Size**: 50MB per file

### pdf-tiles
- **Purpose**: Extracted images from PDFs
- **Access**: Private (RLS)
- **Max Size**: 10MB per image

### material-images
- **Purpose**: Material photos and uploads
- **Access**: Public (with RLS)
- **Max Size**: 10MB per image

### 3d-models
- **Purpose**: Generated 3D models
- **Access**: Private (RLS)
- **Max Size**: 100MB per model

---

## Vector Indexes

### Text Embeddings (1536D)
```sql
CREATE INDEX idx_chunks_embedding 
  ON document_chunks 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
```

### Visual Embeddings (512D)
```sql
CREATE INDEX idx_images_clip 
  ON document_images 
  USING ivfflat (clip_embedding vector_cosine_ops)
  WITH (lists = 100);
```

---

## Functions & Triggers

### Auto-update timestamps
```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_documents_updated_at
  BEFORE UPDATE ON documents
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
```

---

**Last Updated**: 2025-10-31  
**Version**: 2.0.0  
**Status**: Production

