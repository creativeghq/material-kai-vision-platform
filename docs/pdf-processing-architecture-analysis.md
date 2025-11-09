# PDF Processing Architecture Analysis

## Endpoint Comparison

### Primary Endpoint: `/documents/upload-with-discovery`

This endpoint provides AI-powered product discovery with flexible extraction options.

**Features:**
- **Purpose**: Upload PDF with intelligent product discovery
- **Product Discovery**: Dynamic AI-based identification using Claude/GPT
- **Focused Extraction**: Optional parameter (`focused_extraction=True/False`)

**Processing Flow:**
1. **Stage 0**: Claude/GPT analyzes entire PDF and discovers products dynamically
2. **Stage 1**: If `focused_extraction=True`, processes only pages identified in discovery
3. **Stage 2**: Creates semantic chunks for product content
4. **Stage 3**: Extracts and processes images with AI analysis
5. **Stage 4**: Creates product records from discovery results
6. **Stage 5**: Queues Claude validation for async processing

### Alternative Endpoint: `/documents/upload-focused`

This endpoint provides targeted extraction for specific products.

**Features:**
- **Purpose**: Upload PDF for specific product extraction
- **Product Discovery**: Manual specification via parameters
- **Focused Extraction**: Always enabled

**Processing Flow:**
1. User provides `product_name`, `designer`, `search_terms`
2. `FocusedProductExtractor` searches for text matches in PDF
3. Extracts only pages containing specified search terms
4. Processes extracted pages

**Note**: This endpoint uses text-based search rather than AI discovery, providing faster processing for known products but less comprehensive discovery.

---

## Focused Extraction Logic

### Page Selection Implementation

The focused extraction logic determines which pages to process based on AI discovery results:

```python
product_pages = set()
if focused_extraction:
    logger.info(f"   ENABLED - Processing ONLY pages with {len(catalog.products)} products")
    for product in catalog.products:
        product_pages.update(product.page_range)  # Uses Claude discovery results

    pages_to_skip = set(range(1, pdf_result.page_count + 1)) - product_pages
    for page_num in pages_to_skip:
        tracker.skip_page_processing(page_num, "Not a product page (focused extraction)")
else:
    logger.info(f"   DISABLED - Processing ALL {pdf_result.page_count} pages")
    product_pages = set(range(1, pdf_result.page_count + 1))  # Process all pages
```

This implementation uses Claude's discovery results to determine which pages contain products, ensuring accurate page selection.

### Image Processing Implementation

The image processing stage extracts and analyzes images from the PDF:

```python
# Process images with Llama + CLIP
images_processed = 0
logger.info(f"   Total images extracted from PDF: {len(pdf_result_with_images.extracted_images)}")
logger.info(f"   Images grouped by page: {len(images_by_page)} pages with images")
logger.info(f"   Product pages to process: {sorted(product_pages)}")
```

Image extraction respects the `focused_extraction` flag, processing only images from identified product pages when enabled.

---

## Focused Extraction Behavior

### Focused Mode Enabled (`focused_extraction=True`)

This is the default mode, optimized for product catalog processing.

**Processing Flow:**
1. **Stage 0**: Claude analyzes entire PDF and identifies products on pages 5-11
2. **Stage 1**: Sets `product_pages = {5, 6, 7, 8, 9, 10, 11}` from Claude discovery
3. **Stage 2**: Creates chunks only from pages 5-11
4. **Stage 3**: Extracts and processes images only from pages 5-11
5. **Stage 4**: Creates product records from Claude discovery (11 products)

**Content Processing:**
- **Chunks**: Created only from product pages (pages 5-11)
- **Images**: Saved only from product pages (pages 5-11)
- **Products**: All products identified by Claude discovery

### Focused Mode Disabled (`focused_extraction=False`)

This mode processes the entire PDF without filtering.

**Processing Flow:**
1. **Stage 0**: Claude analyzes entire PDF and identifies products on pages 5-11
2. **Stage 1**: Sets `product_pages = {1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11}` (all pages)
3. **Stage 2**: Creates chunks from all pages
4. **Stage 3**: Extracts and processes images from all pages
5. **Stage 4**: Creates product records from Claude discovery (11 products)

**Content Processing:**
- **Chunks**: Created from all pages (1-11)
- **Images**: Saved from all pages (1-11)
- **Products**: All products identified by Claude discovery

---

## Architecture Considerations

### Endpoint Strategy

The platform provides two upload endpoints with different use cases:

**Primary Endpoint (`/documents/upload-with-discovery`):**
- Recommended for most use cases
- Uses AI discovery for comprehensive product identification
- Supports both focused and full PDF processing
- Provides flexible extraction options

**Alternative Endpoint (`/documents/upload-focused`):**
- Designed for specific product targeting
- Uses text-based search for faster processing
- Suitable when product names are known in advance
- Maintains backward compatibility

### Image Processing Strategy

Image extraction can be optimized based on the `focused_extraction` flag:

```python
# Image filtering implementation
for img_data in pdf_result_with_images.extracted_images:
    # Extract page number
    page_num = extract_page_number(img_data['filename'])

    # Skip images not on product pages if focused extraction is enabled
    if focused_extraction and page_num not in product_pages:
        logger.debug(f"Skipping image from page {page_num} (not a product page)")
        continue

    # Save image to database
```

This approach ensures images are only processed from relevant pages when focused extraction is enabled.

### API Documentation

The `/documents/upload-with-discovery` endpoint provides comprehensive PDF processing:

**Parameters:**
- `file`: PDF file (required)
- `discovery_model`: AI model for discovery - "claude" (default) or "gpt"
- `focused_extraction`: Boolean (default: True)
  - `True`: Process only pages containing products identified by AI
  - `False`: Process entire PDF while still using AI to identify products

**Processing Flow:**
1. AI analyzes entire PDF to identify products (Claude/GPT)
2. If `focused_extraction=True`: Extract only product pages
3. If `focused_extraction=False`: Extract all pages
4. Create chunks, images, and products based on extraction scope

**Use Cases:**
- `focused_extraction=True`: Product catalogs (skip marketing/admin pages)
- `focused_extraction=False`: Mixed content PDFs (process everything)

### Processing Stage Consistency

All processing stages respect the `focused_extraction` flag:

- **Stage 2 (Chunking)**: Creates chunks only from selected pages
- **Stage 3 (Images)**: Processes images only from selected pages
- **Stage 4 (Products)**: Uses Claude discovery results consistently

This ensures consistent behavior across all stages of the processing pipeline.

---

## Summary

### Architecture Overview

The PDF processing architecture provides flexible extraction options:

**Primary Endpoint:**
- `/documents/upload-with-discovery` serves as the main entry point
- Claude/GPT provides dynamic product discovery
- `focused_extraction` parameter controls processing scope
- All stages respect the same `product_pages` set

**Processing Consistency:**
- Chunking stage processes selected pages
- Image extraction respects page selection
- Product creation uses AI discovery results
- All stages maintain consistent behavior

### Implementation Details

**Page Selection:**
- AI discovery identifies product pages
- `focused_extraction` flag controls filtering
- Consistent page sets across all stages
- Validation ensures processing accuracy

**Content Processing:**
- Chunks created from selected pages
- Images extracted from selected pages
- Products created from AI discovery
- Embeddings generated for all content

