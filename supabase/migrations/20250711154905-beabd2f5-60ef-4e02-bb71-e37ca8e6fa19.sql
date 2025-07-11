-- Enhance vector database for RAG system
-- Add support for multi-modal embeddings and improved vector search

-- Create enhanced embedding table for multi-modal storage
CREATE TABLE public.material_embeddings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID NOT NULL REFERENCES public.materials_catalog(id) ON DELETE CASCADE,
  embedding_type TEXT NOT NULL, -- 'clip', 'efficientnet', 'materialnet'
  vector_dimension INTEGER NOT NULL DEFAULT 512,
  embedding VECTOR(512) NOT NULL,
  metadata JSONB DEFAULT '{}',
  model_version TEXT NOT NULL,
  confidence_score FLOAT DEFAULT 0.0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for efficient vector search
CREATE INDEX material_embeddings_vector_idx ON public.material_embeddings 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX material_embeddings_material_id_idx ON public.material_embeddings(material_id);
CREATE INDEX material_embeddings_type_idx ON public.material_embeddings(embedding_type);
CREATE INDEX material_embeddings_model_version_idx ON public.material_embeddings(model_version);

-- Enable RLS
ALTER TABLE public.material_embeddings ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Embeddings are viewable by everyone" 
ON public.material_embeddings FOR SELECT USING (true);

CREATE POLICY "Analysts can create embeddings" 
ON public.material_embeddings FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Analysts can update embeddings" 
ON public.material_embeddings FOR UPDATE 
USING (has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create enhanced knowledge base table for RAG
CREATE TABLE public.knowledge_base_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type TEXT NOT NULL, -- 'material_spec', 'technical_doc', 'expert_knowledge'
  source_url TEXT,
  material_ids UUID[] DEFAULT '{}',
  tags TEXT[] DEFAULT '{}',
  embedding VECTOR(512),
  metadata JSONB DEFAULT '{}',
  relevance_score FLOAT DEFAULT 0.0,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add indexes for knowledge base
CREATE INDEX knowledge_base_embedding_idx ON public.knowledge_base_entries 
USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

CREATE INDEX knowledge_base_content_type_idx ON public.knowledge_base_entries(content_type);
CREATE INDEX knowledge_base_tags_idx ON public.knowledge_base_entries USING GIN(tags);
CREATE INDEX knowledge_base_material_ids_idx ON public.knowledge_base_entries USING GIN(material_ids);

-- Enable RLS
ALTER TABLE public.knowledge_base_entries ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Knowledge base is viewable by everyone" 
ON public.knowledge_base_entries FOR SELECT USING (true);

CREATE POLICY "Analysts can manage knowledge base" 
ON public.knowledge_base_entries FOR ALL 
USING (has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Create enhanced vector similarity search function
CREATE OR REPLACE FUNCTION public.enhanced_vector_search(
  query_embedding VECTOR(512),
  search_type TEXT DEFAULT 'hybrid', -- 'material', 'knowledge', 'hybrid'
  embedding_types TEXT[] DEFAULT ARRAY['clip'],
  match_threshold FLOAT DEFAULT 0.7,
  match_count INTEGER DEFAULT 10
)
RETURNS TABLE(
  result_type TEXT,
  id UUID,
  similarity_score FLOAT,
  title TEXT,
  content TEXT,
  metadata JSONB
)
LANGUAGE SQL STABLE
AS $$
  WITH material_results AS (
    SELECT 
      'material' as result_type,
      mc.id,
      1 - (me.embedding <=> query_embedding) as similarity_score,
      mc.name as title,
      mc.description as content,
      jsonb_build_object(
        'category', mc.category,
        'properties', mc.properties,
        'embedding_type', me.embedding_type,
        'model_version', me.model_version
      ) as metadata
    FROM public.materials_catalog mc
    JOIN public.material_embeddings me ON mc.id = me.material_id
    WHERE 
      me.embedding_type = ANY(embedding_types)
      AND (1 - (me.embedding <=> query_embedding)) > match_threshold
      AND (search_type = 'material' OR search_type = 'hybrid')
  ),
  knowledge_results AS (
    SELECT 
      'knowledge' as result_type,
      kb.id,
      1 - (kb.embedding <=> query_embedding) as similarity_score,
      kb.title,
      kb.content,
      jsonb_build_object(
        'content_type', kb.content_type,
        'tags', kb.tags,
        'material_ids', kb.material_ids,
        'source_url', kb.source_url
      ) as metadata
    FROM public.knowledge_base_entries kb
    WHERE 
      kb.embedding IS NOT NULL
      AND (1 - (kb.embedding <=> query_embedding)) > match_threshold
      AND (search_type = 'knowledge' OR search_type = 'hybrid')
  )
  SELECT * FROM (
    SELECT * FROM material_results
    UNION ALL
    SELECT * FROM knowledge_results
  ) combined_results
  ORDER BY similarity_score DESC
  LIMIT match_count;
$$;

-- Create trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_material_embeddings_updated_at
  BEFORE UPDATE ON public.material_embeddings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_knowledge_base_updated_at
  BEFORE UPDATE ON public.knowledge_base_entries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();