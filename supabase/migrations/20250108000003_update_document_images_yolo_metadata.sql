-- Migration: Add YOLO metadata columns to document_images table
-- Description: Adds columns to track YOLO detection metadata for images
-- Author: AI Assistant
-- Date: 2025-01-08

-- Add YOLO metadata columns to document_images table
ALTER TABLE document_images
ADD COLUMN IF NOT EXISTS yolo_detected BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS yolo_region_type VARCHAR(50),
ADD COLUMN IF NOT EXISTS yolo_confidence FLOAT CHECK (yolo_confidence >= 0 AND yolo_confidence <= 1),
ADD COLUMN IF NOT EXISTS yolo_reading_order INTEGER;

-- Create index for YOLO-detected images
CREATE INDEX IF NOT EXISTS idx_document_images_yolo_detected ON document_images(yolo_detected);
CREATE INDEX IF NOT EXISTS idx_document_images_yolo_region_type ON document_images(yolo_region_type);

-- Add comments
COMMENT ON COLUMN document_images.yolo_detected IS 'Whether this image was detected by YOLO layout detection';
COMMENT ON COLUMN document_images.yolo_region_type IS 'YOLO region type: IMAGE or CAPTION';
COMMENT ON COLUMN document_images.yolo_confidence IS 'YOLO detection confidence score (0-1)';
COMMENT ON COLUMN document_images.yolo_reading_order IS 'Reading order from YOLO detection';

