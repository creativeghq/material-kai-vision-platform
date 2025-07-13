-- Create table for temporary scraped materials
CREATE TABLE public.scraped_materials_temp (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  scraping_session_id UUID NOT NULL DEFAULT gen_random_uuid(),
  material_data JSONB NOT NULL,
  source_url TEXT NOT NULL,
  scraped_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reviewed BOOLEAN NOT NULL DEFAULT false,
  approved BOOLEAN NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraped_materials_temp ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own scraped materials" 
ON public.scraped_materials_temp 
FOR ALL 
USING (auth.uid() = user_id);

-- Create indexes for better performance
CREATE INDEX idx_scraped_materials_temp_user_id ON public.scraped_materials_temp(user_id);
CREATE INDEX idx_scraped_materials_temp_session_id ON public.scraped_materials_temp(scraping_session_id);
CREATE INDEX idx_scraped_materials_temp_reviewed ON public.scraped_materials_temp(reviewed);

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_scraped_materials_temp_updated_at
BEFORE UPDATE ON public.scraped_materials_temp
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();