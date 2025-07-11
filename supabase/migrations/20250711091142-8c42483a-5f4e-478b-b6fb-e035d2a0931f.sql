-- Enable pgvector extension for vector operations
CREATE EXTENSION IF NOT EXISTS vector;

-- Create enum for material categories
CREATE TYPE public.material_category AS ENUM (
  'metals',
  'plastics', 
  'ceramics',
  'composites',
  'textiles',
  'wood',
  'glass',
  'rubber',
  'concrete',
  'other'
);

-- Create enum for recognition methods
CREATE TYPE public.detection_method AS ENUM (
  'visual',
  'spectral', 
  'thermal',
  'ocr',
  'voice',
  'combined'
);

-- Create enum for processing status
CREATE TYPE public.processing_status AS ENUM (
  'pending',
  'processing', 
  'completed',
  'failed',
  'cancelled'
);

-- Core Materials Catalog
CREATE TABLE public.materials_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  category material_category NOT NULL,
  description TEXT,
  properties JSONB DEFAULT '{}', -- thermal, mechanical, electrical properties
  chemical_composition JSONB DEFAULT '{}',
  safety_data JSONB DEFAULT '{}',
  standards TEXT[] DEFAULT '{}', -- ISO, ASTM, DIN standards
  embedding VECTOR(1536), -- OpenAI embeddings for RAG
  thumbnail_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Uploaded Images/Documents
CREATE TABLE public.uploaded_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT NOT NULL, -- 'image', 'document', '3d_model'
  file_size BIGINT,
  storage_path TEXT NOT NULL,
  metadata JSONB DEFAULT '{}', -- EXIF, dimensions, etc.
  upload_status processing_status DEFAULT 'completed',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Recognition Results
CREATE TABLE public.recognition_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  file_id UUID REFERENCES uploaded_files(id) NOT NULL,
  material_id UUID REFERENCES materials_catalog(id),
  confidence_score FLOAT CHECK (confidence_score >= 0 AND confidence_score <= 1),
  detection_method detection_method NOT NULL,
  ai_model_version TEXT,
  properties_detected JSONB DEFAULT '{}',
  processing_time_ms INTEGER,
  user_verified BOOLEAN DEFAULT FALSE,
  embedding VECTOR(1536), -- Result embedding for similarity
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  verified_at TIMESTAMP WITH TIME ZONE,
  verified_by UUID REFERENCES auth.users(id)
);

-- Processing Queue for batch operations
CREATE TABLE public.processing_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) NOT NULL,
  job_type TEXT NOT NULL, -- 'recognition', '3d_reconstruction', 'batch_analysis'
  input_data JSONB NOT NULL,
  status processing_status DEFAULT 'pending',
  priority INTEGER DEFAULT 5,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  result JSONB,
  error_message TEXT,
  processing_time_ms INTEGER
);

-- Material Knowledge Base for RAG
CREATE TABLE public.material_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_type TEXT NOT NULL, -- 'datasheet', 'research', 'standard', 'user_input'
  material_ids UUID[] DEFAULT '{}',
  embedding VECTOR(1536),
  metadata JSONB DEFAULT '{}',
  relevance_score FLOAT DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Analytics Events
CREATE TABLE public.analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  event_type TEXT NOT NULL, -- 'recognition_started', 'material_identified', 'user_feedback'
  event_data JSONB DEFAULT '{}',
  session_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.materials_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.uploaded_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recognition_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processing_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.material_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for materials_catalog
CREATE POLICY "Materials are viewable by everyone"
ON public.materials_catalog FOR SELECT
USING (true);

CREATE POLICY "Admins can manage materials"
ON public.materials_catalog FOR ALL
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Analysts can create materials"
ON public.materials_catalog FOR INSERT
WITH CHECK (public.has_role(auth.uid(), 'analyst') OR public.has_role(auth.uid(), 'admin'));

-- RLS Policies for uploaded_files
CREATE POLICY "Users can view their own files"
ON public.uploaded_files FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can upload files"
ON public.uploaded_files FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Admins can view all files"
ON public.uploaded_files FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- RLS Policies for recognition_results
CREATE POLICY "Users can view results for their files"
ON public.recognition_results FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.uploaded_files 
    WHERE id = recognition_results.file_id 
    AND user_id = auth.uid()
  )
);

CREATE POLICY "System can create recognition results"
ON public.recognition_results FOR INSERT
WITH CHECK (true);

CREATE POLICY "Users can verify their own results"
ON public.recognition_results FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.uploaded_files 
    WHERE id = recognition_results.file_id 
    AND user_id = auth.uid()
  )
);

-- RLS Policies for processing_queue
CREATE POLICY "Users can view their own jobs"
ON public.processing_queue FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create processing jobs"
ON public.processing_queue FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- RLS Policies for material_knowledge
CREATE POLICY "Knowledge is viewable by everyone"
ON public.material_knowledge FOR SELECT
USING (true);

CREATE POLICY "Analysts and admins can add knowledge"
ON public.material_knowledge FOR INSERT
WITH CHECK (
  public.has_role(auth.uid(), 'analyst') OR 
  public.has_role(auth.uid(), 'admin')
);

-- RLS Policies for analytics_events
CREATE POLICY "Users can view their own analytics"
ON public.analytics_events FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "System can create analytics events"
ON public.analytics_events FOR INSERT
WITH CHECK (true);

CREATE POLICY "Admins can view all analytics"
ON public.analytics_events FOR SELECT
USING (public.has_role(auth.uid(), 'admin'));

-- Create indexes for performance
CREATE INDEX idx_materials_category ON public.materials_catalog(category);
CREATE INDEX idx_materials_embedding ON public.materials_catalog USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_recognition_confidence ON public.recognition_results(confidence_score DESC);
CREATE INDEX idx_recognition_method ON public.recognition_results(detection_method);
CREATE INDEX idx_processing_queue_status ON public.processing_queue(status, priority DESC, created_at);
CREATE INDEX idx_knowledge_embedding ON public.material_knowledge USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_analytics_events_type ON public.analytics_events(event_type, created_at);

-- Vector similarity search function
CREATE OR REPLACE FUNCTION public.vector_similarity_search(
  query_embedding vector(1536),
  image_embedding vector(1536) DEFAULT NULL,
  match_threshold float DEFAULT 0.8,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  material_id uuid,
  similarity_score float,
  material_name text,
  properties jsonb,
  category material_category
) 
LANGUAGE sql STABLE
AS $$
  SELECT 
    m.id,
    GREATEST(
      1 - (m.embedding <=> query_embedding),
      COALESCE(1 - (r.embedding <=> image_embedding), 0)
    ) as similarity_score,
    m.name,
    m.properties,
    m.category
  FROM public.materials_catalog m
  LEFT JOIN public.recognition_results r ON r.material_id = m.id
  WHERE 
    m.embedding IS NOT NULL
    AND (
      (1 - (m.embedding <=> query_embedding)) > match_threshold
      OR (image_embedding IS NOT NULL AND r.embedding IS NOT NULL AND (1 - (r.embedding <=> image_embedding)) > match_threshold)
    )
  ORDER BY similarity_score DESC
  LIMIT match_count;
$$;

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('material-images', 'material-images', true);
INSERT INTO storage.buckets (id, name, public) VALUES ('material-documents', 'material-documents', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('3d-models', '3d-models', true);

-- Storage policies for material-images bucket
CREATE POLICY "Material images are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = 'material-images');

CREATE POLICY "Users can upload material images"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'material-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can update their material images"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'material-images' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for material-documents bucket
CREATE POLICY "Users can view their own documents"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'material-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Users can upload documents"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'material-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Storage policies for 3d-models bucket
CREATE POLICY "3D models are publicly viewable"
ON storage.objects FOR SELECT
USING (bucket_id = '3d-models');

CREATE POLICY "Users can upload 3D models"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = '3d-models' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Trigger to update updated_at timestamps
CREATE TRIGGER update_materials_catalog_updated_at
BEFORE UPDATE ON public.materials_catalog
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample materials data
INSERT INTO public.materials_catalog (name, category, description, properties, standards) VALUES
('Aluminum 6061-T6', 'metals', 'High-strength aluminum alloy with excellent corrosion resistance', 
 '{"density": 2.7, "yield_strength": 276, "tensile_strength": 310, "thermal_conductivity": 167}',
 ARRAY['ASTM B221', 'ISO 6361']),
('Stainless Steel 316', 'metals', 'Austenitic stainless steel with superior corrosion resistance',
 '{"density": 8.0, "yield_strength": 205, "tensile_strength": 515, "thermal_conductivity": 16.2}',
 ARRAY['ASTM A240', 'ISO 5832']),
('Carbon Steel A36', 'metals', 'Low-carbon structural steel for construction applications',
 '{"density": 7.85, "yield_strength": 250, "tensile_strength": 400, "thermal_conductivity": 51.9}',
 ARRAY['ASTM A36', 'ISO 630']),
('ABS Plastic', 'plastics', 'Thermoplastic polymer with good impact resistance',
 '{"density": 1.05, "tensile_strength": 40, "flexural_modulus": 2300, "melting_point": 105}',
 ARRAY['ASTM D792', 'ISO 527']),
('Polycarbonate', 'plastics', 'Transparent thermoplastic with high impact strength',
 '{"density": 1.2, "tensile_strength": 65, "flexural_modulus": 2300, "glass_transition": 147}',
 ARRAY['ASTM D3935', 'ISO 7391']);

-- Sample knowledge base entries
INSERT INTO public.material_knowledge (title, content, source_type, material_ids) VALUES
('Aluminum Alloy Properties', 'Aluminum 6061-T6 is a precipitation-hardened aluminum alloy containing magnesium and silicon as its major alloying elements. It has good mechanical properties, exhibits good weldability, and is very commonly extruded.', 'datasheet', 
 ARRAY[(SELECT id FROM public.materials_catalog WHERE name = 'Aluminum 6061-T6')]),
('Stainless Steel Corrosion Resistance', '316 stainless steel offers superior corrosion resistance compared to other stainless steels when exposed to many aggressive chemicals. The inclusion of molybdenum significantly increases corrosion resistance.', 'research',
 ARRAY[(SELECT id FROM public.materials_catalog WHERE name = 'Stainless Steel 316')]);