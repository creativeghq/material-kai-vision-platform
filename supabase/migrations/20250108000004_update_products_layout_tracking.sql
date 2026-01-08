-- Migration: Add layout tracking columns to products table
-- Description: Adds columns to track YOLO layout detection status for products
-- Author: AI Assistant
-- Date: 2025-01-08

-- Add layout tracking columns to products table
ALTER TABLE products
ADD COLUMN IF NOT EXISTS layout_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS layout_detection_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS total_layout_regions INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS total_tables_extracted INTEGER DEFAULT 0;

-- Create index for layout detection status
CREATE INDEX IF NOT EXISTS idx_products_layout_detected ON products(layout_detected);

-- Add comments
COMMENT ON COLUMN products.layout_detected IS 'Whether YOLO layout detection has been run for this product';
COMMENT ON COLUMN products.layout_detection_date IS 'Timestamp when layout detection was completed';
COMMENT ON COLUMN products.total_layout_regions IS 'Total number of layout regions detected';
COMMENT ON COLUMN products.total_tables_extracted IS 'Total number of tables extracted';

