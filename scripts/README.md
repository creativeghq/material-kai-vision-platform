# MIVAA E2E Test — Claude Execution Script

> **You are Claude. This file is a directive, not documentation. When the user asks you to "run scripts/README.md" or "run the E2E test", you execute every step in this file in order, using the exact tool calls specified, and only stop on the gates. You do not improvise. You do not ask the user for clarification on anything that is already specified here. You only stop and report when a hard gate fails.**

---

## 0. WHAT YOU ARE DOING

You are running an end-to-end validation of the post-2026-04 MIVAA pipeline by executing the canonical test script `test_full_workflow.sh` on the production server. The script discovers all products in `harmony-signature-book-24-25.pdf` and processes them end-to-end.

You can run in **one of two modes** — pick exactly one in §2 by setting `RUN_MODE`:

| Mode | `RUN_MODE` value | Script flag | Products processed | Use when |
|---|---|---|---|---|
| **Full** | `full` | (none) | All 11 discovered | Pre-release validation, full regression sweep |
| **Single-product** | `single` | `--test` | Only the first discovered product | Fast validation of a fix (~5–15 min), iterating on a specific bug |

The goal is to prove — across all processed products — every part of the 7-vector pipeline produced data:

- Discovery returns exactly 11 products **regardless of mode** (the gate is on discovery, not processing)
- All `EXPECTED_PRODUCTS_PROCESSED` products are processed (no premature exit)
- Each processed product produces chunks, chunk text embeddings, images, all 6 image embedding vectors per material image, vision_analysis JSON, visual metadata, a products row with text_embedding_1024, and all the relationship rows
- `final-result.html` is written to `/tmp/final-result.html` on the production server with every section populated and zero unmet gates
- Sentry shows zero new issues caused by the run

If you hit a gate failure, you stop the active job, root-cause it using §4 below, fix it, restart from the affected step (NOT the whole script), and re-loop on that step until it passes — within the loop budget in §5.

You manage progress with `TodoWrite` — one todo per Step in §3 below. You mark each one `in_progress` before running it and `completed` only after its gate passes.

---

## 1. PRECONDITIONS — verify these BEFORE starting

You assume all of the following are true. If any is false, **STOP** and report.

| Precondition | How to verify |
|---|---|
| The fix branch is deployed to production (`v1api.materialshub.gr`) | `Bash`: `curl -s https://v1api.materialshub.gr/health \| jq '.services.database.status, .services.storage.status, .services.anthropic.status'` — all must return `"healthy"` |
| The Material Image Analyzer prompt v2 is in the database | `mcp__supabase__execute_sql`: `SELECT version FROM prompts WHERE name = 'Material Image Analyzer' AND is_active = true;` — must return `version >= 2` |
| You have ssh-mcp access to the production server | `mcp__ssh-mcp__exec`: `whoami && hostname && systemctl is-active mivaa-pdf-extractor.service` — must return `active` |
| `test_full_workflow.sh` exists on the server | `mcp__ssh-mcp__exec`: `ls -la /var/www/mivaa-pdf-extractor/test_full_workflow.sh` — file must exist and be executable |
| You have `mcp__supabase__execute_sql` and `mcp__sentry__list_issues` available | Tool list at the top of your context |

If any precondition fails, **report the failure and stop**. Do not attempt to deploy, fix, or work around it.

---

## 2. CONSTANTS

Use these literal values throughout. Do not invent or substitute.

**Pick the run mode FIRST.** Set `RUN_MODE` to either `full` or `single`, then read the matching column in the table below. Every gate, expected count, command and timeout in this directive references one of these values.

```
RUN_MODE                      = single              # ← change this. valid: full | single
WORKSPACE_ID                  = ffafc28b-1b8b-4b0d-b226-9f9a6154004e
PDF_NAME                      = harmony-signature-book-24-25.pdf
EXPECTED_PRODUCTS_DISCOVERED  = 11                   # ALWAYS 11 — discovery runs identically in both modes
SCRIPT_PATH                   = /var/www/mivaa-pdf-extractor/test_full_workflow.sh
SERVICE_NAME                  = mivaa-pdf-extractor.service
TEST_RUN_LOG                  = /tmp/test_run.log
FINAL_REPORT                  = /tmp/final-result.html
PRODUCTION_API                = https://v1api.materialshub.gr
LOCAL_API_ON_SERVER           = http://localhost:8000
LOG_TAIL_FILTER               = "Stage [0-9]|🤖|🔬|🩹|☁️|✅ SLIG|✅ Generated|Voyage|🎨|specialized embedding|understanding embedding|claude_fallback|❌|WARNING|ERROR|Discovery|product|chunk_image_relationship|image_product_association"
POLL_INTERVAL_SEC             = 30
```

**Mode-dependent values** — read the column matching your chosen `RUN_MODE`:

| Variable | `full` | `single` |
|---|---|---|
| `SCRIPT_FLAGS` | *(empty — no flag)* | `--test` |
| `EXPECTED_PRODUCTS_PROCESSED` | `11` | `1` |
| `STALL_DETECTION_POLLS` | `6` (3 min — full mode is slower per stage) | `4` (2 min — only one product, faster cadence) |
| `HARD_TIMEOUT_MINUTES` | `180` (3 h budget for all 11 products) | `30` (single product run is typically 5–15 min) |
| `TEST_MODE_LOG_LINE_EXPECTED` | `🧪 TEST MODE` MUST NOT appear | `🧪 TEST MODE: Processing first product only` MUST appear exactly once |
| Soft-pass threshold for Gate 6.C `products` | `>= 10` (allow 1 of 11 to fail) | `== 1` (no slack — there's only one product) |

You will discover and capture these during the run:

```
JOB_ID                  # set in Step 4 from /tmp/test_run.log
DOCUMENT_ID             # set in Step 4 from /api/rag/documents/job/{JOB_ID}
PRODUCT_ID              # set in Step 6 — the FIRST product (used as the differentiation-check anchor)
TEST_DOC_FIRST_IMAGE_ID # set in Step 6 — first material image of the document
BASELINE_SENTRY_ISSUES  # set in Step 2
```

---

## 3. STEPS — execute in order, do not skip

**Create a TodoWrite at the start with one entry per step (Steps 1–9 below). Mark each `in_progress` when you start it and `completed` only when its gate passes.**

### STEP 1 — Pre-flight: deploy live & prompt loaded

```
Bash: curl -s https://v1api.materialshub.gr/health | jq '.services | {database, storage, anthropic}'
```

**Gate 1.1**: `database.status`, `storage.status`, `anthropic.status` all `"healthy"`. Anthropic is the only vision provider, so an unhealthy `anthropic` is a hard stop.

```
mcp__ssh-mcp__exec: sudo journalctl -u mivaa-pdf-extractor.service --since "15 minutes ago" | grep -E "Loaded Material Image Analyzer prompt|Loaded classification prompt" | tail -5
```

**Gate 1.2**: both `Loaded Material Image Analyzer prompt from database` AND `Loaded classification prompt from database` lines must appear. If `Material Image Analyzer prompt not found` appears anywhere, **STOP** — the v2 prompt did not seed correctly. Report the gate failure with the journalctl line as evidence.

```
mcp__supabase__execute_sql: SELECT version, updated_at FROM prompts WHERE name = 'Material Image Analyzer' AND is_active = true;
```

**Gate 1.3**: `version >= 2`. If 1, the v2 prompt update did not run. **STOP** and report.

### STEP 2 — Sentry baseline

Capture the current Sentry issue list BEFORE starting the run so you can detect new errors caused by the test.

```
mcp__sentry__list_issues:
  query = "is:unresolved firstSeen:-1h"
  sort = "date"
  limit = 50
```

Save the resulting issue IDs to a list called `BASELINE_SENTRY_ISSUES`. You will compare against this in Step 8.

### STEP 3 — Refuse to run if a duplicate job exists

```
Bash: curl -s "https://v1api.materialshub.gr/api/rag/documents/jobs?limit=20" | jq -r '.jobs[] | select(.filename == "harmony-signature-book-24-25.pdf" and (.status == "processing" or .status == "pending")) | .id'
```

**Gate 3.1**: must return empty (no output). If a job is already running for the same PDF, do NOT start a duplicate. Cancel it via:

```
Bash: curl -s -X POST "https://v1api.materialshub.gr/api/internal/reset-job/<existing_job_id>"
```

Then re-run Step 3. If the existing job belongs to another user / wasn't started by you, **STOP** and report — do not cancel work you didn't initiate without authorization.

### STEP 4 — Launch `test_full_workflow.sh` (mode-dependent flag)

You launch the script in the background on the production server so you can poll status while it runs. The script handles the upload, dedupe, monitoring, and `verify_results` itself — your job is to monitor it and validate against stricter gates than the script's own checks.

The launch command depends on `RUN_MODE` (set in §2). Use the matching line:

```
# RUN_MODE = full   — process all 11 discovered products
mcp__ssh-mcp__exec: cd /var/www/mivaa-pdf-extractor && rm -f /tmp/test_run.log && nohup ./test_full_workflow.sh > /tmp/test_run.log 2>&1 & echo "PID=$!"

# RUN_MODE = single — process only the first discovered product (~5–15 min)
mcp__ssh-mcp__exec: cd /var/www/mivaa-pdf-extractor && rm -f /tmp/test_run.log && nohup ./test_full_workflow.sh --test > /tmp/test_run.log 2>&1 & echo "PID=$!"
```

The script also accepts `--test-mode` as an alias for `--test` and prints help via `--help`. Do NOT add any other flags — the script does not accept them and bash will silently ignore them while still defaulting to full mode.

**Gate 4.0**: shell returned a PID. The script is now running in the background.

Wait 20 seconds for the upload to register and the script to print the job ID:

```
Bash: sleep 20
mcp__ssh-mcp__exec: grep "Job ID:" /tmp/test_run.log | tail -1
```

Capture the UUID after `Job ID:` → `JOB_ID`. **Gate 4.1**: a UUID was captured. If not:

```
mcp__ssh-mcp__exec: tail -100 /tmp/test_run.log
```

Diagnose from the log output, fix the cause (likely health check failure or duplicate-job blocker), and re-run Step 4. After 2 retries, **STOP** and report.

```
Bash: curl -s "https://v1api.materialshub.gr/api/rag/documents/job/<JOB_ID>" | jq '{id, status, document_id, current_stage}'
```

Capture `document_id` → `DOCUMENT_ID`. **Gate 4.2**: `status` is one of `pending`, `processing`, or `initialized`.

### STEP 5 — Monitor stage by stage

Poll every `POLL_INTERVAL_SEC` (30 s) until the script reports completion. Update the in-progress todo's `activeForm` with the current stage name on every poll so the user sees movement.

**Per poll, you do all 3 of these:**

```
Bash: curl -s "https://v1api.materialshub.gr/api/rag/documents/job/<JOB_ID>" \
  | jq '{status, progress, current_stage, current_step: .metadata.current_step, error_message}'
```

```
mcp__ssh-mcp__exec: tail -30 /tmp/test_run.log
```

```
mcp__ssh-mcp__exec: sudo journalctl -u mivaa-pdf-extractor.service --since "90 seconds ago" | grep -E "Stage [0-9]|🤖|🔬|🩹|☁️|✅ SLIG|✅ Generated|Voyage|specialized embedding|understanding embedding|claude_fallback|❌|WARNING|ERROR|discovered|product" | tail -40
```

**Stall detection**: track the value of `progress` across consecutive polls. If `progress` does not change for `STALL_DETECTION_POLLS` consecutive polls (full: 6 polls / 3 min — single: 4 polls / 2 min — see §2), assume the stage is stuck. Look up "stuck job" in §4 and apply its remedy. Note: `full` runs spend longer in Stage 3 per product (image classification + 6 embeddings × N material images) so single-poll silence is normal in both modes — only flag once you cross the threshold for your `RUN_MODE`.

**Hard timeout**: `HARD_TIMEOUT_MINUTES` total wall-clock from the moment Step 4 launched (180 min for `full`, 30 min for `single` — see §2). If exceeded, POST `/api/internal/reset-job/<JOB_ID>` and **STOP** with `❌ E2E TEST BLOCKED — TIMEOUT`.

**Per-stage gates** — verify each as it appears in the logs. As soon as a gate fails, run the matching §4 lookup and either fix-and-retry the affected step (within loop budget) or stop the job and re-run from Step 4:

| # | Stage | Gate (must see in logs OR DB) | Fail action |
|---|---|---|---|
| 5.1 | **Stage 0 — Discovery** | `discovered 11 products` (or equivalent count = 11) appears in journalctl — **independent of `RUN_MODE`**, discovery always runs over the full PDF | If count != 11, immediately POST `/api/internal/reset-job/<JOB_ID>`. **STOP** and report — discovery prompt or model output changed unexpectedly. |
| 5.2 | **Mode gate** (matches `RUN_MODE` in §2) | If `RUN_MODE = full`: `🧪 TEST MODE` MUST NOT appear; expect per-product progress for all 11 (e.g. `processing product 1/11`, ... `11/11`). If `RUN_MODE = single`: `🧪 TEST MODE: Processing first product only` MUST appear exactly once before Stage 1 starts. | Mismatch means the script was launched with the wrong flag. Reset the job via `/api/internal/reset-job/<JOB_ID>` and re-run Step 4 with the correct flag for your declared `RUN_MODE`. |
| 5.3 | **Stage 1 — Layout extraction** | `YOLO` log lines appear OR `product_layout_regions` rows are written | If neither appears within 3 min, look up "YOLO endpoint paused" in §4. |
| 5.4 | **Stage 2 — Chunking** | `chunks_created: N` (with N > 0) appears AND followed by `voyage-4` text-embedding calls per chunk | If chunks but no Voyage calls, look up "Voyage misconfigured" in §4. |
| 5.5 | **Stage 3 — Image classification** | `🤖 Starting AI-based image classification` appears AND per-image classification results follow | If no classification results within 3 min, look up "Vision calls stalled" in §4. |
| 5.6 | **Stage 3 — Material analysis (vision_analysis)** | per material image: `🔬 ... vision_analysis valid for ... (claude)` OR `... (claude_fallback)` | If `failed` provenance for >50% of images, look up "Vision analysis failing" in §4. |
| 5.7 | **Stage 3 — Visual SLIG embedding** | per material image: `✅ SLIG image embedding: 768D` AND `Saved visual embedding to VECS` | If absent, look up "SLIG endpoint paused" in §4. |
| 5.8 | **Stage 3 — Specialized SLIG (color/texture/style/material)** | per material image: 4 lines of `✅ Generated color specialized embedding (768D, similarity=...)` — one each for color, texture, style, material | If only 1 of 4 appears, **STOP** the entire run — silent-fallback bug regression. Report immediately, do NOT proceed. Re-verify in Step 6 before continuing. |
| 5.9 | **Stage 3 — Understanding embedding** | per material image with vision_analysis: `✅ Understanding embedding generated (1024D)` | If absent, look up "Voyage understanding broken" in §4. |
| 5.10 | **Per-image progress events** | `current_step` from job metadata polling shows `v:N c:N t:N s:N m:N u:N` tally and these counts increase together | If no per-image progress events, the `tracker` parameter wasn't threaded — confirm Step 1.2 prompt-load output and check that `product_processor.py` is passing `tracker=tracker` into `process_product_images`. |
| 5.11 | **Stage 4 — Product creation** | `INSERT INTO products` runs `EXPECTED_PRODUCTS_PROCESSED` times (11 in `full`, 1 in `single`) AND every inserted row has non-null `text_embedding_1024` | If any row's embedding is null, Voyage call failed silently for that product. Check journalctl for `voyage` errors. Backfill via `/api/internal/regenerate-text-embeddings` after fixing. |
| 5.12 | **Entity linking** | `Created N chunk-image relationship entries` AND `image_product_associations` rows are inserted | If `chunk_image_relationships` is 0 for the new doc, `entity_linking_service.link_images_to_chunks` did not run. Look up in §4. |
| 5.13 | **Stage 3 — Icon extraction** | Per icon candidate: `🔖 Icon {id} (page N): extracted N spec items (slip_resistance, fire_rating, ...)`. The icon split log line `🔖 Icon split: N regular material, N icon candidates ...` appears once per Stage 3. | If `icon_candidates_processed > 0` but `icon_metadata_extracted == 0`, the OCR or Claude call is failing on every icon — look up "icon extraction failed" in §4. If NO icon split log line appears AT ALL, the detection rules (size + grid) didn't fire — that's NOT a failure on its own (the test PDF may legitimately have no spec icons), but expect at least 1 icon batch on a typical ceramic catalog. |
| 5.14 | **Job completion** | `status == "completed"` AND `progress == 100`. The script also writes `/tmp/job_<JOB_ID>_final.json` on success. | If `status == "failed"`, look up the error message in §4 and re-run the affected step. |

**Gate 5.final**: `status == "completed"` AND `progress == 100` AND `/tmp/job_<JOB_ID>_final.json` exists.

**Capture for the final report**: from the script's run, save the Stage 3 summary lines across all products:
```
mcp__ssh-mcp__exec: grep -E "Vectors per type|Vision analysis: claude|Icons: extracted" /tmp/test_run.log | tail -40
```
You'll paste these into the final-result.html in Step 7.

### STEP 6 — Verification SQL block

After Step 5 reports completion, run all verification queries against the document. Substitute `<DOC_ID>` with `DOCUMENT_ID`. Capture each result.

#### Query A — Per-vector embedding counts for the document

```
mcp__supabase__execute_sql:
  -- Note: post-2026-05-04 the four `has_*_slig` flag names are retained for
  -- cross-stack stability but they now flag aspect-collection presence
  -- regardless of which model produced the vector (Voyage 1024D for v2 rows,
  -- legacy SLIG 768D for pre-v2 rows). To distinguish, also query the
  -- provenance columns: `<aspect>_aspect_embedding_model` and
  -- `<aspect>_aspect_schema_version`.
  SELECT
    COUNT(*)                                                      AS total_images,
    SUM(CASE WHEN has_slig_embedding         THEN 1 ELSE 0 END)   AS visual,
    SUM(CASE WHEN has_color_slig             THEN 1 ELSE 0 END)   AS color,
    SUM(CASE WHEN has_texture_slig           THEN 1 ELSE 0 END)   AS texture,
    SUM(CASE WHEN has_style_slig             THEN 1 ELSE 0 END)   AS style,
    SUM(CASE WHEN has_material_slig          THEN 1 ELSE 0 END)   AS material,
    SUM(CASE WHEN has_understanding_embedding THEN 1 ELSE 0 END)  AS understanding,
    -- v2 lineage: rows with Voyage-produced aspect vectors (post-2026-05-04)
    SUM(CASE WHEN color_aspect_embedding_model    LIKE 'voyage%' THEN 1 ELSE 0 END) AS color_v2,
    SUM(CASE WHEN texture_aspect_embedding_model  LIKE 'voyage%' THEN 1 ELSE 0 END) AS texture_v2,
    SUM(CASE WHEN style_aspect_embedding_model    LIKE 'voyage%' THEN 1 ELSE 0 END) AS style_v2,
    SUM(CASE WHEN material_aspect_embedding_model LIKE 'voyage%' THEN 1 ELSE 0 END) AS material_v2
  FROM document_images
  WHERE document_id = '<DOCUMENT_ID>';
```

**Gate 6.A**: `visual`, `color`, `texture`, `style`, `material` ALL equal `total_images`. `understanding >= floor(total_images * 0.9)` (allow 10% vision failure — that's the design tolerance).

#### Query B — Vision analysis provenance

```
mcp__supabase__execute_sql:
  SELECT vision_provider, COUNT(*) AS images
  FROM document_images
  WHERE document_id = '<DOCUMENT_ID>' AND vision_analysis IS NOT NULL
  GROUP BY vision_provider;
```

**Gate 6.B**: at least one row exists with `vision_provider IN ('claude', 'claude_fallback')` — the only two values the `check_vision_provider_values` CHECK permits. `failed` should NOT appear (failed analyses don't write `vision_analysis`).

#### Query C — Relationships and product count

```
mcp__supabase__execute_sql:
  SELECT
    (SELECT COUNT(*) FROM document_chunks      WHERE document_id = '<DOCUMENT_ID>') AS chunks,
    (SELECT COUNT(*) FROM document_chunks      WHERE document_id = '<DOCUMENT_ID>' AND text_embedding IS NOT NULL) AS chunks_with_text_embedding,
    (SELECT COUNT(*) FROM document_images      WHERE document_id = '<DOCUMENT_ID>') AS images,
    (SELECT COUNT(*) FROM products             WHERE source_document_id = '<DOCUMENT_ID>') AS products,
    (SELECT COUNT(*) FROM products             WHERE source_document_id = '<DOCUMENT_ID>' AND text_embedding_1024 IS NOT NULL) AS products_with_embedding,
    (SELECT COUNT(*) FROM chunk_product_relationships  cpr JOIN document_chunks dc ON dc.id = cpr.chunk_id WHERE dc.document_id = '<DOCUMENT_ID>') AS chunk_product_links,
    (SELECT COUNT(*) FROM chunk_image_relationships    cir JOIN document_chunks dc ON dc.id = cir.chunk_id WHERE dc.document_id = '<DOCUMENT_ID>') AS chunk_image_links,
    (SELECT COUNT(*) FROM image_product_associations   ipa JOIN document_images di ON di.id = ipa.image_id WHERE di.document_id = '<DOCUMENT_ID>') AS image_product_assocs;
```

**Gate 6.C** (the most important gate of the entire run):
- `chunks_with_text_embedding == chunks`
- `products == EXPECTED_PRODUCTS_PROCESSED` (11 in `full`, 1 in `single`)
- `products_with_embedding == products` (every created product must have a Voyage text embedding)
- `chunk_image_links > 0` (page proximity grounding worked)
- `image_product_assocs > 0` (product↔image association worked)
- `chunk_product_links > 0`

If `products < EXPECTED_PRODUCTS_PROCESSED`, inspect `result.failed_products` (or journalctl) for the failed product names. Per-product failures usually point to either Stage 3 image-failure cascading or Voyage rate-limiting on Stage 4 — fix the root cause, then backfill via `/api/internal/regenerate-text-embeddings`.

**Soft-pass threshold (mode-dependent — read the table in §2):**
- `RUN_MODE = full`: `products >= 10` (≥ 90% of 11) acceptable as a partial pass, flagged in the report.
- `RUN_MODE = single`: NO soft-pass. `products` must equal `1` exactly — there is only one candidate, so any failure means the single-product check failed entirely.

If `products_with_embedding < products`, the Voyage product embedding call failed silently for some inserted rows — check journalctl for `voyage` errors and backfill before re-running Step 6.

Capture the FIRST product UUID (used as the differentiation-check anchor in Query G — in `single` mode this is also the only product):

```
mcp__supabase__execute_sql:
  SELECT id, name, source_document_id
  FROM products
  WHERE source_document_id = '<DOCUMENT_ID>'
  ORDER BY created_at ASC
  LIMIT 1;
```

Capture `id` → `PRODUCT_ID`. Also capture the full product list for the final report:

```
mcp__supabase__execute_sql:
  SELECT id, name, (text_embedding_1024 IS NOT NULL) AS has_embedding
  FROM products
  WHERE source_document_id = '<DOCUMENT_ID>'
  ORDER BY created_at ASC;
```

#### Query D — Visual metadata (Stage 3.5)

```
mcp__supabase__execute_sql:
  SELECT
    COUNT(*) FILTER (WHERE visual_metadata IS NOT NULL AND visual_metadata != '{}'::jsonb) AS images_with_visual_metadata,
    COUNT(*) AS total_images
  FROM document_images
  WHERE document_id = '<DOCUMENT_ID>';
```

**Gate 6.D**: `images_with_visual_metadata > 0`.

#### Query E — VECS truth source (cross-check against query A)

```
mcp__supabase__execute_sql:
  SELECT 'image_slig_embeddings'           AS coll, COUNT(*) FROM vecs.image_slig_embeddings           WHERE metadata->>'document_id' = '<DOCUMENT_ID>'
  UNION ALL SELECT 'image_color_embeddings',          COUNT(*) FROM vecs.image_color_embeddings          WHERE metadata->>'document_id' = '<DOCUMENT_ID>'
  UNION ALL SELECT 'image_texture_embeddings',        COUNT(*) FROM vecs.image_texture_embeddings        WHERE metadata->>'document_id' = '<DOCUMENT_ID>'
  UNION ALL SELECT 'image_style_embeddings',          COUNT(*) FROM vecs.image_style_embeddings          WHERE metadata->>'document_id' = '<DOCUMENT_ID>'
  UNION ALL SELECT 'image_material_embeddings',       COUNT(*) FROM vecs.image_material_embeddings       WHERE metadata->>'document_id' = '<DOCUMENT_ID>'
  UNION ALL SELECT 'image_understanding_embeddings',  COUNT(*) FROM vecs.image_understanding_embeddings  WHERE metadata->>'document_id' = '<DOCUMENT_ID>';
```

**Gate 6.E**: each collection's count equals the corresponding count in Query A. If query A says `5 has_color_slig` but `vecs.image_color_embeddings` has `7` rows, the boolean flag updater is broken — look up `has_color_slig=false but vecs row exists` in §4.

#### Query F — vision_analysis schema sanity

```
mcp__supabase__execute_sql:
  SELECT
    id,
    vision_provider,
    array_length(array(SELECT jsonb_object_keys(vision_analysis)), 1) AS field_count,
    vision_analysis->>'material_type' AS material_type,
    vision_analysis->'color_palette'  AS colors,
    vision_analysis->>'finish'        AS finish,
    (vision_analysis->>'confidence')::float AS confidence
  FROM document_images
  WHERE document_id = '<DOCUMENT_ID>'
    AND vision_analysis IS NOT NULL
  ORDER BY page_number, id
  LIMIT 5;
```

**Gate 6.F**: every returned row has `field_count >= 4`, `material_type IS NOT NULL`, `confidence > 0`. Capture the first row's `id` → `TEST_DOC_FIRST_IMAGE_ID`.

#### Query G — Specialized vector differentiation (Bug 2 regression check)

This is the **make-or-break** post-run check. If any of the 6 cosine distances is exactly `0.0`, the silent-fallback bug is back and the run is dead.

```
mcp__supabase__execute_sql:
  WITH t AS (
    SELECT
      (SELECT vec FROM vecs.image_color_embeddings    WHERE id = '<TEST_DOC_FIRST_IMAGE_ID>') AS color,
      (SELECT vec FROM vecs.image_texture_embeddings  WHERE id = '<TEST_DOC_FIRST_IMAGE_ID>') AS texture,
      (SELECT vec FROM vecs.image_style_embeddings    WHERE id = '<TEST_DOC_FIRST_IMAGE_ID>') AS style,
      (SELECT vec FROM vecs.image_material_embeddings WHERE id = '<TEST_DOC_FIRST_IMAGE_ID>') AS material
  )
  SELECT
    (color    <=> texture)::float  AS d_color_texture,
    (color    <=> style)::float    AS d_color_style,
    (color    <=> material)::float AS d_color_material,
    (texture  <=> style)::float    AS d_texture_style,
    (texture  <=> material)::float AS d_texture_material,
    (style    <=> material)::float AS d_style_material;
```

**Gate 6.G**: all 6 distances `> 0`. Acceptable range typically 0.005–0.50. If ANY distance is exactly `0.0`, **STOP** the run, report the silent-fallback regression, and do not declare success regardless of any other gate result.

#### Query H — Icon metadata rollup across all products

This validates that icons → flat top-level spec keys flowed end-to-end. If the PDF has any spec icon strips, at least one of these should be populated on at least one product.

```
mcp__supabase__execute_sql:
  SELECT
    p.id,
    p.name,
    p.metadata->>'slip_resistance'    AS slip_resistance,
    p.metadata->>'pei_rating'          AS pei_rating,
    p.metadata->>'fire_rating'         AS fire_rating,
    p.metadata->>'frost_resistance'    AS frost_resistance,
    p.metadata->>'water_absorption'    AS water_absorption,
    p.metadata->>'v_rating'            AS v_rating,
    p.metadata->'certifications'       AS certifications,
    p.metadata->>'chemical_resistance' AS chemical_resistance,
    p.metadata->>'thermal_shock'       AS thermal_shock,
    p.metadata->>'stain_resistance'    AS stain_resistance
  FROM products p
  WHERE p.source_document_id = '<DOCUMENT_ID>';
```

**Gate 6.H** (soft):
- This PDF (`harmony-signature-book-24-25.pdf`) is a ceramic catalog, so spec icons are expected on at least one product. **At least one row** should have at least one non-null spec field.
- If ALL rows show ALL nulls AND `vector_stats.icon_candidates_processed > 0` from Step 5.13, the rollup function silently dropped everything — look up "icon rollup empty" in §4.
- If ALL rows show ALL nulls AND `vector_stats.icon_candidates_processed == 0`, the PDF pages didn't have icons (or detection didn't fire). That's not a failure on its own — note in the report and continue.

#### Query I — Per-image icon_metadata audit trail

```
mcp__supabase__execute_sql:
  SELECT
    di.id,
    di.page_number,
    di.category,
    jsonb_array_length(COALESCE(di.metadata->'icon_metadata', '[]'::jsonb)) AS icon_items,
    di.metadata->'icon_metadata' AS icon_metadata
  FROM document_images di
  WHERE di.document_id = '<DOCUMENT_ID>'
    AND di.metadata ? 'icon_metadata'
  ORDER BY di.page_number, di.id
  LIMIT 30;
```

**Gate 6.I** (soft): if Query H showed populated spec fields on any product, this query MUST return rows showing the source icons that contributed those values. If Query H is populated but Query I is empty, the rollup function is reading from a different source than the icon processor wrote to.

### STEP 7 — Generate `/tmp/final-result.html`

Build the report on the production server with the actual captured data inlined. You will use a heredoc to write the file in one shot, with the SQL results from Step 6 substituted directly into the HTML.

```
mcp__ssh-mcp__exec: bash -lc 'cat > /tmp/final-result.html <<HTMLEOF
<html>
<head>
<title>MIVAA E2E Test Run — <JOB_ID></title>
<style>
body{font-family:system-ui;padding:24px;max-width:1100px;line-height:1.5}
table{border-collapse:collapse;width:100%;margin:8px 0}
td,th{border:1px solid #ccc;padding:6px 12px;text-align:left;vertical-align:top}
th{background:#f3f3f3}
.ok{color:#080;font-weight:bold}
.fail{color:#a00;font-weight:bold}
pre{background:#f7f7f7;padding:12px;border-radius:6px;overflow-x:auto;font-size:12px}
h2{border-bottom:2px solid #ddd;padding-bottom:4px;margin-top:32px}
</style>
</head>
<body>
<h1>MIVAA E2E Test Run Report</h1>
<p>
  <b>Job:</b> <code><JOB_ID></code><br>
  <b>Document:</b> <code><DOCUMENT_ID></code><br>
  <b>First product (anchor for differentiation check):</b> <code><PRODUCT_ID></code><br>
  <b>Generated:</b> $(date -u +"%Y-%m-%dT%H:%M:%SZ")<br>
  <b>Mode:</b> <RUN_MODE> (expected processed: <EXPECTED_PRODUCTS_PROCESSED> of 11 discovered)
</p>

<h2>1. Job summary</h2>
<pre>
$(curl -s http://localhost:8000/api/rag/documents/job/<JOB_ID> | jq "{status, progress, current_stage, started_at, completed_at, result}")
</pre>

<h2>2. Embedding coverage (boolean flags)</h2>
<pre>
<RESULT_QUERY_A>
</pre>

<h2>3. Vision analysis provenance</h2>
<pre>
<RESULT_QUERY_B>
</pre>

<h2>4. Relationships, products and chunks</h2>
<pre>
<RESULT_QUERY_C>
</pre>

<h2>5. Visual metadata (Stage 3.5)</h2>
<pre>
<RESULT_QUERY_D>
</pre>

<h2>6. VECS truth source (cross-check vs §2)</h2>
<pre>
<RESULT_QUERY_E>
</pre>

<h2>7. vision_analysis schema sanity (first 5 images)</h2>
<pre>
<RESULT_QUERY_F>
</pre>

<h2>8. Specialized vector differentiation (Bug 2 regression check)</h2>
<p>For image <code><TEST_DOC_FIRST_IMAGE_ID></code> — all 6 distances must be &gt; 0.</p>
<pre>
<RESULT_QUERY_G>
</pre>

<h2>9. Icon metadata rollup (Query H)</h2>
<p>Flat top-level spec keys for every product in the document, populated by the icon extraction pipeline.</p>
<pre>
<RESULT_QUERY_H>
</pre>

<h2>10. Per-image icon audit trail (Query I, first 30 images)</h2>
<pre>
<RESULT_QUERY_I>
</pre>

<h2>11. Failed images (if any)</h2>
<pre>
$(curl -s http://localhost:8000/api/rag/documents/job/<JOB_ID> | jq ".result.failed_images // []")
</pre>

<h2>12. Sentry deltas during this run</h2>
<pre>
<SENTRY_DELTA_FROM_STEP_8>
</pre>

</body>
</html>
HTMLEOF
ls -la /tmp/final-result.html'
```

When you actually issue this command, you substitute the `<RESULT_QUERY_*>` placeholders with the actual jq-pretty-printed results captured in Step 6. Substitute `<SENTRY_DELTA_FROM_STEP_8>` with the result you'll capture in Step 8.

**Gate 7.1**: `/tmp/final-result.html` exists and is `> 2500` bytes (the icon sections add roughly 500 bytes of structure even when empty).

```
mcp__ssh-mcp__exec: wc -c /tmp/final-result.html
```

### STEP 8 — Sentry delta check

Re-query Sentry for issues that appeared since `BASELINE_SENTRY_ISSUES` was captured.

```
mcp__sentry__list_issues:
  query = "is:unresolved firstSeen:-1h"
  sort = "date"
  limit = 50
```

Diff against `BASELINE_SENTRY_ISSUES`. New issues = issues whose ID is in the new list but NOT in the baseline.

For each new issue, fetch detail:

```
mcp__sentry__get_sentry_resource:
  url = <issue_url>
```

Classify each new issue:
- **Real bug** (mentions our code or producer keys): record in the report and **fail Gate 8.1**
- **Acceptable noise** (e.g., openai RateLimitError that the `before_send` filter should have caught — file a tracking item but pass Gate 8.1)

**Gate 8.1**: zero NEW real-bug issues. Acceptable noise is OK but must be enumerated in section 10 of the report.

After this check, update `/tmp/final-result.html` section 10 with the actual Sentry delta result via:

```
mcp__ssh-mcp__exec: <use sed or cat heredoc to insert the delta into final-result.html>
```

### STEP 9 — Final report to user

Report to the user with this exact structure if every gate passed:

```
✅ E2E TEST PASSED

Mode:                 <RUN_MODE>  (full = all 11 / single = first product only)
Job ID:               <JOB_ID>
Document ID:          <DOCUMENT_ID>
Anchor product ID:    <PRODUCT_ID>  (first product, used for vector differentiation check)
Discovery:            11 / 11 ✓                                  (always 11, mode-independent)
Products processed:   <n_products>/<EXPECTED_PRODUCTS_PROCESSED> (with text_embedding_1024: <n_with_embedding>)
Duration:             <minutes from Step 4 launch to Step 5.final> (budget: <HARD_TIMEOUT_MINUTES> min)
Chunks:               <chunks> (all with text_embedding_1024 ✓)
Material images:      <total_regular_images>
Icon candidates:      <icon_candidates> (extracted: <icon_metadata_extracted>, failed: <icon_extraction_failed>)
Per-vector counts:
  visual SLIG:        <n>/<total_regular_images>
  color SLIG:         <n>/<total_regular_images>
  texture SLIG:       <n>/<total_regular_images>
  style SLIG:         <n>/<total_regular_images>
  material SLIG:      <n>/<total_regular_images>
  understanding 1024: <n>/<total_regular_images>
Vision analysis src:  claude=<n> claude_fallback=<n> (failed=<n>)
Icon spec rollup:     <list of populated spec field names from Query H, e.g. slip_resistance, fire_rating, ...>
Relationships:
  chunk-image:        <n>
  chunk-product:      <n>
  image-product:      <n>
Differentiation:      all 6 distances > 0 (min=<min> max=<max>) ✓
Sentry delta:         <n> new issues (real bugs: 0)
Report:               /tmp/final-result.html (<size> bytes)
```

If any gate failed and could not be recovered after at most 3 fix-and-retry loops on the same step, report this instead:

```
❌ E2E TEST BLOCKED

Failed at:     Step <N> (gate <gate id>)
Symptom:       <one-line description>
Root cause:    <your diagnosis, with file:line citation if applicable>
Logs:          <key journalctl excerpt or DB row>
What I tried:  <ordered list of fix attempts and their results>
Next action:   <what the user needs to decide>
Partial report: /tmp/final-result.html  (if generated)
```

---

## 4. FAILURE LOOKUP TABLE

Use this when a gate fails. Each row tells you the symptom, the root cause, the fix to apply, and which step to re-run after applying the fix.

| Symptom | Root cause | Fix → re-run step |
|---|---|---|
| `Material Image Analyzer prompt not found in database` at startup (Gate 1.2) | v2 prompt not seeded in DB | Run `mcp__supabase__execute_sql` to update the `prompts` row with the v2 strict-schema text. Then `mcp__ssh-mcp__sudo-exec`: `systemctl restart mivaa-pdf-extractor.service`. Wait 30s. Re-run Step 1. |
| **Vision calls stalled** — no classification results for every image (Stage 5.5) | `ANTHROPIC_API_KEY` missing/expired, or Anthropic rate-limiting | Check `/health` → `services.anthropic`. Inspect `ai_usage_logs` for 401/429 rows in the run window. If the key is bad, **STOP** — needs user. |
| **Vision analysis failing** — `claude_fallback` provenance for >50% of images (Gate 5.6) | The first Claude call is erroring or returning an off-schema tool payload; the retry is rescuing it | The retry IS the safety net, so the run can still pass. Note it in the report. 100% `claude_fallback` means the primary call never succeeds — report loudly, but don't fail the run. |
| Step 6.G distance == 0.0 anywhere | Silent base-embedding fallback regression in `_generate_specialized_siglip_embeddings` | `Grep`: search for `specialized\[.*\] = base_image_embedding` in `mivaa-pdf-extractor/app/services/embeddings/real_embeddings_service.py`. If found, the Bug 2 fix was reverted — **STOP** and report to user. Do NOT loop. |
| `image_understanding_embeddings` count is 0 but `vision_analysis` is populated (Gate 6.A understanding=0) | Voyage understanding call failing silently | `mcp__ssh-mcp__exec`: `journalctl -u mivaa-pdf-extractor.service \| grep -E "Failed to generate understanding\|VOYAGE_API_KEY" \| tail -20`. If env var missing, **STOP** — needs user. |
| `chunk_image_relationships` count is 0 for the new doc (Gate 6.C `chunk_image_links == 0`) | `entity_linking_service.link_images_to_chunks` did not run | `mcp__ssh-mcp__exec`: `journalctl -u mivaa-pdf-extractor.service \| grep -E "Created.*chunk-image relationship\|link_images_to_chunks"`. If absent, the orchestration call was skipped. Read `mivaa-pdf-extractor/app/api/pdf_processing/product_processor.py` and trace why. |
| `has_color_slig=false` but `vecs.image_color_embeddings` row exists (Gate 6.E mismatch) | `_set_image_flag` failed silently | `mcp__ssh-mcp__exec`: `journalctl -u mivaa-pdf-extractor.service \| grep -E "Failed to set has_" \| tail -10`. Likely a Supabase REST client init issue. `mcp__ssh-mcp__sudo-exec`: `systemctl restart mivaa-pdf-extractor.service`. Re-run from Step 4. |
| Step 5 `progress` stuck for 3 consecutive polls (90 s) — "stuck job" | A long-running stage is hung | `mcp__ssh-mcp__exec`: `journalctl -u mivaa-pdf-extractor.service --since "3 minutes ago" \| tail -100`. Look for the last log line. If a specific endpoint is unresponsive, that's the suspect. POST `/api/internal/reset-job/<JOB_ID>`, fix the upstream cause, re-run Step 4. |
| Modal 503/504 spam in Step 5 logs | SLIG / PaddleOCR endpoint cold-starting from scale-to-zero | The retry helper handles this automatically. Wait 60s and re-poll. If it persists past 5 min, **STOP** and report. |
| Step 4 — `Job ID:` line not present in `/tmp/test_run.log` | Upload failed before producing a job | `mcp__ssh-mcp__exec`: `tail -100 /tmp/test_run.log`. Common causes: PDF URL unreachable, dedupe blocked because a stale `processing` job exists, health check failed. If dedupe, run reset on the stale job and re-run Step 4. |
| Gate 5.1 — discovery returns count != 11 | Discovery prompt or model output drift | **STOP** the job immediately via `/api/internal/reset-job`. Report — this is a hard precondition violation and needs user investigation. |
| Gate 5.2 — `🧪 TEST MODE` log line appears | Script was launched with `--test` by mistake | **STOP** the job via reset-job. Re-run Step 4 ensuring NO flag is passed (`./test_full_workflow.sh` only). |
| Gate 6.C — `products` count == 0 | Stage 4 product creation failed for every product | Look for `Stage 4` errors in journalctl. If Voyage product embedding failed across the board, suspect `VOYAGE_API_KEY` missing/expired. Look up "Voyage misconfigured" symptom. |
| Gate 6.C — `products` count < `EXPECTED_PRODUCTS_PROCESSED` (partial) | Some product(s) failed mid-Stage 3 or Stage 4 | Inspect `result.failed_products` (or per-product log groups in journalctl). For each failure, look up its specific symptom in this table. After fixing, backfill via `/api/internal/regenerate-text-embeddings` (text) or `/api/internal/regenerate-image-embeddings` (visual). Re-run Step 6.C. Soft-pass per §2: `RUN_MODE=full` accepts `>= 10/11`; `RUN_MODE=single` requires `1/1` exactly (the single product IS the test). |
| Gate 6.C — `products_with_embedding < products` | Voyage product embedding call failed silently for some inserted rows | `mcp__ssh-mcp__exec`: `journalctl -u mivaa-pdf-extractor.service \| grep -i voyage \| tail -40`. Check `VOYAGE_API_KEY` and rate-limit warnings. Backfill via `Bash`: `curl -s -X POST https://v1api.materialshub.gr/api/internal/regenerate-text-embeddings -d '{"workspace_id":"...","document_id":"<DOCUMENT_ID>","force_regenerate":true}'`. Re-run Step 6.C. |
| Gate 6.A — vector counts < total_images | Some images failed during Stage 3 | Inspect `result.failed_images` array on the job. For each failure, look up its specific symptom in this table. After fixing, run "Fill Images" via `Bash`: `curl -s -X POST https://v1api.materialshub.gr/api/internal/regenerate-image-embeddings -d '{"workspace_id":"...","document_id":"<DOCUMENT_ID>","force_regenerate":true}'` to backfill the failures. Re-run Step 6. |
| Gate 5.13 / 6.H — `icon_candidates_processed > 0` but `icon_metadata_extracted == 0` | OCR or Claude is failing on every icon. Most common causes: (a) `ocr_service.extract_icon_metadata` raised an exception, (b) `Icon-Based Metadata Extraction` prompt was renamed/deactivated, (c) Claude returned non-JSON | `mcp__supabase__execute_sql`: `SELECT name, is_active, version FROM prompts WHERE category = 'icon_metadata' AND is_active = true;` — must return 1 row. Then `mcp__ssh-mcp__exec`: `journalctl -u mivaa-pdf-extractor.service \| grep -E "extract_icon_metadata\|Icon OCR\|icon extraction failed" \| tail -30`. Fix the root cause and re-run Step 4. |
| Gate 6.H — Query H all-null but `icon_candidates_processed > 0` ("icon rollup empty") | The icon processor wrote to `document_images.metadata['icon_metadata']` but the Stage 4 rollup either (a) didn't find the icons, (b) every field_name was unknown to `material_metadata_fields`, or (c) the merge ran but stored under a different key | First check Query I — if it has rows, the rollup connector is broken (look at `_merge_icon_metadata_into_product` in stage_4_products.py). If Query I is empty, the per-image persist failed silently — look at `_process_icon_candidate` logs. |
| Gate 5.13 — no icon split log line at all | Icon detection rules didn't fire (no group of ≥3 small square images on any single page) | NOT a failure on its own — many catalog pages don't have icons. But if you expected icons, check `journalctl ... \| grep "Icon split"` to see whether `_split_material_and_icon_candidates` ran at all. If it ran but split-into-icons was zero, lower `ICON_MIN_PER_PAGE` from 3 to 2 in `image_processing_service.py`. |

---

## 5. LOOP BUDGET

For each gate failure, you may attempt up to **3 fix-and-retry loops** on the affected step before giving up and reporting `❌ E2E TEST BLOCKED`. Do not try more than 3. If a fix requires user input (token rotation, env var change, prompt rewrite that changes architecture, deploying new code), report immediately — do not loop.

Total wall-clock budget for the entire script is `HARD_TIMEOUT_MINUTES` (set per `RUN_MODE` in §2):

- `RUN_MODE = full`: **180 minutes / 3 hours**. Full-mode processing of all 11 products is materially slower than single-mode — Stage 3 alone takes minutes per product.
- `RUN_MODE = single`: **30 minutes**. A single-product run is typically 5–15 min end-to-end; anything past 30 min indicates a stuck stage or a regression worth root-causing.

If the run exceeds the budget, stop the active job via `/api/internal/reset-job/<JOB_ID>`, generate a partial `/tmp/final-result.html` with whatever data you have, and report `❌ E2E TEST BLOCKED — TIMEOUT`.

---

## 6. OUT-OF-SCOPE ACTIONS — DO NOT DO THESE

You will NOT do the following without explicit per-action user authorization:

- Commit, push, or open PRs in any git repo
- Modify any source file in `mivaa-pdf-extractor/`, `src/`, or `supabase/`
- Cancel a running job that ISN'T the one you uploaded in Step 4
- Create new GitHub issues, send emails, or post Slack/Sentry comments
- Modify any DB row except the prompt-update SQL in §4 row 1 (and ONLY when fixing Gate 1.2)
- Restart `mivaa-pdf-extractor.service` except when §4 explicitly tells you to as part of a documented fix loop

If you find yourself wanting to do any of the above to make a gate pass, **STOP** and ask the user instead.

---

## 7. TOOLS YOU WILL USE

| Tool | Purpose |
|---|---|
| `TodoWrite` | Maintain the per-step progress list (Steps 1–9) |
| `Bash` | curl against `https://v1api.materialshub.gr/*` (the public API) |
| `mcp__ssh-mcp__exec` | All read commands on the production server (journalctl, tail, grep, jq, ls, the test_full_workflow.sh launch, heredoc final-result.html generation) |
| `mcp__ssh-mcp__sudo-exec` | Only `systemctl restart mivaa-pdf-extractor.service` and only when §4 tells you to |
| `mcp__supabase__execute_sql` | All DB queries — verification SQL block in Step 6, and prompt-update fixes in §4 |
| `mcp__sentry__list_issues` | Step 2 baseline + Step 8 delta |
| `mcp__sentry__get_sentry_resource` | Detail any new Sentry issue from Step 8 |
| `Read`, `Grep` | When §4 tells you to inspect a specific file:line for a regression |

You will NOT use `Edit`, `Write`, or any tool that modifies repo state in this directory tree (this is a read-and-validate run, not a code change run). You may use `mcp__ssh-mcp__exec` with shell heredocs / sed to write `/tmp/final-result.html` on the production server — that's the one allowed write target.

---

## 8. QUICK REFERENCE — file & endpoint locations

| What | Where |
|---|---|
| Test script (production server) | `/var/www/mivaa-pdf-extractor/test_full_workflow.sh` |
| Test script in repo | `mivaa-pdf-extractor/test_full_workflow.sh` |
| Test script log capture | `/tmp/test_run.log` (created by Step 4) |
| Per-job status dumps | `/tmp/job_<JOB_ID>_*.json` (created by the script itself) |
| Final report | `/tmp/final-result.html` (created by Step 7) |
| Job logs (live) | `sudo journalctl -u mivaa-pdf-extractor.service -f` |
| Image processing service | `mivaa-pdf-extractor/app/services/images/image_processing_service.py` |
| Specialized SLIG generation | `mivaa-pdf-extractor/app/services/embeddings/real_embeddings_service.py` `_generate_specialized_siglip_embeddings` |
| VECS service (boolean flags) | `mivaa-pdf-extractor/app/services/embeddings/vecs_service.py` `_set_image_flag` |
| Entity linking | `mivaa-pdf-extractor/app/services/discovery/entity_linking_service.py` `link_images_to_chunks` |
| Material analyzer prompt loader | `mivaa-pdf-extractor/app/services/images/image_processing_service.py` `_load_material_analyzer_prompt` |
| Reset job endpoint | `POST https://v1api.materialshub.gr/api/internal/reset-job/{job_id}` |
| Health endpoint | `GET https://v1api.materialshub.gr/health` |
| Job status endpoint | `GET https://v1api.materialshub.gr/api/rag/documents/job/{job_id}` |
| Image regen (for Gate 6.A backfill) | `POST https://v1api.materialshub.gr/api/internal/regenerate-image-embeddings` |
| Text regen (for Gate 6.C backfill) | `POST https://v1api.materialshub.gr/api/internal/regenerate-text-embeddings` |

---

**END OF DIRECTIVE.** When the user says "run scripts/README.md" or equivalent, you start at §1 Preconditions and execute every step in §3 in order, stopping only at gate failures or completion.
