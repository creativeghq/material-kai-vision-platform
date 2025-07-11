-- Create moodboards table
CREATE TABLE public.moodboards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  is_public BOOLEAN NOT NULL DEFAULT false,
  view_preference TEXT NOT NULL DEFAULT 'grid' CHECK (view_preference IN ('grid', 'list')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create moodboard_items table
CREATE TABLE public.moodboard_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  moodboard_id UUID NOT NULL REFERENCES public.moodboards(id) ON DELETE CASCADE,
  material_id UUID NOT NULL REFERENCES public.materials_catalog(id) ON DELETE CASCADE,
  notes TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(moodboard_id, material_id)
);

-- Enable Row Level Security
ALTER TABLE public.moodboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.moodboard_items ENABLE ROW LEVEL SECURITY;

-- RLS Policies for moodboards
CREATE POLICY "Users can view their own moodboards" 
ON public.moodboards 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can view public moodboards" 
ON public.moodboards 
FOR SELECT 
USING (is_public = true);

CREATE POLICY "Users can create their own moodboards" 
ON public.moodboards 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own moodboards" 
ON public.moodboards 
FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own moodboards" 
ON public.moodboards 
FOR DELETE 
USING (auth.uid() = user_id);

-- RLS Policies for moodboard_items
CREATE POLICY "Users can view items in their own moodboards" 
ON public.moodboard_items 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.moodboards 
    WHERE moodboards.id = moodboard_items.moodboard_id 
    AND moodboards.user_id = auth.uid()
  )
);

CREATE POLICY "Users can view items in public moodboards" 
ON public.moodboard_items 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.moodboards 
    WHERE moodboards.id = moodboard_items.moodboard_id 
    AND moodboards.is_public = true
  )
);

CREATE POLICY "Users can add items to their own moodboards" 
ON public.moodboard_items 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.moodboards 
    WHERE moodboards.id = moodboard_items.moodboard_id 
    AND moodboards.user_id = auth.uid()
  )
);

CREATE POLICY "Users can update items in their own moodboards" 
ON public.moodboard_items 
FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.moodboards 
    WHERE moodboards.id = moodboard_items.moodboard_id 
    AND moodboards.user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete items from their own moodboards" 
ON public.moodboard_items 
FOR DELETE 
USING (
  EXISTS (
    SELECT 1 FROM public.moodboards 
    WHERE moodboards.id = moodboard_items.moodboard_id 
    AND moodboards.user_id = auth.uid()
  )
);

-- Create trigger for updating updated_at timestamp
CREATE TRIGGER update_moodboards_updated_at
BEFORE UPDATE ON public.moodboards
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for better performance
CREATE INDEX idx_moodboards_user_id ON public.moodboards(user_id);
CREATE INDEX idx_moodboards_is_public ON public.moodboards(is_public);
CREATE INDEX idx_moodboard_items_moodboard_id ON public.moodboard_items(moodboard_id);
CREATE INDEX idx_moodboard_items_material_id ON public.moodboard_items(material_id);
CREATE INDEX idx_moodboard_items_position ON public.moodboard_items(moodboard_id, position);