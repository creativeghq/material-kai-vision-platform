-- Create field_templates table for reusable field configurations
CREATE TABLE IF NOT EXISTS field_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  fields JSONB NOT NULL DEFAULT '{"fields": []}'::jsonb,
  is_global BOOLEAN DEFAULT false, -- Global templates available to all workspaces
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  usage_count INTEGER DEFAULT 0, -- Track how many times template is used
  
  CONSTRAINT unique_template_name_per_workspace UNIQUE(workspace_id, name)
);

-- Create index for faster lookups
CREATE INDEX idx_field_templates_workspace ON field_templates(workspace_id);
CREATE INDEX idx_field_templates_global ON field_templates(is_global) WHERE is_global = true;
CREATE INDEX idx_field_templates_usage ON field_templates(usage_count DESC);

-- Enable RLS
ALTER TABLE field_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view templates in their workspace"
  ON field_templates FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
    OR is_global = true
  );

CREATE POLICY "Users can create templates in their workspace"
  ON field_templates FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update templates in their workspace"
  ON field_templates FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete templates in their workspace"
  ON field_templates FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_field_template_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
CREATE TRIGGER update_field_template_timestamp
  BEFORE UPDATE ON field_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_field_template_updated_at();

-- Insert some default global templates
INSERT INTO field_templates (workspace_id, name, description, fields, is_global, created_by)
VALUES 
  (
    'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
    'Basic Material Info',
    'Essential fields for material products: name, price, description, images',
    '{
      "fields": [
        {
          "name": "material_name",
          "label": "Material Name",
          "type": "text",
          "description": "The name or title of the material product",
          "required": true
        },
        {
          "name": "price",
          "label": "Price",
          "type": "text",
          "description": "Price with currency symbol",
          "required": false
        },
        {
          "name": "description",
          "label": "Description",
          "type": "text",
          "description": "Product description or details",
          "required": false
        },
        {
          "name": "images",
          "label": "Images",
          "type": "array",
          "description": "Array of product image URLs",
          "required": false
        }
      ]
    }'::jsonb,
    true,
    NULL
  ),
  (
    'ffafc28b-1b8b-4b0d-b226-9f9a6154004e',
    'Detailed Material Specs',
    'Comprehensive fields including technical specifications and supplier info',
    '{
      "fields": [
        {
          "name": "material_name",
          "label": "Material Name",
          "type": "text",
          "description": "The name or title of the material product",
          "required": true
        },
        {
          "name": "category",
          "label": "Category",
          "type": "text",
          "description": "Material category (tiles, stone, wood, etc.)",
          "required": false
        },
        {
          "name": "price",
          "label": "Price",
          "type": "text",
          "description": "Price with currency",
          "required": false
        },
        {
          "name": "description",
          "label": "Description",
          "type": "text",
          "description": "Product description",
          "required": false
        },
        {
          "name": "images",
          "label": "Images",
          "type": "array",
          "description": "Product image URLs",
          "required": false
        },
        {
          "name": "specifications",
          "label": "Specifications",
          "type": "object",
          "description": "Technical specs like dimensions, weight, finish",
          "required": false
        },
        {
          "name": "supplier",
          "label": "Supplier",
          "type": "text",
          "description": "Supplier or manufacturer name",
          "required": false
        }
      ]
    }'::jsonb,
    true,
    NULL
  );

-- Function to increment template usage count
CREATE OR REPLACE FUNCTION increment_template_usage(template_id UUID)
RETURNS void AS $$
BEGIN
  UPDATE field_templates
  SET usage_count = usage_count + 1
  WHERE id = template_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

