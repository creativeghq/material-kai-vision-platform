# Aspect Embeddings v2 — Migration Runbook

**Branch:** `feat/aspect-embeddings-voyage`
**Touches:** outer repo `material-kai-vision-platform` + submodule `mivaa-pdf-extractor`
**Migration mode:** Option B — manual application via `mcp__supabase__apply_migration`. The PR ships the code paths; you apply the database changes at your chosen window.

---

## What this PR fixes

Pre-2026-05-04, the four collections `image_color_embeddings`, `image_texture_embeddings`, `image_style_embeddings`, and `image_material_embeddings` were **fake per-aspect embeddings**. Each "color/texture/style/material" vector was computed as:

```
guided = 0.7-0.9 × base_image_embedding + 0.1-0.3 × fixed_global_text_embedding
```

The text portion was the same fixed string (`"focus on color palette and color relationships"` etc.) for every image in the catalog, regardless of what the image actually contained. Result: 4 vectors that were 70-90% identical to the base SLIG visual vector and to each other.

Post-2026-05-04, each aspect vector is the Voyage `voyage-3` embedding (1024D) of a deterministic per-image text string derived from `VisionAnalysis` (Claude Opus 4.7's structured output already cached on `document_images.vision_analysis`):

| Collection | Aspect text source |
|---|---|
| `image_color_embeddings` | `VisionAnalysis.colors[]` |
| `image_texture_embeddings` | `VisionAnalysis.textures[] + finish` |
| `image_style_embeddings` | `VisionAnalysis.style + surface_pattern + applications` |
| `image_material_embeddings` | `VisionAnalysis.material_type + category + subcategory` |

`VisionAnalysis` is unchanged — it's the same JSON Stage 3 already produces. Only the embedding step changes: from "blend the visual vector with a fixed text vector" to "Voyage-embed a real per-image aspect string".

---

## Architecture after migration

| Collection | Model | Dim | Source |
|---|---|---|---|
| `image_slig_embeddings` | SLIG SigLIP 2 | 768D | Raw image pixels (unchanged) |
| `image_understanding_embeddings` | Voyage `voyage-3` | 1024D | `serialize_vision_analysis_to_text(VA)` (unchanged) |
| `image_color_embeddings` | Voyage `voyage-3` | **1024D (was 768D)** | `serialize_aspect_color(VA)` |
| `image_texture_embeddings` | Voyage `voyage-3` | **1024D (was 768D)** | `serialize_aspect_texture(VA)` |
| `image_style_embeddings` | Voyage `voyage-3` | **1024D (was 768D)** | `serialize_aspect_style(VA)` |
| `image_material_embeddings` | Voyage `voyage-3` | **1024D (was 768D)** | `serialize_aspect_material(VA)` |

Per-image SLIG endpoint load drops from ~13 calls to 1.

---

## Rollout sequence

The PR ships the new code path **disabled** behind feature flag `EMBED_ASPECTS_FROM_VISION_ANALYSIS=false`. Existing pipeline behavior is unchanged until you flip the flag, run the migration, and trigger the backfill.

### Step 1 — Merge the PR

Both repos: outer (`material-kai-vision-platform`) + submodule (`mivaa-pdf-extractor`). They must merge in lockstep — outer's submodule pointer references the inner branch's HEAD.

After merge, **nothing changes in production behavior** because the flag is off. Verify by tailing logs — you should still see `"✅ Text-guided specialized SLIG embeddings generated (legacy path, 4 × 768D)"` on every Stage 3 image.

### Step 2 — Apply the database migration

Apply via `mcp__supabase__apply_migration` (per CLAUDE.md rule: never .sql migration files). Run during a maintenance window — it truncates the four aspect collections.

```sql
-- ──────────────────────────────────────────────────────────────────────
-- Aspect embeddings v2 (2026-05-04)
-- Truncates the 4 aspect collections (the data was wrong-by-design),
-- alters them to 1024D halfvec, adds provenance columns, resets flags
-- so the backfill cron knows everything is stale.
-- ──────────────────────────────────────────────────────────────────────

-- 1. Drop existing HNSW indexes on the 4 aspect collections.
DROP INDEX IF EXISTS vecs.image_color_embeddings_vec_idx;
DROP INDEX IF EXISTS vecs.image_texture_embeddings_vec_idx;
DROP INDEX IF EXISTS vecs.image_style_embeddings_vec_idx;
DROP INDEX IF EXISTS vecs.image_material_embeddings_vec_idx;

-- 2. Truncate. The legacy 768D blend vectors carry no useful signal.
TRUNCATE TABLE vecs.image_color_embeddings;
TRUNCATE TABLE vecs.image_texture_embeddings;
TRUNCATE TABLE vecs.image_style_embeddings;
TRUNCATE TABLE vecs.image_material_embeddings;

-- 3. Alter dimension 768 → 1024. (vecs 0.4.5 + halfvec implicit cast.)
ALTER TABLE vecs.image_color_embeddings    ALTER COLUMN vec TYPE halfvec(1024);
ALTER TABLE vecs.image_texture_embeddings  ALTER COLUMN vec TYPE halfvec(1024);
ALTER TABLE vecs.image_style_embeddings    ALTER COLUMN vec TYPE halfvec(1024);
ALTER TABLE vecs.image_material_embeddings ALTER COLUMN vec TYPE halfvec(1024);

-- 4. Recreate HNSW indexes with halfvec_cosine_ops at the new dim.
CREATE INDEX ON vecs.image_color_embeddings    USING hnsw (vec halfvec_cosine_ops);
CREATE INDEX ON vecs.image_texture_embeddings  USING hnsw (vec halfvec_cosine_ops);
CREATE INDEX ON vecs.image_style_embeddings    USING hnsw (vec halfvec_cosine_ops);
CREATE INDEX ON vecs.image_material_embeddings USING hnsw (vec halfvec_cosine_ops);

-- 5. Reset has_*_slig flags so the backfill picks every image up.
UPDATE document_images SET
  has_color_slig    = false,
  has_texture_slig  = false,
  has_style_slig    = false,
  has_material_slig = false;

-- 6. Add provenance columns. Mirrors the understanding_embedding_model /
--    understanding_schema_version pattern. Used by the staleness detector
--    in app/services/embeddings/aspect_backfill.py.
ALTER TABLE document_images
  ADD COLUMN IF NOT EXISTS color_aspect_embedding_model    text,
  ADD COLUMN IF NOT EXISTS color_aspect_schema_version     int,
  ADD COLUMN IF NOT EXISTS texture_aspect_embedding_model  text,
  ADD COLUMN IF NOT EXISTS texture_aspect_schema_version   int,
  ADD COLUMN IF NOT EXISTS style_aspect_embedding_model    text,
  ADD COLUMN IF NOT EXISTS style_aspect_schema_version     int,
  ADD COLUMN IF NOT EXISTS material_aspect_embedding_model text,
  ADD COLUMN IF NOT EXISTS material_aspect_schema_version  int;
```

After this runs:
- The 4 aspect collections are empty.
- Every `document_images` row has `has_*_slig=false` for the 4 aspects.
- The 4 provenance columns exist and are NULL on every row.
- All aspect-search queries return 0 matches (gracefully degrades the 7-vector fusion to the other 3 vectors until backfill catches up).

### Step 3 — Flip the feature flag on production

Add `EMBED_ASPECTS_FROM_VISION_ANALYSIS=true` to MIVAA's systemd unit `Environment=` block, then `systemctl restart mivaa-pdf-extractor.service`.

After restart, every NEW image processed through Stage 3 writes 4 × 1024D Voyage aspect vectors instead of 4 × 768D SLIG-blend vectors. Verify by tailing logs — you should see `"✅ Per-aspect embeddings generated (4 × 1024D Voyage)"` on new ingestions.

### Step 4 — Trigger the backfill

The catalog still has zero aspect vectors at this point (step 2 truncated them). Run the bulk backfill until `scanned=0`:

```bash
# Initial run — 200 images
curl -X POST https://v1api.materialshub.gr/admin/aspect-embeddings/backfill \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"batch_size": 25, "max_images": 200}'

# Repeat until scanned == 0
```

Or schedule it via cron — same endpoint as the existing `understanding-embeddings/backfill` cron, just a new path. Throughput: ~5min per 1000 images at default `batch_size=25` (Voyage rate-limit-bound).

### Step 5 — Verify quality

Use the new diagnostic endpoint to spot-check images you know should match together:

```bash
curl https://v1api.materialshub.gr/admin/images/<image_id>/embeddings-status \
  -H "Authorization: Bearer <admin-jwt>"
```

Look at the `source_texts` block — for a clearly-warm-white-marble image, `color` should read something like `"warm white, grey veining"`. If it says `"black"` or is empty, that's a bad VisionAnalysis pass and you can re-run via:

```bash
# Repopulate VisionAnalysis (re-runs Claude Opus 4.7)
curl -X POST https://v1api.materialshub.gr/admin/understanding-embeddings/backfill \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"image_ids": ["<id>"], "max_images": 1}'

# Then re-embed aspects from the fresh VA
curl -X POST https://v1api.materialshub.gr/admin/images/<id>/rerun-aspect-embeddings \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"reason": "wrong color match in search results"}'
```

### Step 6 — Cleanup (separate PR, ~1 week later)

Once metrics show v2 aspects are healthy across the catalog:

- Delete `_SPECIALIZED_TEXT_PROMPTS`, `_get_cached_specialized_text_embedding`, `_text_prompt_embedding_cache`, and `_generate_specialized_siglip_embeddings` in [`real_embeddings_service.py`](mivaa-pdf-extractor/app/services/embeddings/real_embeddings_service.py)
- Delete the `elif image_url or image_data:` legacy branch in the call site
- Remove the `EMBED_ASPECTS_FROM_VISION_ANALYSIS` env var
- Remove the legacy-key `_pick("…", "…_slig_768")` fallback in [`embedding_to_text_service.py`](mivaa-pdf-extractor/app/services/embeddings/embedding_to_text_service.py)

---

## Rollback

The migration in step 2 is destructive (truncate). There is no clean rollback once applied.

If v2 turns out to be worse than v1 (very unlikely — the v1 vectors carried near-zero independent signal), the fix is to **roll forward**, not back: tune the search weights in `unified_search` so the four aspect collections contribute less than 50%, or temporarily set their weights to 0 while you investigate. The four collections are queried independently; zero-weighting them is a config change, not a code change.

To pause v2 ingestions: flip `EMBED_ASPECTS_FROM_VISION_ANALYSIS=false` and restart MIVAA. New images stop writing v2 aspects; they fall back to the legacy SLIG path. (But the legacy path will then write 768D vectors into the now-1024D collections — which fails. So in practice "rollback" means "stop ingesting and figure out forward path".)

---

## Affected files (PR diff inventory)

### Outer repo (`material-kai-vision-platform`)

- [docs/aspect-embeddings-v2-runbook.md](docs/aspect-embeddings-v2-runbook.md) (this file, NEW)
- [CLAUDE.md](CLAUDE.md) — add v2 section to the architecture summary
- [docs/ai-models-guide.md](docs/ai-models-guide.md), [docs/ai-models-complete-list.md](docs/ai-models-complete-list.md), [docs/ai-models-architecture.md](docs/ai-models-architecture.md), [docs/unified-product-generation-flow.md](docs/unified-product-generation-flow.md), [docs/api-docs.md](docs/api-docs.md), [docs/multi-source-meta-extraction-plan.md](docs/multi-source-meta-extraction-plan.md), [docs/modular-pipeline-endpoints.md](docs/modular-pipeline-endpoints.md), [docs/pdf-processing-pipeline.md](docs/pdf-processing-pipeline.md), [docs/overview.md](docs/overview.md), [docs/moodboard-presentation-sheets.md](docs/moodboard-presentation-sheets.md) — sweep references to "SLIG 768D" / "color_slig_768" → note v2 model + new producer key naming
- [scripts/README.md](scripts/README.md) — verification queries reference the new dim/model
- Submodule pointer bump → new `mivaa-pdf-extractor` HEAD on `feat/aspect-embeddings-voyage`

### Submodule (`mivaa-pdf-extractor`)

- `app/models/vision_analysis.py` — bump `SCHEMA_VERSION` to 2; add 4 `serialize_aspect_*` functions + `ASPECT_SERIALIZERS` registry
- `app/services/embeddings/real_embeddings_service.py` — new `_generate_specialized_aspect_embeddings`; call site rewired behind feature flag; legacy method retained until cleanup
- `app/services/embeddings/vecs_service.py` — `upsert_specialized_embeddings` accepts dim from caller, persists provenance; `search_specialized_embeddings` auto-detects dim from query vector
- `app/services/embeddings/aspect_backfill.py` (NEW) — bulk + per-image backfill helpers
- `app/services/embeddings/embedding_to_text_service.py`, `app/services/metadata/visual_metadata_service.py` — accept both old (`color_slig_768`) and new (`color_aspect_1024`) keys during rollout
- `app/api/admin.py` — three new endpoints: bulk aspect backfill, per-image rebuild, embeddings-status inspector
- `app/api/internal_routes.py`, `app/services/images/image_processing_service.py` — Stage 3 + internal save paths produce both naming conventions, pass embedding_model + schema_version provenance to vecs_service
- `app/api/rag_routes.py` — embeddings list endpoint reads provenance columns to label each row as v2 vs legacy

---

## Effort & risk

- Code changes: ~10 files. All gated behind a single env var until step 3.
- Migration: ~30s on a catalog with <1M images.
- Backfill: 5min per 1000 images, parallelisable across batches. ~$0.10 per 1000 images in Voyage cost.
- Risk: low for the code changes (legacy path retained until cleanup); medium for the migration (irreversible truncate, but the data was wrong-by-design).
