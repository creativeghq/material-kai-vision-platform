-- Create image_validations table
CREATE TABLE IF NOT EXISTS image_validations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  image_id UUID NOT NULL REFERENCES document_images(id) ON DELETE CASCADE,
  workspace_id UUID,
  validation_status TEXT NOT NULL CHECK (validation_status IN ('pending', 'valid', 'invalid', 'needs_review')) DEFAULT 'pending',
  quality_score NUMERIC(3, 2) NOT NULL CHECK (quality_score >= 0 AND quality_score <= 1),
  dimensions_valid BOOLEAN DEFAULT false,
  format_valid BOOLEAN DEFAULT false,
  file_size_valid BOOLEAN DEFAULT false,
  ocr_confidence NUMERIC(3, 2) CHECK (ocr_confidence IS NULL OR (ocr_confidence >= 0 AND ocr_confidence <= 1)),
  relevance_score NUMERIC(3, 2) CHECK (relevance_score IS NULL OR (relevance_score >= 0 AND relevance_score <= 1)),
  quality_metrics JSONB,
  issues JSONB,
  recommendations JSONB,
  validated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_image_validations_image_id ON image_validations(image_id);
CREATE INDEX idx_image_validations_workspace_id ON image_validations(workspace_id);
CREATE INDEX idx_image_validations_status ON image_validations(validation_status);
CREATE INDEX idx_image_validations_quality_score ON image_validations(quality_score);
CREATE INDEX idx_image_validations_workspace_status ON image_validations(workspace_id, validation_status);
CREATE INDEX idx_image_validations_created_at ON image_validations(created_at);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_image_validations_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER image_validations_updated_at_trigger
BEFORE UPDATE ON image_validations
FOR EACH ROW
EXECUTE FUNCTION update_image_validations_updated_at();

-- Enable RLS
ALTER TABLE image_validations ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "image_validations_select"
  ON image_validations FOR SELECT
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "image_validations_insert"
  ON image_validations FOR INSERT
  WITH CHECK (true);

CREATE POLICY "image_validations_update"
  ON image_validations FOR UPDATE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "image_validations_delete"
  ON image_validations FOR DELETE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

