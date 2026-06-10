# Image Embedding Generation

Image embedding generation system with batching, retry logic, and checkpoint recovery for reliable embedding coverage.

> **Architecture note (2026-04)**: CLIP models (512D collections) were retired. The current system uses **SigLIP2 via SLIG cloud endpoint** (768D visual) + **Voyage AI `voyage-4`** (1024D aspect + understanding embeddings). The "CLIP" label in some of the method names below (`save_images_and_generate_clips`, `clip_embeddings_generated`) is a legacy alias retained for backwards compatibility; they now write SigLIP2/Voyage vectors to VECS.

---

## Overview

The image embedding system generates visual embeddings for all processed images using SigLIP2 (768D visual) and Voyage AI (1024D aspect + understanding). The system includes batch processing, automatic retry with exponential backoff, and checkpoint recovery to ensure complete embedding coverage.

## Features

### 1. Batch Processing

**Implementation:**
- Process images in batches of 20 (configurable)
- Reduces memory pressure
- Better progress tracking
- Enables checkpoint recovery per batch

**Benefits:**
- More efficient resource usage
- Clearer progress reporting
- Easier to resume from failures

### 2. Retry Logic with Exponential Backoff

**Implementation:**
- Up to 3 retries per failed image (configurable)
- Exponential backoff: 2^retry_count seconds (2s, 4s, 8s)
- Detailed logging for each retry attempt

**Benefits:**
- Handles transient failures (network, API rate limits)
- Prevents permanent data loss
- Comprehensive error tracking

### 3. Checkpoint Recovery

**Implementation:**
- Queries database for existing embeddings before processing
- Skips already-processed images
- Resumes from last successful batch

**Benefits:**
- Safe to restart after failures
- No duplicate processing
- Efficient resource usage

### 4. Detailed Error Tracking

**Implementation:**
- Returns `failed_images` array with index, path, page_number, error
- Logs first 5 failures in detail
- Tracks which images fail and why

**Benefits:**
- Easy debugging
- Clear visibility into failures
- Actionable error messages

## Implementation Details

### New Methods

#### `_get_embedding_checkpoint(document_id: str) -> Optional[int]`

Queries the `document_images` table to count images with `has_slig_embedding = TRUE` for the given document (updated 2026-04 — the legacy `visual_clip_embedding_512` column was dropped; VECS is now the single source of truth for image vectors, and per-image presence is tracked via boolean flags on `document_images`). Returns the count as an integer checkpoint index.

#### `_process_single_image_with_retry(...) -> Tuple[bool, bool, Optional[str]]`

Processes a single image with retry logic using a while loop up to `max_retries` attempts. On each failure, waits `2^retry_count` seconds before retrying (exponential backoff). Returns a tuple of `(image_saved, embedding_generated, error_message)`.

#### `save_images_and_generate_clips(...) -> Dict[str, Any]`

Main method with batching + retry + checkpointing. Signature: `save_images_and_generate_clips(material_images, document_id, workspace_id, batch_size=20, max_retries=3)`. First checks the checkpoint to skip already-processed images, then processes remaining images in batches, calling `_process_single_image_with_retry` for each. Returns a dict with `images_saved`, `clip_embeddings_generated`, and `failed_images`.

## Configuration

### Default Parameters

- `batch_size`: 20 images per batch
- `max_retries`: 3 retry attempts per image
- Exponential backoff: 2^retry_count seconds

### Customization

All parameters are configurable via method arguments. For memory-constrained environments, use a smaller `batch_size` (e.g., 10). For unreliable networks, increase `max_retries` (e.g., 5).

## Performance Impact

### Before (Sequential Processing)

- **Processing Time**: ~2-3 seconds per image
- **Success Rate**: 51.6% (132/256 images)
- **Failure Handling**: Silent failures, no retry
- **Recovery**: Manual intervention required

### After (Batched with Retry)

- **Processing Time**: ~2-3 seconds per image (same)
- **Success Rate**: 95%+ (expected with retry logic)
- **Failure Handling**: Up to 3 retries with exponential backoff
- **Recovery**: Automatic checkpoint recovery

### Resource Usage

- **Memory**: Slightly lower (batch processing)
- **Network**: More efficient (retry logic handles transient failures)
- **Database**: Same (checkpoint query is lightweight)

## Testing Results

### NOVA Test Case

**Before Fix:**
- Total Images: 256
- Images with Embeddings: 132 (51.6%)
- Missing Embeddings: 124 (48.4%)

**After Fix (Expected):**
- Total Images: 256
- Images with Embeddings: 243+ (95%+)
- Failed Images: <13 (5%)
- All failures logged with detailed error messages

## Error Handling

### Retry Scenarios

1. **Network Timeout** - Retries with exponential backoff
2. **API Rate Limit** - Waits and retries
3. **Temporary Service Unavailable** - Retries after delay
4. **Invalid Image Data** - Fails after max retries, logs error

### Permanent Failures

Images that fail after all retries are:
1. Logged with detailed error messages
2. Included in `failed_images` array
3. Reported in final summary
4. Can be manually retried later

## Monitoring

### Log Output

The log shows progress per batch: saving each image to DB with its UUID, generating SLIG/Voyage embeddings per image (the method is still named `generate_clips` for backwards compat), and batch completion messages. The final summary reports total images saved, total embeddings generated, and a list of failed images with their page numbers and error reasons (e.g., "Network timeout after 3 retries", "Invalid image format").

## Integration

### Pipeline Integration

The improved method is automatically used in the PDF processing pipeline at **Stage 30: save-images-db** (`POST /api/internal/save-images-db/{job_id}`), which calls `save_images_and_generate_clips` with the document's material images, document ID, and workspace ID.

### Manual Usage

The service can also be called directly for reprocessing existing documents. After calling `save_images_and_generate_clips`, inspect the returned dict for `clip_embeddings_generated`, `images_saved`, and `failed_images` counts.

## Understanding Embeddings (Claude Opus 4.7 vision_analysis → Voyage AI)

### Overview

Understanding embeddings capture the structured knowledge from the vision_analysis pass. Rather than embedding the raw image pixels (which SLIG does), understanding embeddings embed the **semantic description** of what was detected: material types, colors, textures, dimensions, finishes, and OCR text.

### How It Works (post-2026-05-01)

1. **Claude Opus 4.7 Vision Analysis** (Anthropic tool use) → Produces a `VisionAnalysis` Pydantic payload with material type, colors, textures, properties, OCR-aware fields. Schema-locked via `VISION_ANALYSIS_TOOL` (`app/models/vision_analysis.py`) — no JSON regex recovery needed.
2. **JSON → Text Conversion** → `serialize_vision_analysis_to_text(VisionAnalysis)` produces a deterministic descriptive string (e.g., `"Material: porcelain tile. Colors: white, grey. Texture: matte. Dimensions: 60x120cm."`)
3. **Voyage AI Embedding** → Embeds the text via `voyage-4` with `input_type="document"` → 1024D vector
4. **VECS Storage** → Stored in `image_understanding_embeddings` collection (1024D halfvec, HNSW index)

> **Why the migration matters (2026-05-01)**: Pre-migration, this pipeline read JSON from a Qwen vision endpoint that had been 404-ing for months — every Qwen call had been silently falling through to Anthropic Claude, but with regex-based JSON recovery instead of schema enforcement. The migration to Anthropic tool use locked the schema, so Voyage no longer risks embedding malformed payloads.

### Provenance + Drift Detection

Every understanding-embedding row persists `embedding_model` + `schema_version` (in VECS metadata + mirrored on `document_images.understanding_embedding_model` / `understanding_schema_version`). Same on `products.text_embedding_1024_model` / `text_embedding_schema_version`.

The **OpenAI fallback is disabled** for the understanding path so Voyage and OpenAI vectors never co-exist in the same VECS collection. Wrong-dim or missing embedding sets `embedding_failed=true` on the return; orchestrator marks for re-embedding rather than creating a row with NULL `text_embedding_1024` (fixed audit gap C).

### Search Flow

1. **Query** → Embedded via Voyage AI `voyage-4` with `input_type="query"` → 1024D vector
2. **VECS Search** → Similarity search against `image_understanding_embeddings`
3. **Score Fusion** → Combined with 6 other embedding scores (text + visual SLIG 768D + 4× Voyage aspect 1024D) using weighted fusion (see `docs/search-strategies.md` for weight configurations)

### Pipeline Integration (updated 2026-05)

- **Phase 1 image pipeline (inline)**: Generates the understanding embedding directly after Claude vision_analysis, in the same pass that writes SLIG embeddings to VECS. The former asynchronous "Phase 2 background processor" (`background_image_processor.py`) was deleted in 2026-04 — it was silently broken and produced no output.
- **Backfill endpoint**: `POST /admin/understanding-embeddings/backfill` re-runs vision_analysis (Claude Opus 4.7 + tool use) → Voyage on stale rows (no embedding / older schema_version / non-Voyage embedding_model). Bounded by `batch_size` + `max_images`.
- **Clip Job Service** (legacy name): Generates understanding embedding for images with existing vision_analysis; despite the "CLIP" name, it now uses Voyage AI
- **Regeneration Endpoint**: Includes understanding in embedding regeneration

### Hardening (2026-05-01)

- **Vision schema validation**: rejects malformed payloads before Voyage embeds garbage. With Anthropic tool use this is structurally impossible, but the validator stays as defense in depth.
- **Voyage 429 explicit handling** with `Retry-After` honoring
- **Atomic specialized VECS upsert**: writes all 4 SLIG vectors first, then sets flags only for those that landed
- **`ai_usage_logs` mirror**: retries twice + ERRORs on persistent failure

### Benefits

- **Spec-based search**: Find "porcelain tile 60x120cm" or "R10 slip rating" through semantic matching
- **OCR-aware**: Text detected in images is included in the embedding
- **Property-aware**: Material properties, dimensions, finishes are all searchable
- **Complements SLIG**: SLIG captures visual appearance; understanding captures semantic knowledge

## Future Enhancements

1. **Parallel Batch Processing** - Process multiple batches concurrently
2. **Adaptive Batch Size** - Adjust batch size based on available memory
3. **Smart Retry Strategy** - Different retry logic for different error types
4. **Automatic Reprocessing** - Background job to retry failed images
5. **Metrics Dashboard** - Real-time monitoring of embedding generation

## Related Documentation

- [PDF Processing Pipeline](./pdf-processing-pipeline.md)
- [Image Processing Service](./system-architecture.md#image-processing)
- [API Endpoints](./api-endpoints.md)
- [Troubleshooting Guide](./troubleshooting-guide.md)

