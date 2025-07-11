-- Create table for NeRF processing results
CREATE TABLE public.nerf_reconstructions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  source_image_urls TEXT[] NOT NULL,
  reconstruction_status TEXT DEFAULT 'pending',
  model_file_url TEXT,
  mesh_file_url TEXT,
  point_cloud_url TEXT,
  processing_time_ms INTEGER,
  quality_score FLOAT,
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.nerf_reconstructions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own NeRF reconstructions" 
ON public.nerf_reconstructions 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own NeRF reconstructions" 
ON public.nerf_reconstructions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own NeRF reconstructions" 
ON public.nerf_reconstructions 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_nerf_reconstructions_updated_at
BEFORE UPDATE ON public.nerf_reconstructions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add indexes for better performance
CREATE INDEX idx_nerf_reconstructions_user_id ON public.nerf_reconstructions(user_id);
CREATE INDEX idx_nerf_reconstructions_status ON public.nerf_reconstructions(reconstruction_status);
CREATE INDEX idx_nerf_reconstructions_created_at ON public.nerf_reconstructions(created_at DESC);

-- Create storage bucket for NeRF outputs
INSERT INTO storage.buckets (id, name, public) VALUES ('nerf-models', 'nerf-models', true);

-- Create storage policies for NeRF models
CREATE POLICY "NeRF models are publicly accessible" 
ON storage.objects 
FOR SELECT 
USING (bucket_id = 'nerf-models');

CREATE POLICY "Users can upload their own NeRF models" 
ON storage.objects 
FOR INSERT 
WITH CHECK (bucket_id = 'nerf-models' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can update their own NeRF models" 
ON storage.objects 
FOR UPDATE 
USING (bucket_id = 'nerf-models' AND auth.uid()::text = (storage.foldername(name))[1]);