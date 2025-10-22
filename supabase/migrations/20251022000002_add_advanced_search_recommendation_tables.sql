-- Advanced Search & Recommendation Engine Database Schema
-- Creates tables for user behavior tracking, preferences, and recommendation analytics

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- User Preferences Table
-- Stores user search and recommendation preferences
CREATE TABLE IF NOT EXISTS user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL DEFAULT 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  preferences JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, workspace_id)
);

-- Search Analytics Table Enhancement
-- Extends existing search_analytics with advanced tracking
DO $$ 
BEGIN
  -- Check if search_analytics table exists, if not create it
  IF NOT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'search_analytics') THEN
    CREATE TABLE search_analytics (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID,
      session_id UUID,
      query_text TEXT NOT NULL,
      search_type TEXT DEFAULT 'text',
      total_results INTEGER DEFAULT 0,
      results_shown INTEGER DEFAULT 0,
      response_time_ms INTEGER DEFAULT 0,
      avg_relevance_score DECIMAL(3,2) DEFAULT 0,
      input_data JSONB DEFAULT '{}',
      result_data JSONB DEFAULT '{}',
      confidence_score DECIMAL(3,2) DEFAULT 0,
      processing_time_ms INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  END IF;
  
  -- Add new columns if they don't exist
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'search_analytics' AND column_name = 'search_intent') THEN
    ALTER TABLE search_analytics ADD COLUMN search_intent TEXT;
  END IF;
  
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'search_analytics' AND column_name = 'extracted_entities') THEN
    ALTER TABLE search_analytics ADD COLUMN extracted_entities JSONB DEFAULT '[]';
  END IF;
  
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'search_analytics' AND column_name = 'detected_categories') THEN
    ALTER TABLE search_analytics ADD COLUMN detected_categories JSONB DEFAULT '[]';
  END IF;
  
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'search_analytics' AND column_name = 'personalization_applied') THEN
    ALTER TABLE search_analytics ADD COLUMN personalization_applied BOOLEAN DEFAULT FALSE;
  END IF;
  
  IF NOT EXISTS (SELECT FROM information_schema.columns WHERE table_name = 'search_analytics' AND column_name = 'user_behavior_factors') THEN
    ALTER TABLE search_analytics ADD COLUMN user_behavior_factors JSONB DEFAULT '{}';
  END IF;
END $$;

-- User Behavior Profiles Table
-- Stores computed user behavior patterns and preferences
CREATE TABLE IF NOT EXISTS user_behavior_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL DEFAULT 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  
  -- Search patterns
  search_patterns JSONB NOT NULL DEFAULT '{
    "frequent_queries": [],
    "preferred_search_types": [],
    "avg_session_duration": 0,
    "search_frequency": 0
  }',
  
  -- Interaction patterns
  interaction_patterns JSONB NOT NULL DEFAULT '{
    "click_through_rate": 0,
    "dwell_time": 0,
    "conversion_rate": 0,
    "preferred_result_types": []
  }',
  
  -- Implicit preferences
  implicit_preferences JSONB NOT NULL DEFAULT '{
    "categories": [],
    "materials": [],
    "quality_tolerance": 0.7,
    "price_elasticity": 0.5
  }',
  
  -- Profile metadata
  profile_confidence DECIMAL(3,2) DEFAULT 0,
  last_computed_at TIMESTAMPTZ DEFAULT NOW(),
  computation_version INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(user_id, workspace_id)
);

-- Recommendation Analytics Table
-- Tracks recommendation generation and performance
CREATE TABLE IF NOT EXISTS recommendation_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recommendation_id TEXT NOT NULL,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL DEFAULT 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  
  -- Request context
  context TEXT, -- 'search', 'browse', 'product_view', 'purchase'
  current_product_id UUID,
  current_category TEXT,
  
  -- Generated recommendations
  recommendations_data JSONB NOT NULL DEFAULT '[]',
  total_recommendations INTEGER DEFAULT 0,
  
  -- Algorithm information
  algorithms_used JSONB DEFAULT '[]',
  diversity_factor DECIMAL(3,2) DEFAULT 0.3,
  diversity_achieved DECIMAL(3,2) DEFAULT 0,
  
  -- Performance metrics
  generation_time_ms INTEGER DEFAULT 0,
  data_retrieval_time_ms INTEGER DEFAULT 0,
  computation_time_ms INTEGER DEFAULT 0,
  ranking_time_ms INTEGER DEFAULT 0,
  
  -- Quality metrics
  avg_confidence_score DECIMAL(3,2) DEFAULT 0,
  confidence_distribution JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- User Interaction Events Table
-- Tracks detailed user interactions with search results and recommendations
CREATE TABLE IF NOT EXISTS user_interaction_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NOT NULL,
  workspace_id UUID NOT NULL DEFAULT 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  
  -- Event details
  event_type TEXT NOT NULL, -- 'search_click', 'result_view', 'recommendation_click', 'product_view', 'conversion'
  event_context TEXT, -- 'search_results', 'recommendations', 'browse'
  
  -- Target information
  target_id UUID, -- product_id, chunk_id, etc.
  target_type TEXT, -- 'product', 'chunk', 'image', 'material'
  target_category TEXT,
  
  -- Interaction details
  interaction_data JSONB DEFAULT '{}',
  dwell_time_ms INTEGER DEFAULT 0,
  scroll_depth DECIMAL(3,2) DEFAULT 0,
  click_position INTEGER,
  
  -- Context information
  search_query TEXT,
  recommendation_id TEXT,
  result_position INTEGER,
  page_url TEXT,
  referrer TEXT,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Search Sessions Table
-- Tracks user search sessions for behavior analysis
CREATE TABLE IF NOT EXISTS search_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL UNIQUE,
  user_id UUID NOT NULL,
  workspace_id UUID NOT NULL DEFAULT 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  
  -- Session details
  start_time TIMESTAMPTZ DEFAULT NOW(),
  end_time TIMESTAMPTZ,
  duration_ms INTEGER DEFAULT 0,
  
  -- Session activity
  search_count INTEGER DEFAULT 0,
  results_viewed INTEGER DEFAULT 0,
  results_clicked INTEGER DEFAULT 0,
  recommendations_viewed INTEGER DEFAULT 0,
  recommendations_clicked INTEGER DEFAULT 0,
  
  -- Session context
  entry_point TEXT, -- 'direct', 'search', 'recommendation'
  exit_point TEXT,
  user_agent TEXT,
  ip_address INET,
  
  -- Session quality
  engagement_score DECIMAL(3,2) DEFAULT 0,
  satisfaction_score DECIMAL(3,2) DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Product Similarity Cache Table
-- Caches computed product similarities for faster recommendations
CREATE TABLE IF NOT EXISTS product_similarity_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_a_id UUID NOT NULL,
  product_b_id UUID NOT NULL,
  workspace_id UUID NOT NULL DEFAULT 'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
  
  -- Similarity scores
  text_similarity DECIMAL(5,4) DEFAULT 0,
  visual_similarity DECIMAL(5,4) DEFAULT 0,
  semantic_similarity DECIMAL(5,4) DEFAULT 0,
  metadata_similarity DECIMAL(5,4) DEFAULT 0,
  overall_similarity DECIMAL(5,4) DEFAULT 0,
  
  -- Similarity factors
  similarity_factors JSONB DEFAULT '[]',
  computation_method TEXT DEFAULT 'embedding_cosine',
  
  -- Cache metadata
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days'),
  computation_version INTEGER DEFAULT 1,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraints
  UNIQUE(product_a_id, product_b_id, workspace_id),
  CHECK(product_a_id != product_b_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_workspace ON user_preferences(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_user_created ON search_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_search_analytics_session ON search_analytics(session_id);
CREATE INDEX IF NOT EXISTS idx_search_analytics_query_text ON search_analytics USING gin(to_tsvector('english', query_text));
CREATE INDEX IF NOT EXISTS idx_user_behavior_profiles_user_workspace ON user_behavior_profiles(user_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_recommendation_analytics_user_created ON recommendation_analytics(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendation_analytics_context ON recommendation_analytics(context, workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_interaction_events_user_session ON user_interaction_events(user_id, session_id);
CREATE INDEX IF NOT EXISTS idx_user_interaction_events_type_created ON user_interaction_events(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interaction_events_target ON user_interaction_events(target_id, target_type);
CREATE INDEX IF NOT EXISTS idx_search_sessions_user_start ON search_sessions(user_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_search_sessions_session_id ON search_sessions(session_id);
CREATE INDEX IF NOT EXISTS idx_product_similarity_cache_product_a ON product_similarity_cache(product_a_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_product_similarity_cache_product_b ON product_similarity_cache(product_b_id, workspace_id);
CREATE INDEX IF NOT EXISTS idx_product_similarity_cache_similarity ON product_similarity_cache(overall_similarity DESC);
CREATE INDEX IF NOT EXISTS idx_product_similarity_cache_expires ON product_similarity_cache(expires_at);

-- Create RLS policies
ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_behavior_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE recommendation_analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interaction_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_similarity_cache ENABLE ROW LEVEL SECURITY;

-- RLS policies for user_preferences
CREATE POLICY "Users can view their own preferences" ON user_preferences
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "Users can insert their own preferences" ON user_preferences
  FOR INSERT WITH CHECK (auth.uid()::text = user_id::text);

CREATE POLICY "Users can update their own preferences" ON user_preferences
  FOR UPDATE USING (auth.uid()::text = user_id::text);

-- RLS policies for user_behavior_profiles
CREATE POLICY "Users can view their own behavior profile" ON user_behavior_profiles
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can manage behavior profiles" ON user_behavior_profiles
  FOR ALL USING (true); -- Allow system operations

-- RLS policies for recommendation_analytics
CREATE POLICY "Users can view their own recommendation analytics" ON recommendation_analytics
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can insert recommendation analytics" ON recommendation_analytics
  FOR INSERT WITH CHECK (true);

-- RLS policies for user_interaction_events
CREATE POLICY "Users can view their own interaction events" ON user_interaction_events
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can insert interaction events" ON user_interaction_events
  FOR INSERT WITH CHECK (true);

-- RLS policies for search_sessions
CREATE POLICY "Users can view their own search sessions" ON search_sessions
  FOR SELECT USING (auth.uid()::text = user_id::text);

CREATE POLICY "System can manage search sessions" ON search_sessions
  FOR ALL USING (true);

-- RLS policies for product_similarity_cache
CREATE POLICY "All users can view product similarity cache" ON product_similarity_cache
  FOR SELECT USING (true);

CREATE POLICY "System can manage product similarity cache" ON product_similarity_cache
  FOR ALL USING (true);

-- Create functions for automatic updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Create triggers for updated_at columns
CREATE TRIGGER update_user_preferences_updated_at BEFORE UPDATE ON user_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_behavior_profiles_updated_at BEFORE UPDATE ON user_behavior_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recommendation_analytics_updated_at BEFORE UPDATE ON recommendation_analytics
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_search_sessions_updated_at BEFORE UPDATE ON search_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create function to clean up expired similarity cache
CREATE OR REPLACE FUNCTION cleanup_expired_similarity_cache()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM product_similarity_cache WHERE expires_at < NOW();
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Comments for documentation
COMMENT ON TABLE user_preferences IS 'Stores user search and recommendation preferences';
COMMENT ON TABLE user_behavior_profiles IS 'Computed user behavior patterns and implicit preferences';
COMMENT ON TABLE recommendation_analytics IS 'Tracks recommendation generation and performance metrics';
COMMENT ON TABLE user_interaction_events IS 'Detailed user interaction tracking for behavior analysis';
COMMENT ON TABLE search_sessions IS 'User search session tracking for engagement analysis';
COMMENT ON TABLE product_similarity_cache IS 'Cached product similarity scores for faster recommendations';
