-- Create PDF processing results table for storing extracted material data from PDFs
CREATE TABLE public.pdf_processing_results (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  original_filename TEXT NOT NULL,
  file_size BIGINT,
  file_url TEXT NOT NULL,
  
  -- Processing metadata
  processing_status TEXT NOT NULL DEFAULT 'pending'::text CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed')),
  processing_started_at TIMESTAMP WITH TIME ZONE,
  processing_completed_at TIMESTAMP WITH TIME ZONE,
  processing_time_ms INTEGER,
  error_message TEXT,
  
  -- PDF document metadata
  total_pages INTEGER,
  document_title TEXT,
  document_author TEXT,
  document_subject TEXT,
  document_keywords TEXT,
  
  -- Extraction results summary
  total_tiles_extracted INTEGER DEFAULT 0,
  materials_identified_count INTEGER DEFAULT 0,
  confidence_score_avg NUMERIC(3,2),
  
  -- Processing configuration
  extraction_options JSONB DEFAULT '{}'::jsonb,
  tile_size_pixels INTEGER DEFAULT 512,
  overlap_percentage INTEGER DEFAULT 10,
  
  -- OCR and ML model versions used
  ocr_model_version TEXT,
  material_recognition_model_version TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create PDF processing tiles table for individual page sections
CREATE TABLE public.pdf_processing_tiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  pdf_processing_id UUID NOT NULL REFERENCES public.pdf_processing_results(id) ON DELETE CASCADE,
  
  -- Tile location and metadata
  page_number INTEGER NOT NULL,
  tile_index INTEGER NOT NULL,
  x_coordinate INTEGER NOT NULL,
  y_coordinate INTEGER NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  
  -- Extracted content
  extracted_text TEXT,
  ocr_confidence NUMERIC(3,2),
  image_url TEXT, -- URL to the tile image in storage
  
  -- Material classification results
  material_detected BOOLEAN DEFAULT false,
  material_type TEXT, -- detected material category
  material_confidence NUMERIC(3,2),
  
  -- Extracted structured data
  structured_data JSONB DEFAULT '{}'::jsonb,
  metadata_extracted JSONB DEFAULT '{}'::jsonb,
  
  -- Relationships
  related_material_id UUID REFERENCES public.materials_catalog(id),
  
  -- Vector embeddings for semantic search
  text_embedding VECTOR(1536), -- OpenAI embedding
  image_embedding VECTOR(512), -- CLIP embedding
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure unique tile per PDF page
  UNIQUE(pdf_processing_id, page_number, tile_index)
);

-- Create storage bucket for PDF files and extracted images
INSERT INTO storage.buckets (id, name, public) VALUES 
  ('pdf-documents', 'pdf-documents', false),
  ('pdf-tiles', 'pdf-tiles', true);

-- Enable RLS on PDF processing tables
ALTER TABLE public.pdf_processing_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pdf_processing_tiles ENABLE ROW LEVEL SECURITY;

-- RLS policies for PDF processing results
CREATE POLICY "Users can view their own PDF processing results" 
ON public.pdf_processing_results 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own PDF processing results" 
ON public.pdf_processing_results 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own PDF processing results" 
ON public.pdf_processing_results 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own PDF processing results" 
ON public.pdf_processing_results 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for PDF processing tiles
CREATE POLICY "Users can view tiles from their PDF processing" 
ON public.pdf_processing_tiles 
FOR SELECT 
USING (EXISTS (
  SELECT 1 FROM public.pdf_processing_results ppr 
  WHERE ppr.id = pdf_processing_tiles.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

CREATE POLICY "System can create PDF processing tiles" 
ON public.pdf_processing_tiles 
FOR INSERT 
WITH CHECK (EXISTS (
  SELECT 1 FROM public.pdf_processing_results ppr 
  WHERE ppr.id = pdf_processing_tiles.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

CREATE POLICY "System can update PDF processing tiles" 
ON public.pdf_processing_tiles 
FOR UPDATE 
USING (EXISTS (
  SELECT 1 FROM public.pdf_processing_results ppr 
  WHERE ppr.id = pdf_processing_tiles.pdf_processing_id 
  AND ppr.user_id = auth.uid()
));

-- Storage policies for PDF documents (private)
CREATE POLICY "Users can upload their own PDF documents" 
ON storage.objects 
FOR INSERT 
WITH CHECK (
  bucket_id = 'pdf-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can view their own PDF documents" 
ON storage.objects 
FOR SELECT 
USING (
  bucket_id = 'pdf-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for PDF tiles (public for viewing)
CREATE POLICY "PDF tile images are publicly viewable" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'pdf-tiles');

CREATE POLICY "System can create PDF tile images" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'pdf-tiles');

-- Add indexes for performance
CREATE INDEX idx_pdf_processing_user_id ON public.pdf_processing_results(user_id);
CREATE INDEX idx_pdf_processing_status ON public.pdf_processing_results(processing_status);
CREATE INDEX idx_pdf_processing_created_at ON public.pdf_processing_results(created_at);

CREATE INDEX idx_pdf_tiles_processing_id ON public.pdf_processing_tiles(pdf_processing_id);
CREATE INDEX idx_pdf_tiles_page_number ON public.pdf_processing_tiles(page_number);
CREATE INDEX idx_pdf_tiles_material_detected ON public.pdf_processing_tiles(material_detected);
CREATE INDEX idx_pdf_tiles_material_type ON public.pdf_processing_tiles(material_type);

-- Add trigger for updating timestamps
CREATE TRIGGER update_pdf_processing_results_updated_at
  BEFORE UPDATE ON public.pdf_processing_results
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_pdf_processing_tiles_updated_at
  BEFORE UPDATE ON public.pdf_processing_tiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();