-- Create product_enrichments table
CREATE TABLE IF NOT EXISTS product_enrichments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chunk_id UUID NOT NULL REFERENCES document_chunks(id) ON DELETE CASCADE,
  workspace_id UUID,
  enrichment_status TEXT NOT NULL CHECK (enrichment_status IN ('pending', 'enriched', 'failed', 'needs_review')) DEFAULT 'pending',
  product_name TEXT,
  product_category TEXT CHECK (product_category IN ('electronics', 'furniture', 'clothing', 'food', 'books', 'tools', 'home', 'sports', 'other')),
  product_description TEXT,
  long_description TEXT,
  short_description TEXT,
  metadata JSONB,
  specifications JSONB,
  related_products TEXT[],
  image_references JSONB,
  confidence_score NUMERIC(3, 2) CHECK (confidence_score IS NULL OR (confidence_score >= 0 AND confidence_score <= 1)),
  enrichment_score NUMERIC(3, 2) CHECK (enrichment_score IS NULL OR (enrichment_score >= 0 AND enrichment_score <= 1)),
  issues JSONB,
  recommendations JSONB,
  enriched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX idx_product_enrichments_chunk_id ON product_enrichments(chunk_id);
CREATE INDEX idx_product_enrichments_workspace_id ON product_enrichments(workspace_id);
CREATE INDEX idx_product_enrichments_status ON product_enrichments(enrichment_status);
CREATE INDEX idx_product_enrichments_category ON product_enrichments(product_category);
CREATE INDEX idx_product_enrichments_confidence ON product_enrichments(confidence_score);
CREATE INDEX idx_product_enrichments_workspace_status ON product_enrichments(workspace_id, enrichment_status);
CREATE INDEX idx_product_enrichments_created_at ON product_enrichments(created_at);

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION update_product_enrichments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER product_enrichments_updated_at_trigger
BEFORE UPDATE ON product_enrichments
FOR EACH ROW
EXECUTE FUNCTION update_product_enrichments_updated_at();

-- Enable RLS
ALTER TABLE product_enrichments ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "product_enrichments_select"
  ON product_enrichments FOR SELECT
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "product_enrichments_insert"
  ON product_enrichments FOR INSERT
  WITH CHECK (true);

CREATE POLICY "product_enrichments_update"
  ON product_enrichments FOR UPDATE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

CREATE POLICY "product_enrichments_delete"
  ON product_enrichments FOR DELETE
  USING ((workspace_id = auth.uid()) OR (workspace_id IS NULL));

