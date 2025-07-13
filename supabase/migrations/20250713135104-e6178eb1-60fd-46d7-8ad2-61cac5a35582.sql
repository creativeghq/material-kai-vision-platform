-- Migration: Hybrid PDF Pipeline Tables
-- Description: Add tables for layout-aware chunking, image-text mapping, and document analysis
-- Date: 2025-01-13

-- Enable pgvector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Document chunks with layout awareness
CREATE TABLE IF NOT EXISTS document_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  html_content TEXT,
  chunk_type VARCHAR(50) NOT NULL CHECK (chunk_type IN ('heading', 'paragraph', 'table', 'list', 'mixed', 'image_caption')),
  hierarchy_level INTEGER DEFAULT 1,
  page_number INTEGER DEFAULT 1,
  bbox JSONB, -- bounding box coordinates {x, y, width, height}
  parent_chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  embedding VECTOR(1536), -- OpenAI text-embedding-3-small dimensions
  metadata JSONB NOT NULL DEFAULT '{}', -- element_ids, image_ids, semantic_tags, confidence, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Indexes for performance
  CONSTRAINT document_chunks_chunk_index_check CHECK (chunk_index >= 0),
  CONSTRAINT document_chunks_hierarchy_check CHECK (hierarchy_level >= 1 AND hierarchy_level <= 10),
  CONSTRAINT document_chunks_page_check CHECK (page_number >= 1)
);

-- 2. Image-text associations
CREATE TABLE IF NOT EXISTS document_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  chunk_id UUID REFERENCES document_chunks(id) ON DELETE SET NULL,
  image_url TEXT NOT NULL,
  image_type VARCHAR(50) DEFAULT 'material_sample',
  caption TEXT,
  alt_text TEXT,
  bbox JSONB, -- bounding box coordinates
  page_number INTEGER DEFAULT 1,
  proximity_score FLOAT DEFAULT 0.0,
  confidence FLOAT DEFAULT 0.0,
  metadata JSONB DEFAULT '{}', -- analysis results, material properties, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT document_images_proximity_check CHECK (proximity_score >= 0.0 AND proximity_score <= 1.0),
  CONSTRAINT document_images_confidence_check CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT document_images_page_check CHECK (page_number >= 1)
);

-- 3. Layout analysis results
CREATE TABLE IF NOT EXISTS document_layout_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  layout_elements JSONB NOT NULL DEFAULT '[]', -- array of layout elements
  reading_order JSONB DEFAULT '[]', -- array of element IDs in reading order
  structure_confidence FLOAT DEFAULT 0.0,
  processing_version VARCHAR(50) DEFAULT '1.0.0',
  analysis_metadata JSONB DEFAULT '{}', -- processing stats, element counts, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT layout_analysis_confidence_check CHECK (structure_confidence >= 0.0 AND structure_confidence <= 1.0),
  CONSTRAINT layout_analysis_page_check CHECK (page_number >= 1),
  
  -- Unique constraint to prevent duplicate analysis per page
  UNIQUE(document_id, page_number)
);

-- 4. Image-text associations (detailed mapping)
CREATE TABLE IF NOT EXISTS image_text_associations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID REFERENCES document_images(id) ON DELETE CASCADE,
  document_id UUID REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  text_block_ids JSONB DEFAULT '[]', -- array of text block IDs
  chunk_ids JSONB DEFAULT '[]', -- array of associated chunk IDs
  association_type VARCHAR(50) NOT NULL CHECK (association_type IN ('caption', 'reference', 'proximity', 'contextual', 'embedded')),
  confidence FLOAT DEFAULT 0.0,
  proximity_score FLOAT DEFAULT 0.0,
  semantic_score FLOAT DEFAULT 0.0,
  spatial_relationship JSONB DEFAULT '{}', -- direction, distance, alignment
  metadata JSONB DEFAULT '{}', -- keywords, material_references, technical_terms
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT associations_confidence_check CHECK (confidence >= 0.0 AND confidence <= 1.0),
  CONSTRAINT associations_proximity_check CHECK (proximity_score >= 0.0 AND proximity_score <= 1.0),
  CONSTRAINT associations_semantic_check CHECK (semantic_score >= 0.0 AND semantic_score <= 1.0)
);

-- 5. Processing status tracking
CREATE TABLE IF NOT EXISTS document_processing_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_id VARCHAR(255) UNIQUE NOT NULL,
  document_id UUID REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  current_step TEXT,
  start_time TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  end_time TIMESTAMP WITH TIME ZONE,
  error_message TEXT,
  metadata JSONB DEFAULT '{}', -- filename, file_size, total_steps, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT processing_progress_check CHECK (progress >= 0 AND progress <= 100)
);

-- 6. Document quality metrics
CREATE TABLE IF NOT EXISTS document_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  layout_preservation FLOAT DEFAULT 0.0,
  chunking_quality FLOAT DEFAULT 0.0,
  image_mapping_accuracy FLOAT DEFAULT 0.0,
  overall_quality FLOAT DEFAULT 0.0,
  statistics JSONB DEFAULT '{}', -- total_pages, total_elements, total_chunks, etc.
  processing_time_ms INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Constraints
  CONSTRAINT quality_layout_check CHECK (layout_preservation >= 0.0 AND layout_preservation <= 1.0),
  CONSTRAINT quality_chunking_check CHECK (chunking_quality >= 0.0 AND chunking_quality <= 1.0),
  CONSTRAINT quality_mapping_check CHECK (image_mapping_accuracy >= 0.0 AND image_mapping_accuracy <= 1.0),
  CONSTRAINT quality_overall_check CHECK (overall_quality >= 0.0 AND overall_quality <= 1.0),
  
  -- Unique constraint
  UNIQUE(document_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index ON document_chunks(document_id, chunk_index);
CREATE INDEX IF NOT EXISTS idx_document_chunks_page_number ON document_chunks(page_number);
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_type ON document_chunks(chunk_type);
CREATE INDEX IF NOT EXISTS idx_document_chunks_hierarchy ON document_chunks(hierarchy_level);

CREATE INDEX IF NOT EXISTS idx_document_images_document_id ON document_images(document_id);
CREATE INDEX IF NOT EXISTS idx_document_images_chunk_id ON document_images(chunk_id);
CREATE INDEX IF NOT EXISTS idx_document_images_page_number ON document_images(page_number);
CREATE INDEX IF NOT EXISTS idx_document_images_type ON document_images(image_type);

CREATE INDEX IF NOT EXISTS idx_layout_analysis_document_id ON document_layout_analysis(document_id);
CREATE INDEX IF NOT EXISTS idx_layout_analysis_page ON document_layout_analysis(page_number);

CREATE INDEX IF NOT EXISTS idx_associations_image_id ON image_text_associations(image_id);
CREATE INDEX IF NOT EXISTS idx_associations_document_id ON image_text_associations(document_id);
CREATE INDEX IF NOT EXISTS idx_associations_type ON image_text_associations(association_type);

CREATE INDEX IF NOT EXISTS idx_processing_status_id ON document_processing_status(processing_id);
CREATE INDEX IF NOT EXISTS idx_processing_status_document ON document_processing_status(document_id);
CREATE INDEX IF NOT EXISTS idx_processing_status_status ON document_processing_status(status);

CREATE INDEX IF NOT EXISTS idx_quality_metrics_document ON document_quality_metrics(document_id);

-- Vector similarity search indexes (if using pgvector)
CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Add updated_at triggers
CREATE TRIGGER update_document_chunks_updated_at 
    BEFORE UPDATE ON document_chunks 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_processing_status_updated_at 
    BEFORE UPDATE ON document_processing_status 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) policies
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_layout_analysis ENABLE ROW LEVEL SECURITY;
ALTER TABLE image_text_associations ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_processing_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_quality_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies for document_chunks
CREATE POLICY "Users can view their own document chunks" ON document_chunks
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own document chunks" ON document_chunks
    FOR INSERT WITH CHECK (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own document chunks" ON document_chunks
    FOR UPDATE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own document chunks" ON document_chunks
    FOR DELETE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for document_images
CREATE POLICY "Users can view their own document images" ON document_images
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own document images" ON document_images
    FOR INSERT WITH CHECK (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own document images" ON document_images
    FOR UPDATE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own document images" ON document_images
    FOR DELETE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for document_layout_analysis
CREATE POLICY "Users can view their own layout analysis" ON document_layout_analysis
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own layout analysis" ON document_layout_analysis
    FOR INSERT WITH CHECK (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own layout analysis" ON document_layout_analysis
    FOR UPDATE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own layout analysis" ON document_layout_analysis
    FOR DELETE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for image_text_associations
CREATE POLICY "Users can view their own image associations" ON image_text_associations
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own image associations" ON image_text_associations
    FOR INSERT WITH CHECK (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own image associations" ON image_text_associations
    FOR UPDATE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can delete their own image associations" ON image_text_associations
    FOR DELETE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for document_processing_status
CREATE POLICY "Users can view their own processing status" ON document_processing_status
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own processing status" ON document_processing_status
    FOR INSERT WITH CHECK (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own processing status" ON document_processing_status
    FOR UPDATE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

-- RLS Policies for document_quality_metrics
CREATE POLICY "Users can view their own quality metrics" ON document_quality_metrics
    FOR SELECT USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can insert their own quality metrics" ON document_quality_metrics
    FOR INSERT WITH CHECK (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "Users can update their own quality metrics" ON document_quality_metrics
    FOR UPDATE USING (
        document_id IN (
            SELECT id FROM pdf_processing_results WHERE user_id = auth.uid()
        )
    );

-- Grant necessary permissions
GRANT ALL ON document_chunks TO authenticated;
GRANT ALL ON document_images TO authenticated;
GRANT ALL ON document_layout_analysis TO authenticated;
GRANT ALL ON image_text_associations TO authenticated;
GRANT ALL ON document_processing_status TO authenticated;
GRANT ALL ON document_quality_metrics TO authenticated;

-- Grant usage on sequences
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Comments for documentation
COMMENT ON TABLE document_chunks IS 'Layout-aware text chunks from processed PDF documents';
COMMENT ON TABLE document_images IS 'Images extracted from PDF documents with metadata';
COMMENT ON TABLE document_layout_analysis IS 'Layout analysis results for document pages';
COMMENT ON TABLE image_text_associations IS 'Associations between images and text content';
COMMENT ON TABLE document_processing_status IS 'Real-time processing status tracking';
COMMENT ON TABLE document_quality_metrics IS 'Quality metrics for processed documents';

COMMENT ON COLUMN document_chunks.embedding IS 'Vector embedding for semantic search (1536 dimensions for OpenAI)';
COMMENT ON COLUMN document_chunks.bbox IS 'Bounding box coordinates: {x, y, width, height}';
COMMENT ON COLUMN document_chunks.metadata IS 'Additional metadata: element_ids, image_ids, semantic_tags, confidence, word_count, etc.';

COMMENT ON COLUMN document_images.bbox IS 'Image bounding box coordinates: {x, y, width, height}';
COMMENT ON COLUMN document_images.metadata IS 'Image analysis results: detected_objects, material_types, color_analysis, etc.';

COMMENT ON COLUMN image_text_associations.spatial_relationship IS 'Spatial relationship: {direction, distance, alignment}';
COMMENT ON COLUMN image_text_associations.metadata IS 'Association metadata: keywords, material_references, technical_terms';