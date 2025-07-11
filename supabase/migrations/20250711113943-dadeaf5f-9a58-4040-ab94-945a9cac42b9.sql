-- Create material metadata fields configuration table
CREATE TABLE public.material_metadata_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_name VARCHAR(100) NOT NULL,
  display_name VARCHAR(200) NOT NULL,
  field_type VARCHAR(50) NOT NULL CHECK (field_type IN ('text', 'number', 'dropdown', 'boolean', 'date')),
  is_required BOOLEAN DEFAULT false,
  description TEXT,
  extraction_hints TEXT,
  dropdown_options TEXT[], -- For dropdown fields
  applies_to_categories material_category[],
  is_global BOOLEAN DEFAULT false, -- Global fields apply to all categories
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

-- Enable RLS
ALTER TABLE public.material_metadata_fields ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Material metadata fields are viewable by everyone"
ON public.material_metadata_fields
FOR SELECT
USING (true);

CREATE POLICY "Admins can manage metadata fields"
ON public.material_metadata_fields
FOR ALL
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Analysts can create metadata fields"
ON public.material_metadata_fields
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'analyst') OR has_role(auth.uid(), 'admin'));

-- Create trigger for updated_at
CREATE TRIGGER update_material_metadata_fields_updated_at
BEFORE UPDATE ON public.material_metadata_fields
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert global metadata fields from the documentation
INSERT INTO public.material_metadata_fields (
  field_name, display_name, field_type, is_required, description, extraction_hints, 
  dropdown_options, is_global, sort_order
) VALUES 
('manufacturer', 'Manufacturer', 'text', true, 'Company that produces the material', 'Look for company logo, "manufactured by", or prominent branding', NULL, true, 1),
('collection', 'Collection', 'text', false, 'Product collection or series name', 'Near "collection", "series", or as a prominent subtitle', NULL, true, 2),
('productCode', 'Product Code', 'text', false, 'Manufacturer''s product code/reference', 'Pattern "Ref:", "Code:", "Art. Nr.", alphanumeric code', NULL, true, 3),
('year', 'Year', 'number', false, 'Year of production/release', 'Four-digit year, often near copyright or catalog information', NULL, true, 4),
('countryOfOrigin', 'Country of Origin', 'text', false, 'Manufacturing country', '"Made in", "Produced in", "Origin:"', NULL, true, 5),
('warranty', 'Warranty', 'text', false, 'Warranty information', 'Near "warranty", "guarantee", often as "X years"', NULL, true, 6),
('certifications', 'Certifications', 'text', false, 'Product certifications', 'Look for certification logos, "Certified by", certification codes', NULL, true, 7),
('applicationArea', 'Application Area', 'dropdown', false, 'Where the material can be used', '"Suitable for", "Application:", "Recommended use:"', ARRAY['Indoor', 'Outdoor', 'Bathroom', 'Kitchen', 'Commercial', 'Residential', 'Industrial'], true, 8),
('priceRange', 'Price Range', 'dropdown', false, 'Price category', 'Look for price indicators, "$", "€", "price category"', ARRAY['Budget', 'Mid-range', 'Premium', 'Luxury'], true, 9),
('sustainability', 'Sustainability', 'dropdown', false, 'Environmental friendliness rating', 'Look for sustainability certifications, eco-friendly labels', ARRAY['Low', 'Medium', 'High', 'Excellent'], true, 10);

-- Create index for performance
CREATE INDEX idx_material_metadata_fields_category ON public.material_metadata_fields USING GIN(applies_to_categories);
CREATE INDEX idx_material_metadata_fields_global ON public.material_metadata_fields(is_global);
CREATE INDEX idx_material_metadata_fields_sort ON public.material_metadata_fields(sort_order);