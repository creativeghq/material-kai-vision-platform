-- Enhanced database schema for hybrid Python processing
-- Add new fields to pdf_processing_results for advanced features
ALTER TABLE pdf_processing_results 
ADD COLUMN document_structure jsonb DEFAULT '{}',
ADD COLUMN extracted_images jsonb DEFAULT '{}',
ADD COLUMN cross_page_references jsonb DEFAULT '{}',
ADD COLUMN python_processor_version text,
ADD COLUMN layout_analysis_version text;

-- Add new fields to pdf_processing_tiles for advanced image and structure data
ALTER TABLE pdf_processing_tiles
ADD COLUMN extracted_images jsonb DEFAULT '{}',
ADD COLUMN image_embeddings jsonb DEFAULT '{}',
ADD COLUMN document_element_type text,
ADD COLUMN cross_references jsonb DEFAULT '{}',
ADD COLUMN layout_confidence numeric,
ADD COLUMN pymupdf_data jsonb DEFAULT '{}';

-- Create new table for extracted images with detailed metadata
CREATE TABLE IF NOT EXISTS pdf_extracted_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_processing_id uuid NOT NULL REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  tile_id uuid REFERENCES pdf_processing_tiles(id) ON DELETE SET NULL,
  page_number integer NOT NULL,
  image_index integer NOT NULL,
  image_url text,
  image_type text, -- 'embedded', 'figure', 'chart', 'diagram', 'photo'
  dimensions jsonb, -- {width, height, dpi}
  bounding_box jsonb, -- {x, y, width, height}
  extracted_text text, -- OCR text from image
  material_detected boolean DEFAULT false,
  material_confidence numeric,
  image_embedding vector(512),
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Create table for document structure analysis
CREATE TABLE IF NOT EXISTS pdf_document_structure (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_processing_id uuid NOT NULL REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  structure_type text NOT NULL, -- 'header', 'footer', 'section', 'table', 'figure', 'caption'
  page_number integer NOT NULL,
  hierarchy_level integer,
  content text,
  bounding_box jsonb,
  parent_element_id uuid REFERENCES pdf_document_structure(id),
  confidence_score numeric,
  metadata jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- Create table for cross-page material references
CREATE TABLE IF NOT EXISTS pdf_material_correlations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pdf_processing_id uuid NOT NULL REFERENCES pdf_processing_results(id) ON DELETE CASCADE,
  primary_tile_id uuid NOT NULL REFERENCES pdf_processing_tiles(id) ON DELETE CASCADE,
  related_tile_id uuid NOT NULL REFERENCES pdf_processing_tiles(id) ON DELETE CASCADE,
  correlation_type text NOT NULL, -- 'same_material', 'related_spec', 'continued_from', 'see_also'
  confidence_score numeric NOT NULL,
  correlation_data jsonb DEFAULT '{}',
  created_at timestamp with time zone DEFAULT now()
);

-- Add RLS policies for new tables
ALTER TABLE pdf_extracted_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_document_structure ENABLE ROW LEVEL SECURITY;
ALTER TABLE pdf_material_correlations ENABLE ROW LEVEL SECURITY;

-- Users can view images from their PDF processing
CREATE POLICY "Users can view their PDF extracted images" 
ON pdf_extracted_images 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM pdf_processing_results ppr 
  WHERE ppr.id = pdf_extracted_images.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

-- System can create images during processing
CREATE POLICY "System can create PDF extracted images" 
ON pdf_extracted_images 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM pdf_processing_results ppr 
  WHERE ppr.id = pdf_extracted_images.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

-- Similar policies for document structure
CREATE POLICY "Users can view their PDF document structure" 
ON pdf_document_structure 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM pdf_processing_results ppr 
  WHERE ppr.id = pdf_document_structure.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

CREATE POLICY "System can create PDF document structure" 
ON pdf_document_structure 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM pdf_processing_results ppr 
  WHERE ppr.id = pdf_document_structure.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

-- Similar policies for material correlations
CREATE POLICY "Users can view their PDF material correlations" 
ON pdf_material_correlations 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM pdf_processing_results ppr 
  WHERE ppr.id = pdf_material_correlations.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

CREATE POLICY "System can create PDF material correlations" 
ON pdf_material_correlations 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM pdf_processing_results ppr 
  WHERE ppr.id = pdf_material_correlations.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

-- Create indexes for performance
CREATE INDEX idx_pdf_extracted_images_processing_id ON pdf_extracted_images(pdf_processing_id);
CREATE INDEX idx_pdf_extracted_images_page ON pdf_extracted_images(page_number);
CREATE INDEX idx_pdf_document_structure_processing_id ON pdf_document_structure(pdf_processing_id);
CREATE INDEX idx_pdf_document_structure_page ON pdf_document_structure(page_number);
CREATE INDEX idx_pdf_material_correlations_processing_id ON pdf_material_correlations(pdf_processing_id);
CREATE INDEX idx_pdf_material_correlations_primary_tile ON pdf_material_correlations(primary_tile_id);