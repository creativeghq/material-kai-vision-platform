# OCR Optimization - Multi-Phase Filtering Implementation

## Date: 2025-10-29

## Summary
Implemented a comprehensive 4-phase OCR optimization system to reduce PDF processing time from 84+ minutes to ~6-8 minutes by intelligently filtering which images need OCR processing.

## Problem Statement
- **Before:** All 215 images in Harmony PDF processed with OCR at ~30 seconds each = 84+ minutes
- **Issue:** Most images are product photos without text, wasting processing time
- **Goal:** Only process images that actually contain technical text/specifications

## Solution: Multi-Phase OCR Filtering

### Phase 1: OpenCV Fast Text Detection (~0.1s per image)
- **Method:** Edge detection and contour analysis
- **Purpose:** Quickly eliminate images with no text patterns
- **Expected:** Filter out ~80% of images (pure product photos, mood boards)
- **Implementation:** `_opencv_fast_text_detection()` in `pdf_processor.py`

### Phase 2: CLIP AI Classification (~0.5s per image)
- **Method:** Zero-shot classification using CLIP embeddings
- **Purpose:** Distinguish technical text from decorative text
- **Expected:** Filter out ~15% more images (decorative quotes, branding)
- **Implementation:** Enhanced `_should_image_have_ocr()` with better prompts

### Phase 3: Full EasyOCR Processing (~30s per image)
- **Method:** Complete OCR extraction
- **Purpose:** Extract actual text from technical images
- **Expected:** Process only ~5% of images (10-15 instead of 168)
- **Implementation:** Modified `_process_images_with_ocr()` to integrate all phases

### Phase 4: Manual Admin Reprocessing (On-demand)
- **Method:** Admin UI button to reprocess skipped images
- **Purpose:** Handle edge cases where filtering was too aggressive
- **Implementation:** New endpoint `/admin/images/{image_id}/process-ocr`

## Performance Improvement

### Before:
- 168 images × 30s = **84 minutes**

### After:
- 215 images × 0.1s (OpenCV) = 21 seconds
- 40 images × 0.5s (CLIP) = 20 seconds  
- 10 images × 30s (OCR) = 5 minutes
- **Total: ~6-8 minutes** (10-14x faster!)

## Files Modified

### 1. `/var/www/mivaa-pdf-extractor/app/services/pdf_processor.py`

#### Added: `_opencv_fast_text_detection()` (Lines 1441-1540)
```python
def _opencv_fast_text_detection(self, image_path: str) -> Dict[str, Any]:
    """
    Ultra-fast text detection using OpenCV edge detection and contour analysis.
    Speed: ~0.1 seconds per image (300x faster than EasyOCR)
    """
    # Uses Canny edge detection + contour analysis
    # Detects text-like rectangular patterns
    # Returns: has_text, text_contours_count, confidence
```

#### Enhanced: `_should_image_have_ocr()` (Lines 1542-1675)
```python
# Updated CLIP prompts for better classification:
relevant_prompts = [
    "product specification table with dimensions and measurements",
    "technical data sheet with material properties and numbers",
    # ... 10 specific technical prompts
]

irrelevant_prompts = [
    "historical photograph of people without technical content",
    "decorative mood board or lifestyle image",
    # ... 11 specific decorative prompts
]

# Stricter thresholds:
# relevant_score > 0.35 (was 0.25)
# score_diff > 0.15 (was 0.05)
```

#### Modified: `_process_images_with_ocr()` (Lines 1676-1910)
```python
async def _process_images_with_ocr(...):
    # PHASE 1: OpenCV Fast Text Detection
    opencv_passed = []
    opencv_skipped = []
    for image in extracted_images:
        opencv_result = self._opencv_fast_text_detection(image_path)
        if opencv_result['has_text']:
            opencv_passed.append(...)
        else:
            opencv_skipped.append(...)
    
    # PHASE 2: CLIP AI Classification
    images_to_process = []
    clip_skipped = []
    for item in opencv_passed:
        clip_decision = await self._should_image_have_ocr(image_path)
        if clip_decision['should_process']:
            images_to_process.append(...)
        else:
            clip_skipped.append(...)
    
    # PHASE 3: Full EasyOCR Processing
    for item in images_to_process:
        ocr_results = ocr_service.extract_text_from_image(image_path)
        # ... process results
    
    # Add metadata for all skipped images
    for item in images_skipped:
        ocr_results.append({
            'skipped': True,
            'skip_metadata': {
                'ocr_status': 'skipped',
                'skip_reason': 'opencv_no_text' or 'clip_decorative',
                'can_reprocess': True,
                'opencv_detection': {...},
                'clip_classification': {...}
            }
        })
```

### 2. `/var/www/mivaa-pdf-extractor/app/api/admin.py`

#### Added: Manual OCR Reprocessing Endpoint (Lines 1600-1767)
```python
@router.post("/admin/images/{image_id}/process-ocr")
async def reprocess_image_ocr(
    image_id: str,
    workspace_context: WorkspaceContext = Depends(get_workspace_context),
    current_user: User = Depends(require_admin)
):
    """
    Manually reprocess a single image with OCR and update all related entities.
    
    Process:
    1. Run full EasyOCR on the image
    2. Update image.ocr_extracted_text and ocr_confidence_score
    3. Update related chunks with new OCR text
    4. Regenerate text embeddings for updated chunks
    5. Update product associations based on new OCR text
    6. Update metadata relationships
    """
    # Download image from Supabase storage
    # Run EasyOCR
    # Update database records
    # Regenerate embeddings
    # Return comprehensive results
```

## Database Schema

### `document_images.metadata` JSONB Structure
```json
{
  "ocr_status": "skipped" | "ocr_complete" | "ocr_complete_no_text",
  "skip_reason": "opencv_no_text" | "clip_decorative" | null,
  "can_reprocess": true | false,
  "opencv_detection": {
    "text_contours_count": 5,
    "confidence": 0.1
  },
  "clip_classification": {
    "relevant_score": 0.28,
    "irrelevant_score": 0.42,
    "reason": "decorative_content"
  }
}
```

## Testing Status

### Current Status
- ✅ Code implemented and deployed to server
- ✅ Service restarted successfully
- ⏳ **NOT TESTED YET** - Test stopped at 32% (image extraction phase)
- ⏳ OCR phase has not been reached yet

### Next Steps
1. ✅ Commit changes to git (THIS DOCUMENT)
2. ⏳ Run new test and wait for OCR phase
3. ⏳ Verify performance improvement
4. ⏳ Create admin UI components for Phase 4

## Deployment Notes

- Changes made directly on server: `/var/www/mivaa-pdf-extractor`
- Service restarted: `sudo systemctl restart mivaa-pdf-extractor`
- Health check: Service running successfully
- Archive created: `/tmp/ocr_optimization_changes.tar.gz` (33KB)

## Future Enhancements

1. **Admin UI Components** (Phase 4)
   - OCR status badges in Knowledge Base Images view
   - "Process OCR" button for skipped images
   - Real-time reprocessing feedback

2. **Metrics & Monitoring**
   - Track filtering effectiveness
   - Monitor false positive/negative rates
   - Adjust thresholds based on real-world data

3. **Additional Optimizations**
   - Batch OCR processing for multiple images
   - Parallel processing with worker pools
   - Caching of CLIP embeddings

