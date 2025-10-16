-- Add Quality Metrics Columns to document_chunks Table
-- This migration adds columns to track semantic coherence and quality metrics

-- Add coherence score column
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS coherence_score DECIMAL(3,2) DEFAULT NULL;

-- Add detailed coherence metrics as JSONB
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS coherence_metrics JSONB DEFAULT NULL;

-- Add quality assessment column
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS quality_assessment VARCHAR(50) DEFAULT NULL;

-- Add recommendations column
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS quality_recommendations TEXT[] DEFAULT NULL;

-- Add processing metadata
ALTER TABLE document_chunks 
ADD COLUMN IF NOT EXISTS processing_metadata JSONB DEFAULT NULL;

-- Create index on coherence_score for efficient querying
CREATE INDEX IF NOT EXISTS idx_document_chunks_coherence_score 
ON document_chunks(coherence_score DESC);

-- Create index on document_id and coherence_score for filtering
CREATE INDEX IF NOT EXISTS idx_document_chunks_doc_coherence 
ON document_chunks(document_id, coherence_score DESC);

-- Add Quality Metrics Columns to document_images Table
-- This migration adds columns to track image quality metrics

-- Add quality score column
ALTER TABLE document_images 
ADD COLUMN IF NOT EXISTS quality_score DECIMAL(3,2) DEFAULT NULL;

-- Add quality metrics as JSONB
ALTER TABLE document_images 
ADD COLUMN IF NOT EXISTS quality_metrics JSONB DEFAULT NULL;

-- Add image analysis metadata
ALTER TABLE document_images 
ADD COLUMN IF NOT EXISTS analysis_metadata JSONB DEFAULT NULL;

-- Create index on quality_score
CREATE INDEX IF NOT EXISTS idx_document_images_quality_score 
ON document_images(quality_score DESC);

-- Create index on document_id and quality_score
CREATE INDEX IF NOT EXISTS idx_document_images_doc_quality 
ON document_images(document_id, quality_score DESC);

-- Add Quality Metrics Table for Document-Level Aggregation
CREATE TABLE IF NOT EXISTS document_quality_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  -- Chunk metrics
  total_chunks INTEGER DEFAULT 0,
  average_chunk_size INTEGER DEFAULT 0,
  average_coherence_score DECIMAL(3,2) DEFAULT 0,
  chunks_with_high_coherence INTEGER DEFAULT 0,
  chunks_with_low_coherence INTEGER DEFAULT 0,
  
  -- Image metrics
  total_images INTEGER DEFAULT 0,
  average_image_quality DECIMAL(3,2) DEFAULT 0,
  images_with_high_quality INTEGER DEFAULT 0,
  images_with_low_quality INTEGER DEFAULT 0,
  
  -- Overall metrics
  overall_quality_score DECIMAL(3,2) DEFAULT 0,
  quality_assessment VARCHAR(50) DEFAULT NULL,
  
  -- Processing info
  calculated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for document_quality_metrics
CREATE INDEX IF NOT EXISTS idx_document_quality_metrics_document_id 
ON document_quality_metrics(document_id);

CREATE INDEX IF NOT EXISTS idx_document_quality_metrics_workspace_id 
ON document_quality_metrics(workspace_id);

CREATE INDEX IF NOT EXISTS idx_document_quality_metrics_overall_score 
ON document_quality_metrics(overall_quality_score DESC);

-- Add Processing Metrics Table for Tracking Processing Performance
CREATE TABLE IF NOT EXISTS processing_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  workspace_id UUID NOT NULL,
  
  -- Processing times
  total_processing_time_ms INTEGER DEFAULT 0,
  mivaa_processing_time_ms INTEGER DEFAULT 0,
  chunking_time_ms INTEGER DEFAULT 0,
  embedding_time_ms INTEGER DEFAULT 0,
  storage_time_ms INTEGER DEFAULT 0,
  
  -- Processing stats
  pages_processed INTEGER DEFAULT 0,
  chunks_generated INTEGER DEFAULT 0,
  images_extracted INTEGER DEFAULT 0,
  embeddings_generated INTEGER DEFAULT 0,
  
  -- Performance indicators
  chunks_per_second DECIMAL(5,2) DEFAULT 0,
  pages_per_second DECIMAL(5,2) DEFAULT 0,
  
  -- Status
  status VARCHAR(50) DEFAULT 'pending',
  error_message TEXT DEFAULT NULL,
  
  -- Timestamps
  started_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  completed_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  
  CONSTRAINT fk_workspace FOREIGN KEY (workspace_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes for processing_metrics
CREATE INDEX IF NOT EXISTS idx_processing_metrics_document_id 
ON processing_metrics(document_id);

CREATE INDEX IF NOT EXISTS idx_processing_metrics_workspace_id 
ON processing_metrics(workspace_id);

CREATE INDEX IF NOT EXISTS idx_processing_metrics_status 
ON processing_metrics(status);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON document_chunks TO authenticated;
GRANT SELECT, INSERT, UPDATE ON document_images TO authenticated;
GRANT SELECT, INSERT, UPDATE ON document_quality_metrics TO authenticated;
GRANT SELECT, INSERT, UPDATE ON processing_metrics TO authenticated;

-- Add comments for documentation
COMMENT ON COLUMN document_chunks.coherence_score IS 'Overall semantic coherence score (0-1)';
COMMENT ON COLUMN document_chunks.coherence_metrics IS 'Detailed coherence metrics including semantic completeness, boundary quality, etc.';
COMMENT ON COLUMN document_chunks.quality_assessment IS 'Quality assessment (Excellent, Very Good, Good, Fair, Acceptable, Poor)';
COMMENT ON COLUMN document_chunks.quality_recommendations IS 'Array of recommendations for improvement';

COMMENT ON COLUMN document_images.quality_score IS 'Image quality score (0-1)';
COMMENT ON COLUMN document_images.quality_metrics IS 'Detailed image quality metrics';

COMMENT ON TABLE document_quality_metrics IS 'Aggregated quality metrics for documents';
COMMENT ON TABLE processing_metrics IS 'Processing performance metrics and statistics';

