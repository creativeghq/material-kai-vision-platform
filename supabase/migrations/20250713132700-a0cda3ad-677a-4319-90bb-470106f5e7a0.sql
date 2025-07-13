-- Create scraping sessions table to store crawl details for retry functionality
CREATE TABLE public.scraping_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  session_id TEXT NOT NULL UNIQUE,
  source_url TEXT NOT NULL,
  scraping_config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active',
  total_materials_found INTEGER DEFAULT 0,
  materials_processed INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.scraping_sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can manage their own scraping sessions"
ON public.scraping_sessions
FOR ALL
USING (auth.uid() = user_id);

-- Create trigger for updated_at
CREATE TRIGGER update_scraping_sessions_updated_at
  BEFORE UPDATE ON public.scraping_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();