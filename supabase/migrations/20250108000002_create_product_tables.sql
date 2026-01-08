-- Migration: Create product_tables table for extracted table data
-- Description: Stores tables extracted from PDFs using Camelot, guided by YOLO TABLE regions
-- Author: AI Assistant
-- Date: 2025-01-08

-- Create product_tables table
CREATE TABLE IF NOT EXISTS product_tables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    layout_region_id UUID REFERENCES product_layout_regions(id) ON DELETE SET NULL,

    -- Table data
    table_data JSONB NOT NULL,  -- Structured table as JSON (rows and columns)
    headers TEXT[],  -- Column headers
    table_type VARCHAR(50),  -- specifications, dimensions, comparison, other

    -- Extraction metadata
    confidence FLOAT CHECK (confidence >= 0 AND confidence <= 1),
    extractor VARCHAR(50) DEFAULT 'camelot',  -- camelot, pdfplumber, etc.

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_product_tables_product_page ON product_tables(product_id, page_number);
CREATE INDEX idx_product_tables_type ON product_tables(table_type);
CREATE INDEX idx_product_tables_layout_region ON product_tables(layout_region_id);
CREATE INDEX idx_product_tables_data ON product_tables USING GIN (table_data);

-- Add comments
COMMENT ON TABLE product_tables IS 'Stores extracted table data from PDFs';
COMMENT ON COLUMN product_tables.table_data IS 'Structured table data in JSON format with rows and columns';
COMMENT ON COLUMN product_tables.headers IS 'Array of column headers';
COMMENT ON COLUMN product_tables.table_type IS 'Classification: specifications, dimensions, comparison, or other';
COMMENT ON COLUMN product_tables.layout_region_id IS 'Reference to YOLO TABLE region that guided extraction';
COMMENT ON COLUMN product_tables.extractor IS 'Tool used for extraction (camelot, pdfplumber, etc.)';

