-- Add Azure AI Document Intelligence specific fields to pdf_processing_results
ALTER TABLE pdf_processing_results 
ADD COLUMN azure_model_used text,
ADD COLUMN azure_confidence_score numeric,
ADD COLUMN document_classification jsonb DEFAULT '{}',
ADD COLUMN extracted_tables jsonb DEFAULT '{}',
ADD COLUMN form_fields jsonb DEFAULT '{}';

-- Add Azure-specific fields to pdf_processing_tiles for better material extraction
ALTER TABLE pdf_processing_tiles
ADD COLUMN azure_element_type text,
ADD COLUMN azure_confidence numeric,
ADD COLUMN bounding_polygon jsonb DEFAULT '{}',
ADD COLUMN table_cell_info jsonb DEFAULT '{}',
ADD COLUMN form_field_info jsonb DEFAULT '{}';