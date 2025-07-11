-- Create table for SVBRDF processing results
CREATE TABLE public.svbrdf_extractions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_image_url TEXT NOT NULL,
  material_id UUID,
  extraction_status TEXT DEFAULT 'pending',
  albedo_map_url TEXT,
  normal_map_url TEXT,
  roughness_map_url TEXT,
  metallic_map_url TEXT,
  height_map_url TEXT,
  extracted_properties JSONB DEFAULT '{}',
  confidence_score FLOAT,
  processing_time_ms INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.svbrdf_extractions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own SVBRDF extractions" 
ON public.svbrdf_extractions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own SVBRDF extractions" 
ON public.svbrdf_extractions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own SVBRDF extractions" 
ON public.svbrdf_extractions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_svbrdf_extractions_updated_at
BEFORE UPDATE ON public.svbrdf_extractions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_svbrdf_extractions_user_id ON public.svbrdf_extractions(user_id);
CREATE INDEX idx_svbrdf_extractions_material_id ON public.svbrdf_extractions(material_id);
CREATE INDEX idx_svbrdf_extractions_status ON public.svbrdf_extractions(extraction_status);
CREATE INDEX idx_svbrdf_extractions_created_at ON public.svbrdf_extractions(created_at DESC);

-- Create storage bucket for SVBRDF maps
INSERT INTO storage.buckets (id, name, public) VALUES ('svbrdf-maps', 'svbrdf-maps', true);

-- Create storage policies for SVBRDF maps
CREATE POLICY "SVBRDF maps are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'svbrdf-maps');

CREATE POLICY "Users can upload their own SVBRDF maps" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'svbrdf-maps' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own SVBRDF maps" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'svbrdf-maps' AND auth.uid()::text = (storage.foldername(name))[1]);