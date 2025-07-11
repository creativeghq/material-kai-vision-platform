-- Enhanced Knowledge Base with ML Capabilities
CREATE TABLE enhanced_knowledge_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL DEFAULT 'article',
  source_url TEXT,
  
  -- Enhanced embeddings for multiple models
  openai_embedding VECTOR(1536),
  huggingface_embedding VECTOR(768),
  custom_embedding VECTOR(512),
  
  -- Material relationships
  material_ids UUID[] DEFAULT '{}',
  material_categories TEXT[] DEFAULT '{}',
  
  -- ML-powered content analysis
  semantic_tags TEXT[] DEFAULT '{}',
  confidence_scores JSONB DEFAULT '{}',
  
  -- Enhanced metadata
  metadata JSONB DEFAULT '{}',
  language VARCHAR(10) DEFAULT 'en',
  reading_level INTEGER, -- 1-12 grade level
  technical_complexity INTEGER, -- 1-10 scale
  
  -- Quality metrics
  relevance_score DECIMAL(5,4) DEFAULT 0.0,
  accuracy_score DECIMAL(5,4) DEFAULT 0.0,
  freshness_score DECIMAL(5,4) DEFAULT 1.0,
  
  -- Search optimization
  search_vector TSVECTOR,
  search_keywords TEXT[] DEFAULT '{}',
  
  -- Versioning and approval
  version INTEGER DEFAULT 1,
  status VARCHAR(20) DEFAULT 'draft',
  approved_by UUID,
  approved_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  last_modified_by UUID
);

-- Real-time knowledge extraction from materials
CREATE TABLE material_knowledge_extraction (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  material_id UUID REFERENCES materials_catalog(id),
  extraction_type VARCHAR(50) NOT NULL, -- 'properties', 'compatibility', 'usage', 'maintenance'
  extracted_knowledge TEXT NOT NULL,
  confidence_score DECIMAL(5,4) DEFAULT 0.0,
  embedding VECTOR(512),
  
  -- Context information
  extraction_context JSONB DEFAULT '{}',
  source_fields TEXT[] DEFAULT '{}',
  
  -- Validation
  validated_by UUID,
  validation_status VARCHAR(20) DEFAULT 'pending',
  validation_notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Intelligent query understanding
CREATE TABLE query_intelligence (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  original_query TEXT NOT NULL,
  processed_query TEXT NOT NULL,
  query_embedding VECTOR(512),
  
  -- Intent classification
  query_intent VARCHAR(50), -- 'search', 'compare', 'recommend', 'explain'
  query_type VARCHAR(50), -- 'technical', 'aesthetic', 'functional', 'compatibility'
  entities_detected JSONB DEFAULT '{}',
  
  -- Context awareness
  user_context JSONB DEFAULT '{}',
  session_context JSONB DEFAULT '{}',
  project_context JSONB DEFAULT '{}',
  
  -- Results and feedback
  results_returned INTEGER DEFAULT 0,
  user_satisfaction INTEGER, -- 1-5 scale
  clicked_results UUID[] DEFAULT '{}',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Knowledge graph relationships
CREATE TABLE knowledge_relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source_id UUID NOT NULL,
  target_id UUID NOT NULL,
  relationship_type VARCHAR(50) NOT NULL, -- 'related_to', 'contradicts', 'supports', 'elaborates'
  confidence_score DECIMAL(5,4) DEFAULT 0.0,
  
  -- Relationship metadata
  relationship_strength DECIMAL(3,2) DEFAULT 0.5, -- 0.0 to 1.0
  relationship_context TEXT,
  bidirectional BOOLEAN DEFAULT false,
  
  -- ML-generated or human-curated
  source_type VARCHAR(20) DEFAULT 'ml_generated', -- 'ml_generated', 'human_curated', 'hybrid'
  validated_by UUID,
  validation_status VARCHAR(20) DEFAULT 'pending',
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Advanced search analytics
CREATE TABLE search_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID,
  session_id TEXT,
  
  -- Query details
  query_text TEXT NOT NULL,
  query_embedding VECTOR(512),
  query_processing_time_ms INTEGER,
  
  -- Results details
  total_results INTEGER DEFAULT 0,
  results_shown INTEGER DEFAULT 0,
  avg_relevance_score DECIMAL(5,4),
  
  -- User interaction
  clicks_count INTEGER DEFAULT 0,
  time_on_results INTEGER, -- seconds
  refinements_count INTEGER DEFAULT 0,
  follow_up_queries TEXT[] DEFAULT '{}',
  
  -- Performance metrics
  response_time_ms INTEGER,
  satisfaction_rating INTEGER, -- 1-5 scale if provided
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Semantic similarity cache for performance
CREATE TABLE semantic_similarity_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  query_hash VARCHAR(64) NOT NULL UNIQUE,
  query_embedding VECTOR(512),
  results JSONB NOT NULL,
  similarity_threshold DECIMAL(5,4),
  
  -- Cache metadata
  hit_count INTEGER DEFAULT 0,
  last_accessed TIMESTAMP WITH TIME ZONE DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS for all tables
ALTER TABLE enhanced_knowledge_base ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_knowledge_extraction ENABLE ROW LEVEL SECURITY;
ALTER TABLE query_intelligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE semantic_similarity_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Knowledge base is viewable by everyone" 
ON enhanced_knowledge_base FOR SELECT 
USING (status = 'published' OR created_by = auth.uid());

CREATE POLICY "Analysts can manage knowledge base" 
ON enhanced_knowledge_base FOR ALL 
USING (has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can access material knowledge" 
ON material_knowledge_extraction FOR SELECT 
USING (true);

CREATE POLICY "System can create query intelligence" 
ON query_intelligence FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can view their query history" 
ON query_intelligence FOR SELECT 
USING (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY "Knowledge relationships are viewable by everyone" 
ON knowledge_relationships FOR SELECT 
USING (true);

CREATE POLICY "Analysts can manage relationships" 
ON knowledge_relationships FOR ALL 
USING (has_role(auth.uid(), 'analyst'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "System can create search analytics" 
ON search_analytics FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Admins can view search analytics" 
ON search_analytics FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Semantic cache is accessible by system" 
ON semantic_similarity_cache FOR ALL 
USING (true);

-- Performance indexes
CREATE INDEX idx_enhanced_kb_embeddings_openai ON enhanced_knowledge_base USING ivfflat (openai_embedding vector_cosine_ops);
CREATE INDEX idx_enhanced_kb_embeddings_hf ON enhanced_knowledge_base USING ivfflat (huggingface_embedding vector_cosine_ops);
CREATE INDEX idx_enhanced_kb_embeddings_custom ON enhanced_knowledge_base USING ivfflat (custom_embedding vector_cosine_ops);
CREATE INDEX idx_enhanced_kb_search ON enhanced_knowledge_base USING GIN(search_vector);
CREATE INDEX idx_enhanced_kb_tags ON enhanced_knowledge_base USING GIN(semantic_tags);
CREATE INDEX idx_enhanced_kb_categories ON enhanced_knowledge_base USING GIN(material_categories);

CREATE INDEX idx_material_knowledge_embedding ON material_knowledge_extraction USING ivfflat (embedding vector_cosine_ops);
CREATE INDEX idx_material_knowledge_type ON material_knowledge_extraction(extraction_type);
CREATE INDEX idx_material_knowledge_material ON material_knowledge_extraction(material_id);

CREATE INDEX idx_query_intelligence_embedding ON query_intelligence USING ivfflat (query_embedding vector_cosine_ops);
CREATE INDEX idx_query_intelligence_intent ON query_intelligence(query_intent);
CREATE INDEX idx_query_intelligence_user ON query_intelligence(user_id, created_at DESC);

CREATE INDEX idx_knowledge_relationships_source ON knowledge_relationships(source_id);
CREATE INDEX idx_knowledge_relationships_target ON knowledge_relationships(target_id);
CREATE INDEX idx_knowledge_relationships_type ON knowledge_relationships(relationship_type);

CREATE INDEX idx_search_analytics_user ON search_analytics(user_id, created_at DESC);
CREATE INDEX idx_search_analytics_session ON search_analytics(session_id, created_at DESC);
CREATE INDEX idx_search_analytics_embedding ON search_analytics USING ivfflat (query_embedding vector_cosine_ops);

CREATE INDEX idx_similarity_cache_hash ON semantic_similarity_cache(query_hash);
CREATE INDEX idx_similarity_cache_accessed ON semantic_similarity_cache(last_accessed DESC);

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_enhanced_knowledge_base_updated_at
BEFORE UPDATE ON enhanced_knowledge_base
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_material_knowledge_extraction_updated_at
BEFORE UPDATE ON material_knowledge_extraction
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_knowledge_relationships_updated_at
BEFORE UPDATE ON knowledge_relationships
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();