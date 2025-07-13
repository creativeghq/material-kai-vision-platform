-- Create improved scraping tables for better page tracking

-- Drop existing tables if they exist (clean slate)
DROP TABLE IF EXISTS public.scraping_processing_queue CASCADE;
DROP TABLE IF EXISTS public.scraping_chunks CASCADE;

-- Create new scraping_pages table for individual page tracking
CREATE TABLE public.scraping_pages (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL,
  url TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE,
  materials_found INTEGER DEFAULT 0,
  error_message TEXT,
  processing_time_ms INTEGER,
  retry_count INTEGER DEFAULT 0,
  page_index INTEGER NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Update scraping_sessions table structure
ALTER TABLE public.scraping_sessions 
ADD COLUMN IF NOT EXISTS total_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS completed_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS failed_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS pending_pages INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS session_type TEXT DEFAULT 'sitemap',
ADD COLUMN IF NOT EXISTS current_page_url TEXT,
ADD COLUMN IF NOT EXISTS progress_percentage NUMERIC DEFAULT 0;

-- Enable RLS on new table
ALTER TABLE public.scraping_pages ENABLE ROW LEVEL SECURITY;

-- Create policies for scraping_pages
CREATE POLICY "Users can manage their own scraping pages" 
ON public.scraping_pages 
FOR ALL 
USING (
  session_id IN (
    SELECT id FROM public.scraping_sessions 
    WHERE user_id = auth.uid()
  )
);

-- Create indexes for better performance
CREATE INDEX idx_scraping_pages_session_id ON public.scraping_pages(session_id);
CREATE INDEX idx_scraping_pages_status ON public.scraping_pages(status);
CREATE INDEX idx_scraping_pages_page_index ON public.scraping_pages(page_index);

-- Create trigger for updated_at on scraping_pages
CREATE TRIGGER update_scraping_pages_updated_at
  BEFORE UPDATE ON public.scraping_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create function to update session statistics
CREATE OR REPLACE FUNCTION public.update_session_statistics(session_uuid UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE public.scraping_sessions 
  SET 
    completed_pages = (
      SELECT COUNT(*) FROM public.scraping_pages 
      WHERE session_id = session_uuid AND status = 'completed'
    ),
    failed_pages = (
      SELECT COUNT(*) FROM public.scraping_pages 
      WHERE session_id = session_uuid AND status = 'failed'
    ),
    pending_pages = (
      SELECT COUNT(*) FROM public.scraping_pages 
      WHERE session_id = session_uuid AND status = 'pending'
    ),
    total_materials_found = (
      SELECT COALESCE(SUM(materials_found), 0) FROM public.scraping_pages 
      WHERE session_id = session_uuid
    ),
    progress_percentage = (
      CASE 
        WHEN total_pages > 0 THEN 
          (SELECT COUNT(*) FROM public.scraping_pages 
           WHERE session_id = session_uuid AND status IN ('completed', 'failed')) * 100.0 / total_pages
        ELSE 0
      END
    ),
    updated_at = now()
  WHERE id = session_uuid;
END;
$$;

-- Create trigger to auto-update session stats when pages change
CREATE OR REPLACE FUNCTION public.trigger_update_session_stats()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Update stats for the affected session
  PERFORM public.update_session_statistics(
    CASE 
      WHEN TG_OP = 'DELETE' THEN OLD.session_id
      ELSE NEW.session_id
    END
  );
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER update_session_stats_on_page_change
  AFTER INSERT OR UPDATE OR DELETE ON public.scraping_pages
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_update_session_stats();