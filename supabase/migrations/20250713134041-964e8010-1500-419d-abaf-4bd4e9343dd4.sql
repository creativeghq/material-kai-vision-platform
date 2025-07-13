-- Enable real-time updates for scraped_materials_temp table
ALTER TABLE public.scraped_materials_temp REPLICA IDENTITY FULL;

-- Also update the user_id field on scraped_materials_temp to make it compatible with RLS
ALTER TABLE public.scraped_materials_temp 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- Create index for better performance on user_id queries
CREATE INDEX IF NOT EXISTS idx_scraped_materials_temp_user_id ON public.scraped_materials_temp(user_id);

-- Create index for session_id queries
CREATE INDEX IF NOT EXISTS idx_scraped_materials_temp_session_id ON public.scraped_materials_temp(scraping_session_id);