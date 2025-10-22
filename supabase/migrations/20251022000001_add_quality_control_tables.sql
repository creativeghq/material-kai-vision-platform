-- Quality Control System Database Schema
-- Creates tables for human-in-the-loop quality control workflows

-- Quality assessments table
CREATE TABLE IF NOT EXISTS quality_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'chunk', 'image')),
  workspace_id UUID,
  overall_score NUMERIC(3, 2) NOT NULL CHECK (overall_score >= 0 AND overall_score <= 1),
  quality_metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  passes_thresholds BOOLEAN NOT NULL DEFAULT false,
  needs_human_review BOOLEAN NOT NULL DEFAULT false,
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommendations JSONB NOT NULL DEFAULT '[]'::jsonb,
  assessment_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Human review tasks table
CREATE TABLE IF NOT EXISTS human_review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id UUID NOT NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'chunk', 'image')),
  workspace_id UUID,
  review_type TEXT NOT NULL CHECK (review_type IN ('quality_validation', 'completeness_check', 'content_verification', 'embedding_validation')),
  priority TEXT NOT NULL CHECK (priority IN ('low', 'medium', 'high', 'urgent')) DEFAULT 'medium',
  status TEXT NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'rejected', 'escalated')) DEFAULT 'pending',
  assigned_to UUID,
  quality_assessment JSONB NOT NULL,
  review_notes TEXT,
  review_decision TEXT CHECK (review_decision IN ('approve', 'reject', 'needs_improvement', 'escalate')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- Quality control configuration table
CREATE TABLE IF NOT EXISTS quality_control_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  config_name TEXT NOT NULL,
  thresholds JSONB NOT NULL DEFAULT '{}'::jsonb,
  auto_review_enabled BOOLEAN NOT NULL DEFAULT true,
  human_review_enabled BOOLEAN NOT NULL DEFAULT true,
  escalation_enabled BOOLEAN NOT NULL DEFAULT true,
  notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  batch_processing_enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, config_name)
);

-- Quality metrics tracking table
CREATE TABLE IF NOT EXISTS quality_metrics_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  metric_date DATE NOT NULL DEFAULT CURRENT_DATE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('product', 'chunk', 'image')),
  total_assessments INTEGER NOT NULL DEFAULT 0,
  passed_assessments INTEGER NOT NULL DEFAULT 0,
  failed_assessments INTEGER NOT NULL DEFAULT 0,
  needs_review_assessments INTEGER NOT NULL DEFAULT 0,
  avg_quality_score NUMERIC(3, 2),
  avg_completion_time_minutes INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(workspace_id, metric_date, entity_type)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_quality_assessments_entity ON quality_assessments(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_workspace ON quality_assessments(workspace_id);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_timestamp ON quality_assessments(assessment_timestamp);
CREATE INDEX IF NOT EXISTS idx_quality_assessments_needs_review ON quality_assessments(needs_human_review) WHERE needs_human_review = true;

CREATE INDEX IF NOT EXISTS idx_human_review_tasks_status ON human_review_tasks(status);
CREATE INDEX IF NOT EXISTS idx_human_review_tasks_priority ON human_review_tasks(priority);
CREATE INDEX IF NOT EXISTS idx_human_review_tasks_entity ON human_review_tasks(entity_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_human_review_tasks_workspace ON human_review_tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_human_review_tasks_assigned ON human_review_tasks(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_human_review_tasks_created ON human_review_tasks(created_at);

CREATE INDEX IF NOT EXISTS idx_quality_control_config_workspace ON quality_control_config(workspace_id);

CREATE INDEX IF NOT EXISTS idx_quality_metrics_tracking_workspace_date ON quality_metrics_tracking(workspace_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_quality_metrics_tracking_entity_type ON quality_metrics_tracking(entity_type);

-- Row Level Security (RLS) policies
ALTER TABLE quality_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE human_review_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_control_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE quality_metrics_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies for quality_assessments
CREATE POLICY "Users can view quality assessments in their workspace" ON quality_assessments
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert quality assessments in their workspace" ON quality_assessments
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update quality assessments in their workspace" ON quality_assessments
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS policies for human_review_tasks
CREATE POLICY "Users can view review tasks in their workspace" ON human_review_tasks
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert review tasks in their workspace" ON human_review_tasks
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update review tasks in their workspace" ON human_review_tasks
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS policies for quality_control_config
CREATE POLICY "Users can view quality config in their workspace" ON quality_control_config
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can manage quality config in their workspace" ON quality_control_config
  FOR ALL USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- RLS policies for quality_metrics_tracking
CREATE POLICY "Users can view quality metrics in their workspace" ON quality_metrics_tracking
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert quality metrics in their workspace" ON quality_metrics_tracking
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members 
      WHERE user_id = auth.uid()
    )
  );

-- Functions for automatic timestamp updates
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for automatic timestamp updates
CREATE TRIGGER update_quality_assessments_updated_at 
  BEFORE UPDATE ON quality_assessments 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_human_review_tasks_updated_at 
  BEFORE UPDATE ON human_review_tasks 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quality_control_config_updated_at 
  BEFORE UPDATE ON quality_control_config 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_quality_metrics_tracking_updated_at 
  BEFORE UPDATE ON quality_metrics_tracking 
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default quality control configuration with quality_thresholds
INSERT INTO quality_control_config (
  config_name,
  thresholds,
  auto_review_enabled,
  human_review_enabled,
  escalation_enabled,
  notifications_enabled,
  batch_processing_enabled
) VALUES (
  'default',
  '{
    "quality_thresholds": {
      "minProductQualityScore": 0.7,
      "minProductConfidenceScore": 0.6,
      "minProductCompletenessScore": 0.8,
      "minChunkCoherenceScore": 0.65,
      "minChunkBoundaryQuality": 0.6,
      "minChunkSemanticCompleteness": 0.7,
      "minImageQualityScore": 0.6,
      "minImageRelevanceScore": 0.5,
      "minImageOcrConfidence": 0.5,
      "minEmbeddingCoverage": 0.8,
      "minEmbeddingConfidence": 0.7
    },
    "workflow_settings": {
      "autoCreateReviewTasks": true,
      "escalationThreshold": 2,
      "maxReviewTime": 24
    },
    "notification_settings": {
      "emailNotifications": true,
      "slackNotifications": false,
      "urgentTasksOnly": false
    }
  }'::jsonb,
  true,
  true,
  true,
  true,
  true
) ON CONFLICT (workspace_id, config_name) DO NOTHING;
