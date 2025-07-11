-- Create table for 3D generation requests and results
CREATE TABLE public.generation_3d (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  prompt TEXT NOT NULL,
  room_type TEXT,
  style TEXT,
  materials_used TEXT[] DEFAULT '{}',
  material_ids UUID[] DEFAULT '{}',
  generation_status TEXT DEFAULT 'pending',
  result_data JSONB DEFAULT '{}',
  image_urls TEXT[] DEFAULT '{}',
  model_used TEXT DEFAULT 'prithivMLmods/Canopus-Interior-Architecture-0.1',
  processing_time_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.generation_3d ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their own 3D generations" 
ON public.generation_3d 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own 3D generations" 
ON public.generation_3d 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own 3D generations" 
ON public.generation_3d 
FOR UPDATE 
USING (auth.uid() = user_id);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_generation_3d_updated_at
BEFORE UPDATE ON public.generation_3d
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Add index for better performance
CREATE INDEX idx_generation_3d_user_id ON public.generation_3d(user_id);
CREATE INDEX idx_generation_3d_status ON public.generation_3d(generation_status);
CREATE INDEX idx_generation_3d_created_at ON public.generation_3d(created_at DESC);