-- Add custom_request_text field to quotes table
-- This allows users to create quotes with custom text requests instead of just products

ALTER TABLE quotes 
ADD COLUMN IF NOT EXISTS custom_request_text TEXT;

-- Add comment for documentation
COMMENT ON COLUMN quotes.custom_request_text IS 'Custom text request when user wants to request materials without selecting specific products';

-- Update the quotes table to support both product-based and custom request quotes
-- A quote can have EITHER products (quote_items) OR a custom request text, but not necessarily both

