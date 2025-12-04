-- Create user_feedback table for sentiment analysis
CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    material_id UUID REFERENCES products(id) ON DELETE CASCADE,
    feedback_text TEXT NOT NULL,
    feedback_type TEXT NOT NULL DEFAULT 'review', -- 'review', 'comment', 'rating', 'suggestion'
    rating INTEGER CHECK (rating >= 1 AND rating <= 5),
    
    -- Sentiment Analysis Results
    sentiment_analysis JSONB DEFAULT '{}'::jsonb,
    -- Structure: {
    --   "sentiment": "positive" | "neutral" | "negative",
    --   "confidence": 0.0-1.0,
    --   "aspects": {
    --     "quality": 0.8,
    --     "appearance": 0.9,
    --     "durability": 0.6,
    --     "value": 0.7,
    --     "usability": 0.8
    --   },
    --   "key_phrases": ["beautiful finish", "scratches easily"],
    --   "recommendation_score": 0.0-10.0,
    --   "analyzed_at": "2025-01-04T12:00:00Z",
    --   "model_used": "distilbert-base-uncased-finetuned-sst-2-english"
    -- }
    
    -- Metadata
    context JSONB DEFAULT '{}'::jsonb, -- Additional context (search_id, session_id, etc.)
    is_verified BOOLEAN DEFAULT FALSE, -- Verified purchase/usage
    is_public BOOLEAN DEFAULT TRUE, -- Show in public reviews
    helpful_count INTEGER DEFAULT 0, -- How many users found this helpful
    reported_count INTEGER DEFAULT 0, -- Spam/abuse reports
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    analyzed_at TIMESTAMPTZ
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_feedback_workspace ON user_feedback(workspace_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_user ON user_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_material ON user_feedback(material_id);
CREATE INDEX IF NOT EXISTS idx_user_feedback_created ON user_feedback(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_feedback_rating ON user_feedback(rating);
CREATE INDEX IF NOT EXISTS idx_user_feedback_sentiment ON user_feedback USING GIN (sentiment_analysis);
CREATE INDEX IF NOT EXISTS idx_user_feedback_type ON user_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_user_feedback_public ON user_feedback(is_public) WHERE is_public = TRUE;

-- Create sentiment_trends table for tracking sentiment over time
CREATE TABLE IF NOT EXISTS sentiment_trends (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    material_id UUID REFERENCES products(id) ON DELETE CASCADE,
    time_window TEXT NOT NULL, -- 'daily', 'weekly', 'monthly'
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    
    -- Aggregated Metrics
    total_feedback_count INTEGER DEFAULT 0,
    positive_count INTEGER DEFAULT 0,
    neutral_count INTEGER DEFAULT 0,
    negative_count INTEGER DEFAULT 0,
    average_rating DECIMAL(3,2),
    average_confidence DECIMAL(3,2),
    
    -- Aspect Scores (averaged)
    aspect_scores JSONB DEFAULT '{}'::jsonb,
    -- Structure: {
    --   "quality": 0.8,
    --   "appearance": 0.9,
    --   "durability": 0.6,
    --   "value": 0.7,
    --   "usability": 0.8
    -- }
    
    -- Top Keywords
    top_positive_phrases TEXT[],
    top_negative_phrases TEXT[],
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(workspace_id, material_id, time_window, window_start)
);

-- Create indexes for sentiment_trends
CREATE INDEX IF NOT EXISTS idx_sentiment_trends_workspace ON sentiment_trends(workspace_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_trends_material ON sentiment_trends(material_id);
CREATE INDEX IF NOT EXISTS idx_sentiment_trends_window ON sentiment_trends(time_window, window_start DESC);
CREATE INDEX IF NOT EXISTS idx_sentiment_trends_aspects ON sentiment_trends USING GIN (aspect_scores);

-- Function to calculate sentiment trends
CREATE OR REPLACE FUNCTION calculate_sentiment_trends(
    p_workspace_id UUID,
    p_material_id UUID DEFAULT NULL,
    p_time_window TEXT DEFAULT 'daily',
    p_days_back INTEGER DEFAULT 30
)
RETURNS TABLE (
    material_id UUID,
    time_window TEXT,
    window_start TIMESTAMPTZ,
    window_end TIMESTAMPTZ,
    total_feedback_count INTEGER,
    positive_count INTEGER,
    neutral_count INTEGER,
    negative_count INTEGER,
    average_rating DECIMAL,
    average_confidence DECIMAL,
    aspect_scores JSONB,
    top_positive_phrases TEXT[],
    top_negative_phrases TEXT[]
) AS $$
BEGIN
    RETURN QUERY
    WITH feedback_windows AS (
        SELECT
            uf.material_id,
            p_time_window AS time_window,
            DATE_TRUNC(
                CASE p_time_window
                    WHEN 'hourly' THEN 'hour'
                    WHEN 'daily' THEN 'day'
                    WHEN 'weekly' THEN 'week'
                    WHEN 'monthly' THEN 'month'
                    ELSE 'day'
                END,
                uf.created_at
            ) AS window_start,
            uf.sentiment_analysis,
            uf.rating
        FROM user_feedback uf
        WHERE uf.workspace_id = p_workspace_id
            AND (p_material_id IS NULL OR uf.material_id = p_material_id)
            AND uf.created_at >= NOW() - (p_days_back || ' days')::INTERVAL
            AND uf.sentiment_analysis IS NOT NULL
    )
    SELECT
        fw.material_id,
        fw.time_window,
        fw.window_start,
        fw.window_start + INTERVAL '1 day' AS window_end,
        COUNT(*)::INTEGER AS total_feedback_count,
        COUNT(*) FILTER (WHERE fw.sentiment_analysis->>'sentiment' = 'positive')::INTEGER AS positive_count,
        COUNT(*) FILTER (WHERE fw.sentiment_analysis->>'sentiment' = 'neutral')::INTEGER AS neutral_count,
        COUNT(*) FILTER (WHERE fw.sentiment_analysis->>'sentiment' = 'negative')::INTEGER AS negative_count,
        AVG(fw.rating)::DECIMAL(3,2) AS average_rating,
        AVG((fw.sentiment_analysis->>'confidence')::FLOAT)::DECIMAL(3,2) AS average_confidence,
        '{}'::JSONB AS aspect_scores, -- Simplified for now
        ARRAY[]::TEXT[] AS top_positive_phrases,
        ARRAY[]::TEXT[] AS top_negative_phrases
    FROM feedback_windows fw
    GROUP BY fw.material_id, fw.time_window, fw.window_start
    ORDER BY fw.window_start DESC;
END;
$$ LANGUAGE plpgsql;

-- Add RLS policies
ALTER TABLE user_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE sentiment_trends ENABLE ROW LEVEL SECURITY;

-- Users can view public feedback
CREATE POLICY "Users can view public feedback"
    ON user_feedback FOR SELECT
    USING (is_public = TRUE);

-- Users can view their own feedback
CREATE POLICY "Users can view own feedback"
    ON user_feedback FOR SELECT
    USING (auth.uid() = user_id);

-- Users can create feedback
CREATE POLICY "Users can create feedback"
    ON user_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- Users can update their own feedback
CREATE POLICY "Users can update own feedback"
    ON user_feedback FOR UPDATE
    USING (auth.uid() = user_id);

-- Users can view sentiment trends
CREATE POLICY "Users can view sentiment trends"
    ON sentiment_trends FOR SELECT
    USING (TRUE);

