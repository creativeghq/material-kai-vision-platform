-- Migration: Create product_layout_regions table for YOLO-detected layout regions
-- Description: Stores layout regions (TEXT, IMAGE, TABLE, TITLE, CAPTION) detected by YOLO
-- Author: AI Assistant
-- Date: 2025-01-08

-- Create product_layout_regions table
CREATE TABLE IF NOT EXISTS product_layout_regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    page_number INTEGER NOT NULL,
    region_type VARCHAR(50) NOT NULL CHECK (region_type IN ('TEXT', 'IMAGE', 'TABLE', 'TITLE', 'CAPTION')),

    -- Bounding box (normalized 0-1 coordinates)
    bbox_x FLOAT NOT NULL,
    bbox_y FLOAT NOT NULL,
    bbox_width FLOAT NOT NULL,
    bbox_height FLOAT NOT NULL,

    -- Detection metadata
    confidence FLOAT NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
    reading_order INTEGER,

    -- Content
    text_content TEXT,  -- For TEXT/TITLE/CAPTION regions
    linked_image_id UUID REFERENCES document_images(id),  -- For CAPTION regions

    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb,

    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX idx_product_layout_regions_product_page ON product_layout_regions(product_id, page_number);
CREATE INDEX idx_product_layout_regions_type ON product_layout_regions(region_type);
CREATE INDEX idx_product_layout_regions_reading_order ON product_layout_regions(reading_order);
CREATE INDEX idx_product_layout_regions_linked_image ON product_layout_regions(linked_image_id);

-- Add comment
COMMENT ON TABLE product_layout_regions IS 'Stores YOLO-detected layout regions for products';
COMMENT ON COLUMN product_layout_regions.region_type IS 'Type of region: TEXT, IMAGE, TABLE, TITLE, or CAPTION';
COMMENT ON COLUMN product_layout_regions.reading_order IS 'Reading order determined by YOLO (top-to-bottom, left-to-right)';
COMMENT ON COLUMN product_layout_regions.bbox_x IS 'Normalized X coordinate (0-1) of top-left corner';
COMMENT ON COLUMN product_layout_regions.bbox_y IS 'Normalized Y coordinate (0-1) of top-left corner';
COMMENT ON COLUMN product_layout_regions.bbox_width IS 'Normalized width (0-1)';
COMMENT ON COLUMN product_layout_regions.bbox_height IS 'Normalized height (0-1)';

