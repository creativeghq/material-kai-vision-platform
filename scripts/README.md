# Full Workflow Test — End-to-End Validation Plan

This document describes how to run the **MIVAA full workflow test** against a fresh PDF (or against the existing 9 documents that need backfilling) and how to verify that **every** part of the post-2026-04 7-vector embedding pipeline is producing the data we expect.

It is the canonical "did everything actually work?" runbook. Run it after every deploy that touches the image or embedding pipeline.

---

## 0. Purpose & success criteria

We need a fresh PDF run that ends with **100% completion** and produces all of the following:

| Asset | Where it lives | Expected count for the test PDF |
|---|---|---|
| **Document chunks** | `document_chunks` | > 0 |
| **Chunk text embeddings** | `document_chunks.text_embedding` (Voyage 1024D) | = chunks count |
| **Images extracted** | `document_images` | > 0 |
| **Visual SLIG embeddings** | `vecs.image_slig_embeddings` (768D) | = material image count |
| **Color SLIG embeddings** | `vecs.image_color_embeddings` (768D) | = material image count |
| **Texture SLIG embeddings** | `vecs.image_texture_embeddings` (768D) | = material image count |
| **Style SLIG embeddings** | `vecs.image_style_embeddings` (768D) | = material image count |
| **Material SLIG embeddings** | `vecs.image_material_embeddings` (768D) | = material image count |
| **Understanding embeddings** | `vecs.image_understanding_embeddings` (Voyage 1024D from Qwen3-VL `vision_analysis`) | ≈ material image count (Claude fallback acceptable) |
| **Boolean presence flags** | `document_images.has_*_slig`, `has_understanding_embedding` | one row per image, true where the corresponding VECS row exists |
| **Products** | `products` | exactly 1 in test mode (`test_single_product=true`) |
| **Product text embeddings** | `products.text_embedding_1024` | = product count |
| **Chunk → product relationships** | `chunk_product_relationships` | > 0 |
| **Chunk → image relationships** | `chunk_image_relationships` | > 0 (page proximity, populated by `entity_linking_service`) |
| **Image → product associations** | `image_product_associations` | > 0 |
| **Visual metadata (text tags)** | `document_images.visual_metadata` (color names, finishes, etc) | populated for material images |
| **vision_analysis JSON** | `document_images.vision_analysis` | populated for material images (12-field schema, see Phase A) |
| **vision_provider** | `document_images.vision_provider` | `'qwen'` or `'claude_fallback'` |

If **any** of those is missing or zero where it should be > 0, the test is **NOT done**. Identify the failure step, fix the root cause, restart the pipeline, repeat until clean.

> **Hard rule for the test PDF.** We must discover **exactly 11 products** during stage 0 discovery. If discovery returns anything other than 11, **cancel everything**. We must process **only 1 product** (`test_single_product=true`) — if more than one starts processing, cancel them all. The run is only declared successful when `final-result.html` is written and contains the full per-vector breakdown.

---

## 1. The script — `test_full_workflow.sh`

Located at `mivaa-pdf-extractor/test_full_workflow.sh` on the production server (the script lives inside the python service repo, not in `/scripts/`).

```bash
# Test mode (process 1 product only — what we use for end-to-end validation)
./test_full_workflow.sh --test
```

What it does:

1. Refuses to start if a job for the same PDF is already running (deduplication).
2. Health-checks the API (database, storage, Anthropic). If Qwen is unhealthy the script will warn but continue — Claude fallback covers it.
3. Uploads the test PDF (`harmony-signature-book-24-25.pdf`) with `test_single_product=true`.
4. Polls `/api/rag/documents/job/{job_id}` every 10 s and prints `status | progress% | current_stage`.
5. On success, calls a `verify_results` function that fetches `/api/rag/documents/job/{job_id}` and checks `chunks_created`, `images_extracted`, `clip_embeddings_generated`, `products_discovered`.
6. On failure, dumps the last 100 lines of `journalctl -u mivaa-pdf-extractor.service` filtered to errors/exceptions.

Default timeout: **30 minutes**. If the run takes longer, **kill the job and investigate** — most stages should be done within 5–10 min in test mode. The full pipeline target is **30–45 min** in non-test mode (all 11 products).

**Working directory for outputs:** `/tmp/`. Every checkpoint produces a JSON dump named `/tmp/job_{job_id}_{status}.json`.

---

## 2. How to connect — SSH MCP

You drive this test from your workstation via the **ssh MCP** so you can read `journalctl` and tail logs in real time.

```
mcp__ssh-mcp__exec   for read-only commands (cat, tail, jq, journalctl, curl)
mcp__ssh-mcp__sudo-exec   for service restarts
```

The service runs as `mivaa-pdf-extractor.service`. Logs:
```
sudo journalctl -u mivaa-pdf-extractor.service -f          # live tail
sudo journalctl -u mivaa-pdf-extractor.service -n 200      # last 200 lines
sudo journalctl -u mivaa-pdf-extractor.service --since "5 minutes ago"
```

Job logs are also written into `/tmp/`. The `Product Checker` script — `/tmp/check_products_created.sh` — polls the database for new product rows tied to the active job, useful when you want to know "did stage 4 actually finish writing products?".

---

## 3. Investigation philosophy

> **Layer-by-layer.** Validate each layer (stage) before moving on. If a step fails, stop, find why, fix, restart from the affected stage, repeat until that step is 100% clean. **Do not** keep going past a failed stage hoping the next one will mask it.

For each stage you check:

1. The stage's **own log lines** (`journalctl ... | grep "Stage N"`)
2. The **HuggingFace endpoint calls** that stage should make (see §4 — these MUST appear in the logs; absence means the endpoint is not being called)
3. The **database / VECS** tables the stage writes to
4. The **stage transition** — that the next stage actually started

Any warnings or exceptions surfaced in `journalctl` get reported. Don't bury them — they're either real bugs we need to fix or noise we need to suppress.

---

## 4. HuggingFace endpoints we MUST see in the logs

If a HuggingFace call is missing from the logs for a step that's supposed to use it, **stop and fix** before continuing. Symptoms of "endpoint not called" usually mean the manager is paused, the auth token is wrong, or the registry singleton lost its handle.

| Endpoint | Stage that calls it | Log markers to grep for |
|---|---|---|
| **Qwen3-VL-32B** (image classification) | Stage 3 — `image_processing_service.classify_images` | `🤖 Starting AI-based image classification`, `Qwen OpenAI client base_url`, `qwen_endpoint` |
| **Qwen3-VL-32B** (material analysis → vision_analysis JSON) | Stage 3 — `_analyze_material_image → _try_qwen_material_analysis` | `🔬 ... vision_analysis valid for ... (qwen)`, `🩹 Falling back to Claude` (only if Qwen fails) |
| **YOLO** (layout regions) | Stage 1 — `extract_product_pages` | `YOLO ...`, `product_layout_regions` |
| **SLIG (SigLIP2)** primary visual embedding | Stage 3 — `real_embeddings_service._generate_visual_embedding` | `☁️ Visual Embeddings: SLIG Cloud Endpoint`, `✅ SLIG image embedding: 768D`, `Saved visual embedding to VECS` |
| **SLIG calculate_similarity** (color/texture/style/material text-guided blends) | Stage 3 — `_generate_specialized_siglip_embeddings` | `✅ Generated color specialized embedding (768D, similarity=...)` × 4 per image |
| **SLIG get_text_embedding** (text-guided prompts) | same as above | `✅ SLIG text embedding: 768D` |
| **Voyage AI** (text + understanding embeddings) | Stages 2, 3, 4 | `voyage-3.5`, `Generating text embedding`, `Understanding embedding generated (1024D)` |
| **Anthropic Claude Sonnet 4.6** (classification fallback + material analysis fallback) | Stage 3 | `validate_with_claude`, `claude_fallback`, `claude-sonnet-4-6-20260217` |

**Tail command to watch all of these in real time:**

```bash
sudo journalctl -u mivaa-pdf-extractor.service -f \
  | grep -E "Stage [0-9]|🤖|🔬|🩹|☁️|✅ SLIG|✅ Generated|Voyage|🎨|specialized embedding|understanding embedding|claude_fallback|❌|WARNING|ERROR"
```

---

## 5. The 7 phases

Run them in order. Each phase verifies a specific layer before allowing the next.

### Phase A — Pre-flight (≤ 30 sec)

Confirm the deploy is live and the prompt loader picked up the v2 strict-schema prompt.

```bash
# 1. Service is reachable
curl -s http://localhost:8000/health | jq '.services | {database, storage, anthropic, qwen}'

# 2. The Material Image Analyzer prompt loaded successfully on startup
sudo journalctl -u mivaa-pdf-extractor.service --since "10 minutes ago" \
  | grep -E "Loaded Material Image Analyzer prompt|Loaded classification prompt"
```

Expected: both "Loaded ... prompt from database" lines should be present. If `Material Image Analyzer prompt not found` appears, **stop** — the strict v2 prompt did not seed correctly. Re-run the prompt update SQL.

### Phase B — Single-image smoke test (≤ 60 sec, costs ~$0.0002)

Pick one existing image_id and run it through the `regenerate-image-embeddings` endpoint with `force_regenerate=true`. This validates Bugs 1+2+3 fixes WITHOUT touching a fresh PDF.

```bash
# Get an image_id we can test with
IMAGE_ID=$(curl -s http://localhost:8000/api/rag/documents/jobs?limit=1 \
  | jq -r '.jobs[0].document_id' \
  | xargs -I{} curl -s "http://localhost:8000/api/internal/document/{}/images?limit=1" \
  | jq -r '.images[0].id')

# Force-regenerate that one image
curl -s -X POST http://localhost:8000/api/internal/regenerate-image-embeddings \
  -H "Content-Type: application/json" \
  -d "{
    \"workspace_id\": \"ffafc28b-1b8b-4b0d-b226-9f9a6154004e\",
    \"image_ids\": [\"$IMAGE_ID\"],
    \"force_regenerate\": true
  }" | jq .
```

Then verify against the database (run via `mcp__supabase__execute_sql`):

```sql
-- 1. vision_analysis populated with the new schema
SELECT
  id,
  vision_provider,
  jsonb_object_keys(vision_analysis) AS field
FROM document_images
WHERE id = '<IMAGE_ID>';
```

Expected: `vision_provider` is `'qwen'` or `'claude_fallback'`, and at least 4 of these 12 keys appear: `material_type, material_subtype, color_palette, primary_color_hex, texture, pattern, finish, design_style, applications, physical_properties, quality_assessment, confidence`.

```sql
-- 2. All 6 VECS collections received this image
SELECT
  (SELECT 1 FROM vecs.image_slig_embeddings           WHERE id = '<IMAGE_ID>') AS visual,
  (SELECT 1 FROM vecs.image_color_embeddings          WHERE id = '<IMAGE_ID>') AS color,
  (SELECT 1 FROM vecs.image_texture_embeddings        WHERE id = '<IMAGE_ID>') AS texture,
  (SELECT 1 FROM vecs.image_style_embeddings          WHERE id = '<IMAGE_ID>') AS style,
  (SELECT 1 FROM vecs.image_material_embeddings       WHERE id = '<IMAGE_ID>') AS material,
  (SELECT 1 FROM vecs.image_understanding_embeddings  WHERE id = '<IMAGE_ID>') AS understanding;
```

Expected: all 6 columns return `1`. If any return `NULL`, see the troubleshooting table at §7.

```sql
-- 3. Boolean flags match VECS
SELECT
  has_slig_embedding, has_color_slig, has_texture_slig,
  has_style_slig, has_material_slig, has_understanding_embedding
FROM document_images
WHERE id = '<IMAGE_ID>';
```

Expected: all 6 flags are `true`. If a flag is `false` but the matching VECS row exists, the `_set_image_flag` call inside `vecs_service` failed silently — check logs for `Failed to set has_*` debug lines.

### Phase C — Specialized vector differentiation (≤ 10 sec, no cost)

This is the **Bug 2 regression check**. Before our 2026-04 fix, all 4 specialized vectors (color/texture/style/material) were silent clones of the base visual embedding. After the fix they should be **distinct** text-guided blends.

```sql
WITH t AS (
  SELECT
    (SELECT vec FROM vecs.image_color_embeddings    WHERE id = '<IMAGE_ID>') AS color,
    (SELECT vec FROM vecs.image_texture_embeddings  WHERE id = '<IMAGE_ID>') AS texture,
    (SELECT vec FROM vecs.image_style_embeddings    WHERE id = '<IMAGE_ID>') AS style,
    (SELECT vec FROM vecs.image_material_embeddings WHERE id = '<IMAGE_ID>') AS material
)
SELECT
  (color    <=> texture)::float  AS d_color_texture,
  (color    <=> style)::float    AS d_color_style,
  (color    <=> material)::float AS d_color_material,
  (texture  <=> style)::float    AS d_texture_style,
  (texture  <=> material)::float AS d_texture_material,
  (style    <=> material)::float AS d_style_material
FROM t;
```

**Expected**: all 6 distances are **> 0** (typically 0.05–0.40 — text-guided blends share most of the base visual signal but lean toward their aspect direction).
**Failure mode**: any distance == `0.0` means the silent fallback bug is back. Stop, do not proceed.

### Phase D — Single-document backfill via the new UI button (≤ 5 min)

Validates the new `Fill Images` button in `AsyncJobQueueMonitor.tsx`, the per-image progress events, and the full backfill flow on existing data.

1. Open `/admin/async-job-queue-monitor` in a browser.
2. Pick **one** of the 9 existing documents (the ones with only `visual_768` populated).
3. Click **Fill Images**.
4. **Watch the UI**: the progress bar should advance smoothly with the per-image step labels:

   ```
   Stage 3: Processing images for {document} (12/50) — v:12 c:12 t:12 s:11 m:12 u:12
   ```

   The letters mean visual / color / texture / style / material / understanding counts. They should **increase together** image by image. If `u:` lags significantly behind the others, Qwen is failing on those images and falling back to Claude (acceptable). If `c:` / `t:` / `s:` / `m:` lag, the SLIG specialized path is broken (NOT acceptable — see Phase C).

5. After completion, the toast should show: `N images processed, M vectors written` (M ≈ 6 × N).
6. Re-run **Phase B** for any 1 image from this document. All 6 VECS collections must now be populated.
7. Verify counts at the document level:

   ```sql
   SELECT
     SUM(CASE WHEN has_slig_embedding         THEN 1 ELSE 0 END) AS visual,
     SUM(CASE WHEN has_color_slig             THEN 1 ELSE 0 END) AS color,
     SUM(CASE WHEN has_texture_slig           THEN 1 ELSE 0 END) AS texture,
     SUM(CASE WHEN has_style_slig             THEN 1 ELSE 0 END) AS style,
     SUM(CASE WHEN has_material_slig          THEN 1 ELSE 0 END) AS material,
     SUM(CASE WHEN has_understanding_embedding THEN 1 ELSE 0 END) AS understanding,
     COUNT(DISTINCT vision_provider)          AS distinct_providers,
     COUNT(*)                                 AS total_images
   FROM document_images
   WHERE document_id = '<DOCUMENT_ID>';
   ```

   Expected: `visual`, `color`, `texture`, `style`, `material` should all equal `total_images` (or come very close). `understanding` should be ≈ `total_images` minus a small number if any analysis attempts failed entirely. `distinct_providers` should be `1` (qwen) or `2` (qwen + claude_fallback).

### Phase E — Fresh PDF, full pipeline (≤ 10 min, the main test)

This is the canonical end-to-end test. It exercises every stage from upload through to product creation and entity linking.

```bash
ssh into the server, then:
cd /var/www/mivaa-pdf-extractor
./test_full_workflow.sh --test
```

In a second SSH session, tail the structured log markers:

```bash
sudo journalctl -u mivaa-pdf-extractor.service -f \
  | grep -E "Stage [0-9]|🤖|🔬|🩹|☁️|✅ SLIG|✅ Generated|Voyage|🎨|specialized embedding|understanding embedding|claude_fallback|❌|WARNING|ERROR|Discovery|product"
```

Hard checkpoints:

| Checkpoint | What you should see | If missing |
|---|---|---|
| **Stage 0 — discovery** | `"Stage 0: Discovery"` followed by `"discovered 11 products"` | If count != 11, **cancel the job** and stop. Discovery prompt or model output changed unexpectedly. |
| **Test mode gate** | `"🧪 TEST MODE: Processing first product only"` | If "processing product 2/11" shows up, cancel — test_single_product is not honored. |
| **Stage 1 — extraction** | `"YOLO ..."`, `product_layout_regions` rows being inserted | If no YOLO logs, the YOLO endpoint is paused. |
| **Stage 2 — chunking** | `"chunks_created: N"`, then `"Voyage ... text embedding"` per chunk | If chunks but no Voyage text-embed calls, Voyage is misconfigured. |
| **Stage 3 — image classification** | `"🤖 Starting AI-based image classification"`, then per-image classification results | If no Qwen calls, Qwen endpoint is paused or auth is wrong. |
| **Stage 3 — material analysis** | per material image: `"🔬 ... vision_analysis valid for ... (qwen)"` (or `(claude_fallback)`) | If `"failed"` for >50% of images, analyzer prompt or endpoint is broken. |
| **Stage 3 — visual SLIG** | per material image: `"✅ SLIG image embedding: 768D"`, then `"Saved visual embedding to VECS"` | If absent, SLIG endpoint is paused. |
| **Stage 3 — specialized SLIG** | per material image: `"✅ Generated color specialized embedding"`, ×4 (color/texture/style/material) | If only 1 of 4 appears or values look identical, silent fallback bug regression — stop. |
| **Stage 3 — understanding** | per material image: `"Understanding embedding generated (1024D)"` | If absent for images that DID get vision_analysis, Voyage understanding call is broken. |
| **Per-image progress events** | `tracker` updates with the per-vector tally `v:12 c:12 t:12 s:11 m:12 u:12` | Visible in `/admin/async-job-queue-monitor` UI for the running job. |
| **Stage 4 — products** | `"Voyage text embedding"` × 1 (the test product), `INSERT INTO products`, `text_embedding_1024` non-null | If the embedding is null, Voyage call failed silently. |
| **Entity linking** | `"Created N chunk-image relationship entries"`, `"Created N chunk-product relationship entries"`, `"image_product_associations"` rows inserted | If `chunk_image_relationships` count is 0, `entity_linking_service.link_images_to_chunks` did not run for this document. |

When the script reports completion, run the final verification block (see §6).

### Phase F — Combined "Fill All Embeddings" sanity check (≤ 5 min)

Validates the new combined UI button that runs text + image regen back-to-back.

1. Pick a document where you intentionally know there are missing chunks AND incomplete image vectors. (You can construct this by uploading a fresh small PDF, then immediately deleting one chunk's `text_embedding` value and one image's `has_color_slig` flag via SQL.)
2. Open `/admin/async-job-queue-monitor`, select that document.
3. Click **Fill All Embeddings**.
4. The toast should show both halves:
   ```
   Fill complete: N text • M images / K vectors
   ```
   Or, if one half failed:
   ```
   Partial fill: N text • images failed: <reason>
   ```
5. Re-run the document-level query from Phase D step 7 — all 6 columns should now equal total_images.

### Phase G — Final results report → `final-result.html`

The test is **only** declared successful when this file exists with all sections filled. Generate it from the verification queries.

```bash
# After Phase E completes successfully, on the server:
JOB_ID="<job_id_from_phase_E>"
DOC_ID="<document_id_from_phase_E>"
WORKSPACE_ID="ffafc28b-1b8b-4b0d-b226-9f9a6154004e"

# Build the report
{
  echo "<html><head><title>Test Run — $JOB_ID</title>"
  echo "<style>body{font-family:system-ui;padding:24px;max-width:900px}"
  echo "table{border-collapse:collapse;width:100%;margin:8px 0}"
  echo "td,th{border:1px solid #ccc;padding:6px 12px;text-align:left}"
  echo "th{background:#f3f3f3}"
  echo ".ok{color:#0a0}.fail{color:#a00}</style></head><body>"
  echo "<h1>MIVAA Test Run Report</h1>"
  echo "<p>Job: <code>$JOB_ID</code> &middot; Document: <code>$DOC_ID</code> &middot; $(date)</p>"

  # Job summary
  echo "<h2>Job summary</h2><pre>"
  curl -s "http://localhost:8000/api/rag/documents/job/$JOB_ID" \
    | jq '{ status, progress, current_stage, started_at, completed_at, result }'
  echo "</pre>"

  # The stats blocks — use psql or the supabase REST API to fetch counts.
  # See the SQL queries in §6 below — wrap each in `<h2>...</h2><pre>...</pre>`.
  echo "<h2>Embedding coverage</h2><pre>"
  # paste the per-vector count query from §6
  echo "</pre>"

  echo "<h2>Vision analysis provenance</h2><pre>"
  # paste the vision_provider query from §6
  echo "</pre>"

  echo "<h2>Relationships</h2><pre>"
  # paste the relationship counts query from §6
  echo "</pre>"

  echo "<h2>Differentiation check</h2><pre>"
  # paste the cosine-distance query from Phase C, against one image_id
  echo "</pre>"

  echo "<h2>Failures (if any)</h2><pre>"
  curl -s "http://localhost:8000/api/rag/documents/job/$JOB_ID" \
    | jq '.result.failed_images // []'
  echo "</pre>"

  echo "</body></html>"
} > /tmp/final-result.html

cat /tmp/final-result.html
```

If `final-result.html` cannot be generated (because some data is missing), **do not declare the test successful**. Stop, fix the gap, restart the relevant phase.

---

## 6. Verification SQL block (run after Phase E)

Substitute `<DOC_ID>` with the test document's UUID before running. All queries should return data — empty results indicate a gap.

```sql
-- A. Per-vector embedding counts for the test document
SELECT
  COUNT(*)                                          AS total_images,
  SUM(CASE WHEN has_slig_embedding         THEN 1 ELSE 0 END) AS visual,
  SUM(CASE WHEN has_color_slig             THEN 1 ELSE 0 END) AS color,
  SUM(CASE WHEN has_texture_slig           THEN 1 ELSE 0 END) AS texture,
  SUM(CASE WHEN has_style_slig             THEN 1 ELSE 0 END) AS style,
  SUM(CASE WHEN has_material_slig          THEN 1 ELSE 0 END) AS material,
  SUM(CASE WHEN has_understanding_embedding THEN 1 ELSE 0 END) AS understanding
FROM document_images
WHERE document_id = '<DOC_ID>';
-- Expected: all six counts equal total_images (understanding may be slightly lower
-- if Qwen+Claude both failed on a few images — log reasons in failed list).

-- B. Vision analysis provenance breakdown
SELECT
  vision_provider,
  COUNT(*) AS images
FROM document_images
WHERE document_id = '<DOC_ID>' AND vision_analysis IS NOT NULL
GROUP BY vision_provider;
-- Expected: a row for 'qwen' (most images) and possibly a row for 'claude_fallback'
-- (a small number — that's the safety net working). 'failed' should NOT appear here
-- because failed analyses don't write vision_analysis.

-- C. Relationships
SELECT
  (SELECT COUNT(*) FROM document_chunks         WHERE document_id = '<DOC_ID>') AS chunks,
  (SELECT COUNT(*) FROM document_chunks         WHERE document_id = '<DOC_ID>' AND text_embedding IS NOT NULL) AS chunks_with_text_embedding,
  (SELECT COUNT(*) FROM document_images         WHERE document_id = '<DOC_ID>') AS images,
  (SELECT COUNT(*) FROM products                WHERE source_document_id = '<DOC_ID>') AS products,
  (SELECT COUNT(*) FROM products                WHERE source_document_id = '<DOC_ID>' AND text_embedding_1024 IS NOT NULL) AS products_with_embedding,
  (SELECT COUNT(*) FROM chunk_product_relationships    cpr JOIN document_chunks dc ON dc.id = cpr.chunk_id WHERE dc.document_id = '<DOC_ID>') AS chunk_product_links,
  (SELECT COUNT(*) FROM chunk_image_relationships      cir JOIN document_chunks dc ON dc.id = cir.chunk_id WHERE dc.document_id = '<DOC_ID>') AS chunk_image_links,
  (SELECT COUNT(*) FROM image_product_associations     ipa JOIN document_images di ON di.id = ipa.image_id WHERE di.document_id = '<DOC_ID>') AS image_product_assocs;
-- Expected: chunks_with_text_embedding = chunks, products_with_embedding = products,
-- chunk_image_links > 0 (page proximity), image_product_assocs > 0.

-- D. Visual metadata extracted from embeddings (Stage 3.5)
SELECT
  COUNT(*) FILTER (WHERE visual_metadata IS NOT NULL AND visual_metadata != '{}'::jsonb) AS images_with_visual_metadata,
  COUNT(*) AS total_images
FROM document_images
WHERE document_id = '<DOC_ID>';
-- Expected: images_with_visual_metadata > 0 for material images.

-- E. Per-vector counts in VECS itself (truth source)
SELECT 'image_slig_embeddings'           AS coll, COUNT(*) FROM vecs.image_slig_embeddings           WHERE metadata->>'document_id' = '<DOC_ID>'
UNION ALL SELECT 'image_color_embeddings',          COUNT(*) FROM vecs.image_color_embeddings          WHERE metadata->>'document_id' = '<DOC_ID>'
UNION ALL SELECT 'image_texture_embeddings',        COUNT(*) FROM vecs.image_texture_embeddings        WHERE metadata->>'document_id' = '<DOC_ID>'
UNION ALL SELECT 'image_style_embeddings',          COUNT(*) FROM vecs.image_style_embeddings          WHERE metadata->>'document_id' = '<DOC_ID>'
UNION ALL SELECT 'image_material_embeddings',       COUNT(*) FROM vecs.image_material_embeddings       WHERE metadata->>'document_id' = '<DOC_ID>'
UNION ALL SELECT 'image_understanding_embeddings',  COUNT(*) FROM vecs.image_understanding_embeddings  WHERE metadata->>'document_id' = '<DOC_ID>';
-- Expected: all 6 collection counts match A's per-vector counts. If A says "5 has_color_slig"
-- but vecs.image_color_embeddings has 7 rows for this doc, the boolean flag updater is broken.
-- If A says "5" and VECS has 5, you're golden.

-- F. Sanity: confirm the `vision_analysis` JSON shape matches the v2 strict schema
SELECT
  id,
  vision_provider,
  array_length(array(SELECT jsonb_object_keys(vision_analysis)), 1) AS field_count,
  vision_analysis->>'material_type' AS material_type,
  vision_analysis->'color_palette'  AS colors,
  vision_analysis->>'finish'        AS finish,
  (vision_analysis->>'confidence')::float AS confidence
FROM document_images
WHERE document_id = '<DOC_ID>'
  AND vision_analysis IS NOT NULL
LIMIT 5;
-- Expected: field_count is 8-12 (exact 12 if Qwen returned all keys; lower acceptable
-- if some are null but at least 4 must be populated per validator). material_type
-- and colors should be human-readable for material images.
```

---

## 7. Common failure modes & fixes

| Symptom in logs / DB | Root cause | Fix |
|---|---|---|
| `Material Image Analyzer prompt not found in database` at startup | The v2 prompt update SQL didn't run (or ran in the wrong DB) | Re-run the prompt update SQL via `mcp__supabase__execute_sql` |
| `Failed to resume Qwen endpoint` for every image | HuggingFace endpoint is paused or token expired | Manually wake the endpoint via the registry; re-check `HUGGINGFACE_API_KEY` |
| `vision_analysis valid for ... (claude_fallback)` for >50% of images | Qwen is responding but returning malformed JSON | Tighten the prompt further OR look at the raw Qwen output in `journalctl` and adjust the system prompt |
| All 4 specialized cosine distances == 0.0 (Phase C) | Silent base-embedding fallback regression | Search for `base_image_embedding` in `_generate_specialized_siglip_embeddings` — there should be NO `specialized[type] = base_image_embedding` line anywhere |
| `image_understanding_embeddings` count is 0 but `vision_analysis` is populated | Voyage understanding call is failing silently | Grep for `Understanding embedding generated` and `Failed to generate understanding`; check `VOYAGE_API_KEY` |
| `chunk_image_relationships` is 0 for the new document | `entity_linking_service.link_images_to_chunks` did not run | Verify `process_document_with_discovery` was called and it reached the entity-linking step |
| `has_color_slig=false` but `vecs.image_color_embeddings` has the row | `_set_image_flag('has_color_slig', ...)` failed silently | Look for `Failed to set has_color_slig` debug lines; check that `vecs_service._get_supabase_rest()` succeeded |
| Stage 3 finishes but `images_processed` < material image count | Per-image retries exhausted | Look at `failed_images` array in the job result; each entry has the failure reason |
| Job stuck at the same `progress` for >5 minutes | A long-running stage is silently hung | Tail logs; if no movement, kill the job (`/api/internal/reset-job/{job_id}`) and restart |
| Qwen 503/504 spam | HuggingFace endpoint scaling | Retry helper kicks in automatically; if persistent, scale endpoint replicas up |

---

## 8. After a clean run

1. `final-result.html` exists at `/tmp/final-result.html` and contains all 7 sections from Phase G.
2. The Sentry dashboard shows **zero new issues** for the duration of the test run (the openai RateLimitError filter we added in `main.py` should keep the noise down — if a new issue type appears, investigate).
3. Update the issue tracker with the test run's ✅ result and link the `final-result.html` snapshot.
4. If this test was driven by a deploy candidate, the deploy is now **green** to roll out to non-test mode (`./test_full_workflow.sh` without `--test`) on the full 11-product run.

---

## 9. Quick reference — file locations

| What | Where |
|---|---|
| Test script | `mivaa-pdf-extractor/test_full_workflow.sh` |
| Single-product test python | `mivaa-pdf-extractor/scripts/testing/test_single_product.py` |
| Job logs (live) | `sudo journalctl -u mivaa-pdf-extractor.service -f` |
| Job status JSON dumps | `/tmp/job_<id>_*.json` |
| Product checker | `/tmp/check_products_created.sh` |
| Final report (this run) | `/tmp/final-result.html` |
| Image processing service (where the new pipeline lives) | `mivaa-pdf-extractor/app/services/images/image_processing_service.py` |
| Real embeddings service (specialized SLIG generation) | `mivaa-pdf-extractor/app/services/embeddings/real_embeddings_service.py` |
| VECS service (collection upserts + boolean flag updates) | `mivaa-pdf-extractor/app/services/embeddings/vecs_service.py` |
| Entity linking (page-proximity chunk↔image relationships) | `mivaa-pdf-extractor/app/services/discovery/entity_linking_service.py` |
| Async Job Queue Monitor (admin UI with the new buttons) | `src/components/Admin/AsyncJobQueueMonitor/AsyncJobQueueMonitor.tsx` |
| Internal regenerate endpoint | `mivaa-pdf-extractor/app/api/internal_routes.py` `POST /api/internal/regenerate-image-embeddings` |
