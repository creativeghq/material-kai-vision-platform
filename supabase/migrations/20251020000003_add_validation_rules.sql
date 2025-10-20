-- Create validation_rules table
CREATE TABLE IF NOT EXISTS validation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID,
  rule_name TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('content_quality', 'boundary_quality', 'semantic_coherence', 'completeness', 'metadata_presence', 'specification_count', 'image_count', 'custom')),
  rule_description TEXT,
  rule_definition JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 50 CHECK (priority >= 1 AND priority <= 100),
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')) DEFAULT 'warning',
  auto_fix BOOLEAN DEFAULT false,
  fix_action TEXT,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create validation_results table
CREATE TABLE IF NOT EXISTS validation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES validation_rules(id) ON DELETE CASCADE,
  workspace_id UUID,
  passed BOOLEAN NOT NULL,
  severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
  message TEXT,
  details JSONB,
  issues JSONB,
  validated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for validation_rules
CREATE INDEX idx_validation_rules_workspace_id ON validation_rules(workspace_id);
CREATE INDEX idx_validation_rules_is_active ON validation_rules(is_active);
CREATE INDEX idx_validation_rules_rule_type ON validation_rules(rule_type);
CREATE INDEX idx_validation_rules_priority ON validation_rules(priority);
CREATE INDEX idx_validation_rules_workspace_active ON validation_rules(workspace_id, is_active);

-- Create indexes for validation_results
CREATE INDEX idx_validation_results_chunk_id ON validation_results(chunk_id);
CREATE INDEX idx_validation_results_rule_id ON validation_results(rule_id);
CREATE INDEX idx_validation_results_workspace_id ON validation_results(workspace_id);
CREATE INDEX idx_validation_results_passed ON validation_results(passed);
CREATE INDEX idx_validation_results_severity ON validation_results(severity);
CREATE INDEX idx_validation_results_workspace_passed ON validation_results(workspace_id, passed);
CREATE INDEX idx_validation_results_created_at ON validation_results(created_at);

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_validation_rules_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validation_rules_updated_at_trigger
BEFORE UPDATE ON validation_rules
FOR EACH ROW
EXECUTE FUNCTION update_validation_rules_updated_at();

CREATE OR REPLACE FUNCTION update_validation_results_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER validation_results_updated_at_trigger
BEFORE UPDATE ON validation_results
FOR EACH ROW
EXECUTE FUNCTION update_validation_results_updated_at();

-- Enable RLS
ALTER TABLE validation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE validation_results ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for validation_rules
CREATE POLICY "validation_rules_select"
  ON validation_rules FOR SELECT
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "validation_rules_insert"
  ON validation_rules FOR INSERT
  WITH CHECK (true);

CREATE POLICY "validation_rules_update"
  ON validation_rules FOR UPDATE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "validation_rules_delete"
  ON validation_rules FOR DELETE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

-- Create RLS policies for validation_results
CREATE POLICY "validation_results_select"
  ON validation_results FOR SELECT
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "validation_results_insert"
  ON validation_results FOR INSERT
  WITH CHECK (true);

CREATE POLICY "validation_results_update"
  ON validation_results FOR UPDATE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "validation_results_delete"
  ON validation_results FOR DELETE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

