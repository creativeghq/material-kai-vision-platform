# Material KAI Vision Platform - Project Context

## Project Structure
- **Frontend**: React 18 + TypeScript + Vite + Shadcn/UI (src/)
- **Backend**: Python FastAPI (mivaa-pdf-extractor/app/)
- **Edge Functions**: Deno/TypeScript (supabase/functions/)
- **Database**: Supabase PostgreSQL 15 + pgvector 0.8.0
- **Design System**: `.claude/design-system.md` — full reference for all UI patterns, colors, components

## Security Invariants (MUST follow — from pentest #250, 2026-07-05)
These are hard rules. A change that violates one is a bug, not a style choice. Tracker: GitHub #250. Automated backstop: `check_security_invariants()` RPC (run in CI / daily cron — see below). The recurring root cause of the audit was "service-role client + trust a body-supplied id" and "SECURITY DEFINER exposed to anon" — do not reintroduce either.

1. **Tenancy binding (BOLA).** Any edge function / route / RPC that touches workspace-scoped data MUST derive `user_id`/`workspace_id` from the **verified JWT** and verify the caller owns the target object — `userCanAccessWorkspace(supabase, auth.userId, row.workspace_id)` (Deno, `_shared/auth.ts:444`) or `assert_workspace_member(workspace_id)` (SQL). NEVER trust `workspace_id`/`user_id`/`created_by` from the request body. Using the service-role client (RLS-bypassing) does NOT exempt you — it makes the manual check mandatory. Return 404 (not 403) on ownership mismatch to avoid id enumeration.
2. **SECURITY DEFINER functions.** Every one MUST `SET search_path = ''` (or `pg_catalog, public`) AND `REVOKE EXECUTE FROM anon, authenticated, PUBLIC` immediately after `CREATE`, then GRANT only to the roles that need it. Trigger-body functions (`RETURN trigger`) get NO execute grant. Only add `anon`/`authenticated` EXECUTE for a function genuinely called from a public page or the client, and only after confirming it self-guards (`assert_workspace_member`). Mutating finance/order RPCs are NEVER anon-executable.
3. **Tenant views.** Any view over workspace-scoped tables MUST be `security_invoker = on` so it inherits the underlying RLS. Never `SECURITY DEFINER` (the default for a view owned by a privileged role) unless it has an explicit caller-tied `WHERE`. Never grant a view INSERT/UPDATE/DELETE.
4. **RLS.** Every new `public` table with tenant data gets RLS enabled + a workspace-scoped policy. No `WITH CHECK (true)` / `USING (true)` "always-true" policies on tenant tables.
5. **MIVAA routes.** New routes declare their own `Depends(get_workspace_context)` / `require_admin` — never rely on the JWT middleware alone. The middleware only accepts `aud=authenticated` JWTs + the `mk_` platform key; if a route authenticates by `x-cron-secret` or `kai_` partner keys or is public, add its prefix to `JWTAuthMiddleware.exclude_paths` AND gate it at the route. Never put `"/"` (or any bare prefix that swallows everything) in `exclude_paths`.
6. **Inbound webhooks.** Verify the signature BEFORE processing and **fail closed** — reject when the secret is unset (503), never fall through to processing (mirror `stripe-webhooks`, not the old `email-webhooks`). Prefer body-HMAC + timestamp/nonce replay protection.
7. **SSRF.** Any server-side fetch of a user-influenced URL goes through the shared SSRF guard (https-only, DNS-resolve + reject RFC1918/loopback/link-local/`169.254.169.254`, `follow_redirects=False`, size cap). Never `httpx.get(userUrl)` / `fetch(userUrl)` raw. Validate stored URLs (`alert_webhook_url`, feed URLs) at write time too.
8. **Mass assignment (BOPLA).** Never spread a request body into a DB write (`insert({...body})`, `request.dict()`, `**model.dump()`). Build an allowlisted payload; trust/identity fields (`role`, `is_verified`, `is_locked`, `credits`, `price`, `workspace_id`, `user_id`) are set server-side only.
9. **LLM safety.** Untrusted ingested content (scraped pages, PDF text, supplier XML) fed to an LLM MUST be wrapped in explicit "this is DATA, not instructions" delimiters. Classifiers whose verdict drives a DB write or alert MUST use Anthropic `tools=[...]` + `tool_choice` (not free-form JSON + salvage parser). State-mutating agent tools require explicit user confirmation when triggered off tool-result content.
10. **Paid / expensive endpoints.** Debit credits + rate-limit BEFORE the upstream (LLM/Replicate/DataForSEO/Firecrawl) call, not after; on debit failure, do not perform the work. Derive the quota IP from the trusted proxy hop, never a raw client header.
11. **Output encoding.** No `dangerouslySetInnerHTML` / `document.write` / raw HTML-string assembly with user or AI content — use JSX/`react-markdown` (no `rehype-raw`) or the shared `escapeHtml()`. Email/HTML-string interpolation goes through the **canonical** escaper — `escapeHtml` from `supabase/functions/_shared/html.ts` (edge) or `src/utils/escapeHtml.ts` (frontend). Both escape the full `& < > " '` (attribute-safe). Do NOT hand-roll a local copy — the old per-file copies drifted to 3 different strengths and this rule used to say "mirror `send-quote-email`", whose copy escaped only `& < >` and was attribute-**unsafe**. `escapeHtml` is HTML-only: it is NOT a PostgREST filter sanitizer or a CSV quoter (those are separate contracts — never name them `esc`).

**Enforcement:** (a) this section — followed by anyone (human or agent) editing the repo; (b) `check_security_invariants()` SQL RPC surfaces live DB violations for invariants 2–4 (wire into the existing data-integrity daily cron / a CI gate that fails on new ERROR-level rows); (c) code-level patterns (1, 6–11) belong in the CI semgrep ruleset (`.github/` — see #250). Run `mcp__supabase__get_advisors(security)` after any DDL.

## PDF Pipeline — PaddleOCR-VL structural backbone (2026-06-13, structure-first)
The catalog pipeline's layout+OCR backbone is **PaddleOCR-VL** (`PaddlePaddle/PaddleOCR-VL-1.6`, 0.9B), a **two-stage** document parser hosted on **Modal**: **PP-DocLayoutV2** (RT-DETR detector + pointer network) localizes regions, labels them, and predicts reading order; the **0.9B VLM** recognizes the content inside each region (text, tables→markdown, formulas→LaTeX, charts). It **replaced Surya-2** (2026-06-13) — the dedicated RT-DETR boxes are tighter (→ cleaner product crops → better SLIG visual embeddings) and reading order is from a dedicated model; validated at ~1-3s/page warm, near-perfect Greek OCR, figure boxes within ~8px. `surya_endpoint_manager.py`, `surya_blocks.py`, `modal_app/surya_vllm.py` and all `surya_*` Settings/`get_surya_config`/`SURYA_PRICING` are deleted. (Earlier history: Surya-2 itself had replaced YOLO + Chandra + `merge_layout`.) HF now hosts only **SLIG**; the structural pass is **Modal-only**.
- **In-process pipeline, not vLLM**: the Modal app ([modal_app/paddleocr_vl.py](mivaa-pdf-extractor/modal_app/paddleocr_vl.py)) runs the full `paddleocr[doc-parser]` `PaddleOCRVL` pipeline in one container on `paddlepaddle-gpu` (NOT vLLM — which only covers the VLM half and needs nightly builds). It exposes a custom contract: `GET /health` (unauth warmup probe) + `POST /parse {image_b64, mode}` → `{"regions":[{bbox:[x0,y0,x1,y1] px, label, content, order}], width, height}`. `mode=page` for the structural pass, `mode=block` for per-crop OCR. GPU L4, `min_containers=0` + `scaledown_window=120` (=$0 idle), `max_containers=4`. **Forces `device="gpu"`** (the pipeline defaults to CPU → minutes/page). Cold start ~90s (model load + first-call JIT), paid once per job at warmup.
- **Parser** [paddleocr_pipeline.py](mivaa-pdf-extractor/app/services/pdf/paddleocr_pipeline.py): maps the `/parse` JSON onto the **unchanged** `document_layout_analysis.layout_elements[]` schema (so every consumer — Stage 2 chunking, Stage 3 crops, discovery — is untouched). PP-DocLayout labels (`doc_title`/`paragraph_title`/`text`/`table`/`image`/`figure`/`chart`/…) → existing `region_type` vocab via `PADDLE_LABEL_TO_REGION_TYPE`; `IMAGE`/`FIGURE` (+ `chart`) are the product-crop sources. RT-DETR **pixel** bboxes → normalized 0..1 at the parser boundary → denormalized to the crop render in `region_to_layout_element`. Table `content` (markdown/HTML) preserved in `metadata.html`.
- **Structure-first ordering**: the PaddleOCR pass runs as **Stage 1, BEFORE discovery** ([stage_1_layout_precompute.py](mivaa-pdf-extractor/app/api/pdf_processing/stage_1_layout_precompute.py)), persisting `document_layout_analysis` rows with `processing_version="paddleocr-vl"`. Discovery reads the reading-order text from that cache (via `build_page_text_from_layout_cache`) instead of raw `page.get_text()`; Stage 2 chunking is also **cache-first for page text** (2026-06-30) — `process_product_chunking` derives each page's text via `page_text_from_layout_regions(layout_regions_by_page[page])` and only falls back to PyMuPDF `get_physical_page_text` on a cache miss, so image-only / scanned pages the VLM already OCR'd no longer get gated out to 0 chunks. Stage 3 crops read the same cache (reader gates in `pdf_processor`/`stage_1_focused_extraction` accept `paddleocr-vl`).
- **OCR is PaddleOCR too**: [ocr_service.py](mivaa-pdf-extractor/app/services/pdf/ocr_service.py) (`_call_paddleocr` via `run_structural_pass` on the crop) backs Phase-3 per-image OCR + icon metadata + the admin re-OCR endpoint; `OCRResult.method` is `paddleocr`/`paddleocr_failed`. `ocr_engine` setting = `paddleocr`.
- **Manager + lifecycle**: [paddleocr_endpoint_manager.py](mivaa-pdf-extractor/app/services/pdf/paddleocr_endpoint_manager.py) (`PaddleOCRManager.from_config`, `run_structural_pass`=page mode — the only inference entrypoint; per-image OCR calls it on the crop. The old `run_block_ocr`=block wrapper was removed 2026-07-04 as unused, though the Modal `/parse` endpoint still supports `mode="block"`) holds inference + retry + `paddleocr_metrics` telemetry; lifecycle (warmup `/health` probe / scale-to-zero no-op) is delegated to `ModalEndpointProvider` in [endpoint_providers.py](mivaa-pdf-extractor/app/services/pdf/endpoint_providers.py) (Modal-only; SLIG now uses the same provider — see the SLIG→Modal section below). The registry's `get_paddleocr_manager` + `endpoint_controller`'s `paddleocr` gate + `warm_all` warm it alongside SLIG. Pricing `PADDLEOCR_PRICING`; admin monitor (`AsyncJobQueueMonitor`, `PlatformOverviewTab`) surfaces PaddleOCR. **Modal app deployed at `https://basilakis--paddleocr-vl-paddleservice-web.modal.run`** (app `paddleocr-vl`, workspace `basilakis`). The only required runtime secret is **`PADDLEOCR_MODAL_API_KEY`** (value of the `paddleocr-api-key` Modal secret; the URL is baked as the config default). Redeploy via `modal deploy modal_app/paddleocr_vl.py` (see [modal_app/README.md](mivaa-pdf-extractor/modal_app/README.md)). All wired in `deploy.yml`.
- **Known residual**: `Image`/`Figure`/`chart` regions are crop sources but not OCR'd, so a product name rendered *inside* a photo is still not read. **Follow-up (not yet built): Voyage `voyage-multimodal-3` page embedding → `vecs.page_embeddings` (8th fusion vector)** for catalog-Q&A retrieval.

## SLIG (SigLIP2) → Modal; HuggingFace fully removed (2026-06-14)
SLIG — the platform's **visual encoder** (768D `visual` fusion vector in `vecs.image_slig_embeddings`, plus zero-shot + image⇄text similarity, plus text→visual query embedding on the realtime search path) — **moved off HuggingFace Inference Endpoints onto Modal**, mirroring the PaddleOCR-VL cutover. **HuggingFace now hosts NOTHING** — both GPU endpoints are Modal-only.
- **Model truth corrected**: `basiliskan/slig` is a verbatim duplication of **`google/siglip2-base-patch16-512`** — stock SigLIP2 base, **native 768D, NO SO400M and NO 1152→768 projection head** (older docstrings were wrong; `config.json` is `model_type: "siglip"`, no `auto_map`). Bit-for-bit reproducible with stock `transformers`.
- **Modal app** [modal_app/slig.py](mivaa-pdf-extractor/modal_app/slig.py) (app `slig`, `https://basilakis--slig-sligservice-web.modal.run`): loads `AutoModel` + **`AutoTokenizer` + `AutoImageProcessor(use_fast=False)` separately** (NOT `AutoProcessor` — it mis-resolves the Gemma tokenizer to the slow `SiglipTokenizer` which crash-loops on a missing `spiece.model`). Weights baked into the image; `HF_HUB_OFFLINE=1` at runtime so HF is never contacted post-deploy. Scale-to-zero (`min_containers=0`), GPU `A10G`. Same `{inputs, parameters}` contract + response shapes as the old HF endpoint → POST `/infer`, GET `/health`. `huggingface_hub` pinned `<1.0` (transformers 4.49 incompatible with 1.x).
- **Parity gate passed** before cutover: text + image embeddings cosine = **1.0000000** vs the live HF endpoint (script: [scripts/slig_modal_parity_check.py](scripts/slig_modal_parity_check.py)) → no catalog re-embedding needed.
- **Wiring**: `get_slig_config()` → `provider='modal'` + `slig_modal_url`/`slig_modal_api_key`; `SLIGEndpointManager` is now a thin `ModalEndpointProvider` wrapper (HF SDK gone); `SLIGClient` POSTs to `/infer`. The bearer is **SHARED with PaddleOCR** (reuses the `paddleocr-api-key` Modal secret; `deploy.yml` sets `SLIG_MODAL_API_KEY=${{ secrets.PADDLEOCR_MODAL_API_KEY }}`). CI `deploy-modal` deploys both Modal apps on any `modal_app/**` change.
- **Decommissioned**: deleted `endpoint_auto_scaler.py`, `endpoint_health_checker.py`, `hf_errors.py`; removed the HF auto-scaler startup, HF-SDK prep/drain branches + `HFBillingError` fast-fail in `endpoint_controller`/`rag_routes`, the proactive HF scale-up, and the `slig_endpoint_*` / `huggingface_api_key` settings + the `HUGGINGFACE_*`/`SLIG_ENDPOINT_*` `deploy.yml` env lines. The HF Inference Endpoint itself + the `HF_TOKEN`/`HUGGINGFACE_API_KEY` `platform_secrets` rows can be deleted (no runtime reader remains).

## Edge Function Observability (2026-06-09 — unified wrapper)
Every edge function is wrapped with `withApiLogging('<fn-name>', handler)` from [_shared/api-logger.ts](supabase/functions/_shared/api-logger.ts) — the single chokepoint for both request logging (`api_usage_logs`) AND Sentry error capture. All 88 functions are wrapped (was 29; the other 59 + the 3 that had bespoke Sentry calls were unified 2026-06-09).
- **Do NOT call `captureException` yourself for top-level request failures** — the wrapper reports them: a thrown handler → `captureException(realError)`; a handler that returns 5xx → `captureMessage` (error level); 4xx are intentionally NOT reported (client errors, not bugs). All tagged with `function` + `method` + `status`.
- **Deep / background captures** (errors swallowed mid-pipeline that never reach the wrapper — e.g. detached async work like `xml-import-orchestrator`'s retry loop) still call `captureException` directly from [_shared/sentry.ts](supabase/functions/_shared/sentry.ts) — they carry context the wrapper can't see, over the same transport.
- **New functions**: wrap the `Deno.serve(...)` / `serve(...)` handler with `withApiLogging` — that's all; logging + Sentry come for free. Sentry DSN is env `SENTRY_DSN` (hardcoded fallback in sentry.ts).
- **Sentry is kept signal-only (noise filtering, 2026-06-09)**: 4xx are never reported; a 5xx whose message reads like a client error (validation / auth / method / not-found — `isLikelyClientError`) is suppressed too, since several functions mislabel client errors as 500 (scrape-*, email-api). The HTTP response is never altered — only the report is gated. Duplicate `(function+status+message)` events are throttled per worker (60s). For correct status codes on validation/auth failures in new code, `throw new HttpError(400, 'msg')` (from api-logger.ts) — the wrapper returns that status AND skips Sentry. The `CLIENT_ERROR_RE` filter is tunable as real noise-vs-bug data comes in.

## Storage Buckets (post-consolidation 2026-05-23)
The platform uses **6 buckets** (down from 17). Routing is path-based; feature identity lives in the top-level folder, not the bucket name.

| Bucket | Public | Folders / use |
|---|---|---|
| `pdf-documents` | 🔒 private (signed URLs) | KB raw PDFs at `{user_id}/...` · `catalog-source/{catalog_id}/...` · `catalog-output/{catalog_id}/...` · `quote-output/{quote_id}/...` · `moodboard-output/{moodboard_id}/sheet-{sheet_id}.pdf` · `client-view-output/{project_id}/cv-{client_view_id}.pdf` |
| `pdf-tiles` | ✅ public read (bucket `public=true`) | `extracted/{document_id}/...` (KB) · `catalog-extracted/{source_pdf_id}/page-NNNN-{bbox}.png` |
| `generation-images` | ✅ public, 100 MB, image/video | `{user_id}/...`, `gemini/`, `videos/`, `user-uploads/`, `social/`, `product-crops/...` (SAM crops + segmentation), `agent/` (chat uploads), `3d/` (3D models), `designer/` (designer module) |
| `quote-templates` | 🔒 private, 50 MB | Quote template PNGs at root (`template-cover.png`, `template-content.png`, `template-backcover.png`, `template-intro.png`) · `catalog/cover.png` / `catalog/backcover.png` (catalog templates) |
| `moodboard-sheet-references` | ✅ public | Static admin-curated illustrations for the sheet-type picker (`material_board.png`, `color_palette.png`, etc.) |
| `profile-avatars` | ✅ public, 2 MB | `{user_id}/avatar.ext` |

**Privacy model:**
- `pdf-documents` is private — every reader mints a fresh signed URL via `createSignedUrl()`. Stop persisting full URLs in DB rows; store the storage path (`storage_bucket` + `storage_object_path`) and re-derive on each render. The 2026-05-23 audit hardened both write side (upload routers no longer persist `file_url` in metadata; resume reads `storage_bucket`/`storage_object_path` and signs fresh) and read side (`KnowledgeBasePDFViewer.handleOpenOriginalPdf` calls `createSignedUrl` on demand instead of opening a stale persisted URL).
- `pdf-tiles` is a **public-read** bucket (`storage.buckets.public=true`, verified 2026-06-21) — object GETs via the `/object/public/pdf-tiles/...` URL succeed for anon (extracted tile/crop images are not sensitive). Earlier docs claiming "authenticated-only read" were wrong. Writes are service-role. (This is what lets the public KB / brand pages show product thumbnails to logged-out visitors.)
- `generation-images` is public-readable but writes are RLS-gated to authenticated users or service role.
- `quote-templates` is admin-only RW via the `quote_templates_admin_all` policy (admin / super_admin / owner roles, plus service_role).

**Cleanup wiring:**
- `storage-orphan-cleanup-cron` scans `pdf-documents` (72h grace) + `pdf-tiles` (48h grace) + `generation-images` (14d grace). Grace bumps landed 2026-05-23 to widen absorption for delayed-DB-write paths (admin uploads, schedulers that upload to storage minutes before inserting the documents row, background catalog-restore). Each `batch.remove()` is preceded by a `verify_storage_orphans(bucket, paths[])` call that re-checks the candidate batch against the live DB reference set — closes the race between `find_orphan_storage_objects` snapshot time and the actual delete (a 5000-path batch can take ~30s, and a DB ref written in that window would otherwise be left dangling). Race-protected skips are counted in `storage_cleanup_log.details.skipped_raced`. Fail-closed on verify error — a failing RPC skips the batch rather than blindly delete the stale snapshot.
- **Entity-delete storage cleanup is GC-based, NOT trigger-based (corrected 2026-06-22).** There are **no** `_cleanup_*_storage` AFTER DELETE triggers — earlier docs/comments claiming "7 AFTER DELETE trigger functions" were inaccurate; those triggers never existed in the live DB (and a SQL trigger deleting `storage.objects` rows would orphan the physical blob anyway — only the Storage API removes both). Instead, deleting a moodboard / agent chat / quote / sheet / client-view removes the row(s) (FK CASCADE handles children), which drops the file out of `build_storage_reference_set()`, and **`storage-orphan-cleanup-cron` garbage-collects the now-unreferenced files** via `find_orphan_storage_objects()` (grace windows above). `build_storage_reference_set()` is the live-reference set the cron diffs against (protects in-use files + per-live-conversation/inbox prefixes); it is a plain function, NOT a trigger. The sheet (`moodboardSheetsService`) and client-view (`clientViewsService`) services additionally do a best-effort client-side `storage.remove()` of their PDF before deleting the row so it's freed immediately; the cron is the backstop.
- `reset-platform` clears `pdf-tiles` + `generation-images` only. KB raw + generated outputs in `pdf-documents` survive a reset (the orphan cron picks up any that the table-clear step orphans).

**Per-session agent layout (2026-05-31 reorg):** everything a chat creates now lives under one per-session prefix in `generation-images` so deleting the chat deletes one folder. Canonical layout (built by `_shared/storage-paths.ts` on the edge + `src/utils/storagePaths.ts` on the client):
- `u/{user_id}/sessions/{conversation_id}/gen/{job}.{ext}` — AI generations (gemini, region-edit, virtual-staging, video-v2). Each generation edge function takes optional `conversation_id` in its body and `resolveOutputPath(ctx, '<legacyPrefix>', file)` falls back to the legacy flat prefix when absent → **safe partial rollout**. `user_id` is derived server-side from the bearer, never path-built from the body. PBR maps (`pbr-maps/{productId}/`) and social images (`social/`) are intentionally NOT session-scoped — they're entity-scoped assets with their own lifecycle.
- `u/{user_id}/sessions/{conversation_id}/uploads/{ts}-{n}.{ext}` — user-attached chat images. AgentHub creates the conversation **before** uploading so first-message attachments land in the session folder (not the legacy `user-uploads/` prefix).
- `u/{user_id}/moodboards/{moodboard_id}/{item_id}.{ext}` — **copy-on-promote** target. `moodboardAPI.addMediaFromChat()` `.copy()`s the bytes here (original stays in the chat) so the image survives chat deletion. `MoodboardSavePopover` calls it instead of storing the raw session URL.
- **Cleanup:** `_cleanup_session_storage` (AFTER DELETE on `agent_chat_conversations`) prefix-deletes `u/{uid}/sessions/{cid}/`. The legacy regex scrubbers (`_cleanup_chat_message_storage` / `_cleanup_conversation_storage`) stay as forward-only transition belt-and-braces for pre-reorg objects (their paths carry no conversation linkage so they can't be migrated). `build_storage_reference_set` gained an `is_prefix=true` row per **live** conversation, so a session image is protected by the conversation's existence — not by its URL being embedded in a message (closes the gemini-intermediate / edited-away-attachment reap gap).
- **Catalog rebuild cleanup:** `generate-catalog-pdf` clears the `catalog-output/{catalog_id}/` prefix before each rebuild (was accumulating timestamped PDFs). `_cleanup_catalog_output_storage` (AFTER DELETE on `presentation_catalogs`) clears the output prefix; `_cleanup_catalog_source_pdf_storage` (AFTER DELETE on `catalog_source_pdfs`) removes the source PDF + its `pdf-tiles/catalog-extracted/{source_pdf_id}/` tiles. Source PDFs stay keyed by `source_pdf_id` (uploaded into a library before any catalog exists, so they're not catalog-keyed).

## Public Tools page — `/tools` lead-gen (2026-05-23)

Unauthenticated lead-gen surface that lets anyone type a product or brand name and get back real retailer prices + recent press mentions. Built to drive sign-ups into the paid tracked flow.

**Route**: `/tools` — registered in [src/App.tsx:138](src/App.tsx#L138) **outside** `<AuthGuard>`, same pattern as `/board/:id` and `/c/:slug`.

**Quota model**: 2 total scans/day per IP (combined across both scan types), keyed on `user_id` when signed in (so users behind shared IPs don't penalize each other). Identical queries within 24h hit `public_lookup_cache` and serve instantly **without consuming quota or spending upstream credits**. Failed scans (captcha-failed / rate-limited / errored) don't burn quota either — only `outcome='success'` rows in `public_lookup_log` count.

**Bot defense**: Cloudflare Turnstile is required on every scan. The widget is rendered with one of two action labels (`price_scan` or `mention_scan`) and verified server-side via `https://challenges.cloudflare.com/turnstile/v0/siteverify`. Fails closed — if `TURNSTILE_SECRET_KEY` isn't set, every scan returns 400 with error code `configuration_error`.

**Stateless engines**: Both scan paths re-use the existing discovery services without writing to `tracked_queries` / `tracked_mentions`:
- `POST /api/v1/public/price-scan` → calls `PerplexityPriceSearchService.search_prices()` directly (Perplexity Sonar + DataForSEO Shopping + Firecrawl verification) → returns retailer list + min/median/max stats. Mirrors the internal `/market-check` endpoint but without the admin guard.
- `POST /api/v1/public/mention-scan` → builds a deterministic `SubjectFacets` (label + user aliases, **no Haiku expansion**, no Anthropic dependency) and calls `MentionSearchService.search()` directly (DataForSEO News + Perplexity Sonar) → returns recent mentions + top outlets.
- `GET  /api/v1/public/quota` → reads current `{used, remaining, limit, reset_at, turnstile_site_key, is_authenticated}` in a single round trip so the frontend can render the widget without a separate key fetch.

**Database** (migration `public_tools_lookup_tables_and_turnstile_secrets`):
- `public_lookup_log(id, scan_type, ip_address inet, user_id uuid, query_hash, query_text, cache_hit, upstream_cost_usd, latency_ms, outcome, error_message, user_agent, created_at)` — one row per scan attempt (cache hit or miss, success or failure). Quota query is `count(*) where outcome='success' and (ip = ? or user_id = ?) and created_at > now() - 24h`. RLS reads gated to admin/super_admin; writes service-role-only.
- `public_lookup_cache(query_hash, scan_type, result jsonb, hit_count, created_at, expires_at)` — PK on `(query_hash, scan_type)`. 24h TTL. `hit_count` is bumped on every cache hit for cost-savings analytics.
- pg_cron `public-lookup-cleanup-daily` at 04:15 UTC prunes expired cache rows + log rows older than 30d.

**Turnstile keys live in `platform_secrets`** (two rows, both `primary_module_slug = NULL` → platform-wide, surface at `/admin/operations → Keys`):
- `TURNSTILE_SITE_KEY` — public, embedded in HTML, `is_sensitive=false`. Returned by `GET /quota` so the frontend widget can render.
- `TURNSTILE_SECRET_KEY` — used server-side by `turnstile_verifier.py`, `is_sensitive=true`, masked in admin GET responses.

**Where to deploy the keys**: Preferred is **MIVAA env via deploy.yml `Environment=` lines** (same as `PERPLEXITY_API_KEY` / `FIRECRAWL_API_KEY` / `DATAFORSEO_BASE64`). Env wins over DB. The DB rows in `platform_secrets` are the rotate-without-redeploy fallback — paste new values into the admin UI and MIVAA picks them up within 30 seconds (`platform_secret_resolver.py` caches each row for 30s). Both keys are consumed by the **Python backend, not Supabase edge functions** — the widget script is loaded directly from Cloudflare on the frontend, and siteverify is called from Python.

**Python env-first / DB-fallback resolver** ([platform_secret_resolver.py](mivaa-pdf-extractor/app/services/integrations/platform_secret_resolver.py)): mirrors the Deno `_shared/secrets.ts → resolveSecret()` pattern. Priority is `os.getenv(key) > platform_secrets.value > platform_secrets.default_value > missing`. 30s in-process cache per worker so per-request resolution is cheap. Used by `turnstile_verifier.verify_token()` and by the `/quota` endpoint to surface the site key.

**Cost model**: Each scan costs the platform ~$0.005–$0.020 in upstream API spend (Perplexity ~$0.005, DataForSEO ~$0.0006, Firecrawl verification of 5–10 URLs ~$0.01, Haiku classification on mention path ~$0.001). Visitor pays nothing. The 24h cache + 2/day cap + Turnstile gate cap the blast radius at ~2 × 365 × $0.02 = ~$15/IP/year worst case. Real-world: most queries are repeats hitting cache.

**Frontend**:
- [src/services/publicToolsService.ts](src/services/publicToolsService.ts) — `fetchQuota()`, `priceScan()`, `mentionScan()`. Throws structured `PublicToolsApiError` with `kind: 'quota_exceeded' | 'captcha_failed' | 'upstream' | 'network'` so the page can route each failure mode independently.
- [src/components/features/turnstile/TurnstileWidget.tsx](src/components/features/turnstile/TurnstileWidget.tsx) — React wrapper. Loads `https://challenges.cloudflare.com/turnstile/v0/api.js` once per page via memoized script promise. Exposes `reset()` via `useImperativeHandle` so the page can reissue a fresh token after each scan (Turnstile tokens are single-use).
- [src/pages/Tools/PublicToolsPage.tsx](src/pages/Tools/PublicToolsPage.tsx) — two-tab form (Price / Mention), live quota chip in the header, Turnstile-gated scan button, result cards. When `quota.remaining === 0` the form is replaced by the `UpsellCard` with two CTAs: "Create free account" (→ `/auth?mode=signup`) and "See credit packs" (→ `/auth?mode=signup&redirect=/billing`).

**To activate after this branch deploys**:
1. Sign up at https://dash.cloudflare.com/?to=/:account/turnstile (free tier — 1M verifications/month).
2. Create a widget for the production domain. Use `Managed` mode for invisible challenges on most legit traffic + checkbox on suspicious.
3. Paste site key + secret key either into deploy.yml `Environment=` lines on MIVAA (preferred) **or** at `/admin/operations → Keys`.
4. Redeploy MIVAA so the new env vars take effect (skip if using DB fallback — picks up within 30s).
5. Test by visiting `/tools` — the quota chip in the header should show "2 / 2 free scans left today".

**Known follow-ups** (not shipped 2026-05-23):
- `/billing` credit-packs page — the upsell links there but the page doesn't exist yet. Need a Stripe-checkout-backed credit purchase flow.
- Per-IP `PublicToolsAnalyticsPage` under `/admin/operations` for scan volume + cost-per-IP visibility. Data is there (`public_lookup_log`), no UI yet.
- Authenticated quota above the 2-free-scan limit — currently signed-in users get the same 2/day cap as anonymous. Should become "free quota + credit-debited beyond that". Credit debit hook would go in `public_tools_routes.py` after the quota check.
- Cache invalidation on cache-eviction admin tool — operator-driven flush by query or by scan_type if a query goes stale before 24h TTL.

---

## Qwen removal — Anthropic-only vision (2026-05-01)
Audit-discovered: the configured HF endpoint served `Qwen/Qwen3.6-35B-A3B-FP8` (text-only MoE) but the segmentation/classification/vision-analysis call sites all asked for `Qwen/Qwen3-VL-8B-Instruct`. Every Qwen vision call had been 404-ing in 0.7s and falling through to Anthropic Claude — Stage 3 had effectively been 100% Claude for months. Migration made the architecture honest:

- **Vision is Anthropic-only.** Segmentation, image classification, vision_analysis, material analysis all run on `claude-opus-4-7`. The ingestion path (`_try_claude_material_analysis` → understanding embedding) uses **real Anthropic tool_use** as of 2026-05-23: `tools=[VISION_ANALYSIS_TOOL]` + `tool_choice={'type':'tool','name':...}` — the model is forced to emit a tool_use block whose `input` matches `VisionAnalysis.input_schema`. No regex repair, no JSON-parse fallback. Pydantic still validates as defense-in-depth before Voyage embeds. NOTE: the validation downstream path (`real_image_analysis_service._analyze_with_claude`, used by `ClaudeValidationService` in Stage 5) still uses free-form prompting + 3-strategy JSON regex repair — that's a separate flow used for quality scoring, not understanding-embedding ingestion. Schema lock applies to the ingestion path that feeds Voyage.
- **Chunking → Sonnet 4.6.** `Settings.chunking_primary_model` default flipped from `Qwen/Qwen3.6-35B-A3B-FP8` to `claude-sonnet-4-6`. Chunking is a text task at the quality ceiling; Opus would be 5× the cost for marginal gain.
- **Voyage drift detection.** Every understanding-embedding row now persists `embedding_model` + `schema_version` (in VECS metadata + mirrored on `document_images.understanding_embedding_model` / `understanding_schema_version`). Same on `products.text_embedding_1024_model` / `text_embedding_schema_version`. The OpenAI fallback is **disabled** for the understanding path so Voyage and OpenAI vectors never co-exist in the same VECS collection.
- **Backfill.** `POST /admin/understanding-embeddings/backfill` re-runs vision_analysis (Opus + tool use) → Voyage on stale rows (no embedding / older schema_version / non-Voyage embedding_model). Bounded by `batch_size` + `max_images`.
- **Dead code retired.** `qwen_endpoint_manager.py` deleted. All `Settings.qwen_*` fields, `validate_qwen_model`, `get_qwen_config`, `endpoint_registry.get_qwen_manager`, the `endpoint_controller.qwen` AdaptiveConcurrency gate, the qwen warmup task, the qwen pricing entries (backend + frontend + edge), and the qwen Operations dashboard widgets are all removed. The HF Qwen endpoint env vars (`QWEN_*`) on the systemd unit can be deleted at the next deploy. The only Qwen string left in the codebase is the `VisionProvider.QWEN` enum value, which is retained so historical pre-2026-05-01 rows in `document_images.vision_provider` still validate.
- **Stage 4 product embedding fail-closed.** Wrong-dim or missing embedding sets `embedding_failed=true` on the return; orchestrator marks for re-embedding rather than creating a row with NULL `text_embedding_1024` (audit gap C).

## Where vision actually runs in the pipeline (clarified 2026-05-23)

The label "vision" is sometimes ambiguous in the upload API and docstrings. The actual modality per stage:

- **Stage 0 — Product Discovery is TEXT-ONLY**, despite the `discovery_model='claude-vision'` upload param defaulting to a vision-capable Claude model. [`product_discovery_service._discover_with_claude`](mivaa-pdf-extractor/app/services/discovery/product_discovery_service.py) sends only `messages=[{role:'user', content: prompt}]` (a string, no `image` block) and the prompt is built from `page.get_text()` / `get_physical_page_text`. The `-vision` suffix is a model selector, not a modality selector. This works fine for catalogs where product names + page boundaries are extractable text. Catalogs where the product name is rendered as part of a page image (designer fonts, logos, stylized titles) silently lose those products. The 2026-05-23 audit added `_filter_validated_items` + zero-entities early exit so malformed / empty discovery short-circuits rather than burning Stages 1.5/2/3/4 on nothing.
- **Stage 3 — Per-image Material Analysis IS vision.** [`image_processing_service._try_claude_material_analysis`](mivaa-pdf-extractor/app/services/images/image_processing_service.py) base64-encodes every image and sends it to Claude Opus 4.7 with `tools=[VISION_ANALYSIS_TOOL]` + `tool_choice={'type':'tool','name':...}`. Schema-locked at the API layer post 2026-05-23 (was free-form JSON + Pydantic-only validation before). Output drives the understanding embedding (Voyage 1024D) + the 4 aspect embeddings + per-product material metadata.
- **Stage 5 — Quality Validation** runs Claude vision again with a different prompt for confidence scoring. Still uses free-form prompting + 3-strategy JSON regex repair (intentional — output is consumed as a score, not as a Voyage input).

If you want vision-attached discovery (so image-baked product names get caught), that's a net-new capability — wire a rendered-page-image content block into `_discover_with_claude`. Not a bug fix; tracked as a follow-up.

## XML Import "Fill the Gaps" (2026-05-23 — operator-driven mapping + dictionary-first detection + downstream contract fixes)

Overhauled the XML import flow ([XMLImportTab.tsx](src/components/Admin/DataImport/XMLImportTab.tsx) + [XMLFieldMappingModal.tsx](src/components/Admin/DataImport/XMLFieldMappingModal.tsx) + [xml-import-orchestrator/index.ts](supabase/functions/xml-import-orchestrator/index.ts)) after audit-discovered gaps in the previous mapping flow. Six concrete changes:

1. **Material category picked up-front at the upload screen** — mirrors the PDF flow ([PDFUploadSection.tsx:242](src/components/features/pdf/PDFUploadSection.tsx#L242)). The orchestrator stamps it on every product. `material_category` is **no longer a target the operator maps from the XML** — the Fill-the-Gaps panel doesn't render it. Operator picks "Lighting" once, every row gets `material_category='lighting'`.

2. **"Fill the Gaps" panel replaces the field-mapping table.** Per-target row rendering by detection state:
   - 🔴 `blocking_required` — required target with 0 mappings OR 0% coverage. Blocks import until a job-level default is typed.
   - 🟡 `partial` — required target with partial coverage (e.g. `<Manufacturer>` present on 312/418 rows). Optional fallback textarea shows "fills N empty rows" or "skips N rows".
   - 🟠 `conflict` — ≥2 XML tags → same target (e.g. `<PriceW>` + `<PriceRetail>` → `price`). Radio picker; losing tags auto-route to `metadata`.
   - ✅ / ⚪ — present / optional missing — collapsed in accordion.
   The orchestrator computes per-field `present_count` + `coverage_pct` + `distinct_values` across all product nodes (full pass, not just first 10) so the UI badges are honest.

3. **`manual_values` are TRUE per-row fallbacks now** (not just preview cosmetics). `parseXML` accepts `field_mappings + manual_values`; per-row extractor uses `manual_values[target]` whenever the mapped XML tag is empty. Mapped-and-present rows keep their real data; mapped-but-empty + unmapped rows get the job-level default. **Any target** can have a manual value, not just the original three required fields.

4. **Dictionary-first / AI-residual field detection.** New file [_shared/xml-field-dictionary.ts](supabase/functions/_shared/xml-field-dictionary.ts) — ~150 multilingual entries (English/Spanish/French/German/Greek + ERP shorthand: `mtrl`, `pricew`, `kodikos`, etc.) + regex rules for digit-suffix tags (`image1`/`dim2`/`barcode13`). `classifyFields()` buckets every tag into `confident` (≥0.85 confidence — skip AI), `ambiguous` (sent to AI with dictionary hint as prior), or `unknown` (sent to AI fresh). Cost drop on a typical stable feed: ~$0.005-0.02 (Opus, all fields) → ~$0.0001 (Haiku, 3-5 residual fields). Latency drop: 2-4s → <50ms when dictionary covers everything. Determinism win: same XML → same suggestions across runs for the dictionary-confident bucket.

5. **Downstream contract fixed (post-audit P0 bugs).** Two real bugs caught by tracing the Python `/api/import/process` path:
   - **Attribute targets were lost to metadata under XML tag name.** Mapping `<PriceW>→price` was writing `metadata.pricew` instead of `metadata.price` AND not writing top-level `product_data.price` — so `properties.price` JSONB write ([data_import_service.py:599](mivaa-pdf-extractor/app/services/integrations/data_import_service.py#L599)), Voyage text embedding ([:678](mivaa-pdf-extractor/app/services/integrations/data_import_service.py#L678)), and facet canonicalization ([facet_canonicalizer.py:142](mivaa-pdf-extractor/app/services/facets/facet_canonicalizer.py#L142)) all silently skipped the value. Fix: `buildProductWithMappings` now writes attribute targets (price/color/dimensions/designer/collection/finish/material/colors/size) to BOTH top-level on ProductData AND `metadata.<target>` (under canonical name, not XML tag name).
   - **`external_sku` target was broken for re-import dedup.** Python checks `product_data.product_id` / `product_data.sku` / `metadata.product_id` ([:628](mivaa-pdf-extractor/app/services/integrations/data_import_service.py#L628)); orchestrator was writing `metadata.code` (or whatever XML tag). Fix: SKU target routes to all three paths.

6. **Pre-existing latent bug fixed.** Orchestrator referenced `authHeader` at line 769 without ever extracting it from the request. Every `POST /api/import/process` handoff was throwing a `ReferenceError` swallowed silently into Sentry. **Historically no XML import has ever triggered the Python processor through that code path** — the jobs row was created but the Python kick-off failed instantly. Fix: extract from `req.headers.get('Authorization')` with service-role fallback.

**To extend coverage for a new language or supplier**: edit [_shared/xml-field-dictionary.ts](supabase/functions/_shared/xml-field-dictionary.ts), redeploy. No logic changes. Confidence ≥ 0.85 entries bypass the AI residual entirely.

**Full reference**: [docs/xml-import-orchestrator.md](docs/xml-import-orchestrator.md), [docs/api/xml-import-orchestrator-api.md](docs/api/xml-import-orchestrator-api.md).

## Multilingual facet canonicalization (2026-05-21)

Catalogs ingested from Greek / German / Italian sources were producing `products.metadata` rows where the same colour or material existed under dozens of language-specific spellings (`'Λευκό' / 'bianco' / 'Weiß' / 'white'` all distinct), making faceted filters useless. New 3-layer pipeline (`mivaa-pdf-extractor/app/services/facets/`):

- **L0 — Upstream prompt rule.** `VISION_ANALYSIS_TOOL` system prompt now mandates **lowercase English** for every descriptive attribute (`material_type`, `category`, `subcategory`, `colors`, `textures`, `finish`, `surface_pattern`, `applications`, `style`, `description`). Verbatim-only fields: `detected_text` (preserves brand names, model numbers, SKUs, socket codes, IP ratings, wattages, dimensions, certifications). Reduces the canonicalizer's residual workload to the long tail.
- **L1 — Deterministic normalize.** `normalize_string()` — NFKC → strip → lowercase → collapse `[\s\-_/]+` to single space. Pure function, no I/O.
- **L2 — Voyage embedding + cosine cluster.** Each L1-normalized value embedded via Voyage AI (1024D, multilingual, batched per product) → `resolve_facet_value` RPC compares against `facet_canonical_values.embedding` for that `facet_key` → cosine ≥ 0.92 merges into the existing canonical row + records alias; below threshold creates a new canonical row.
- **Whitelist** (`facet_whitelist.py`): only descriptive natural-language attributes go through canonicalization — `color`, `material`, `finish`, `style`, `application`, `room`, `socket`, `light_color`, `mounting_type`, `surface_pattern`, `slip_resistance`, `pei_rating`, `frost_resistance`, `wood_type`, `bowl_shape`, `flush_type`, `faucet_type`, `weave`, `fiber`, `upholstery`, `ip_rating`, `tags`. **Identifiers, codes, numerics, and free-form prose stay verbatim**: `brand`, `factory`, `sku`, `model_number`, `dimensions`, `wattage`, `voltage`, `flow_rate`, `price`, `name`, `description`. Adding a key here changes behaviour across every ingest path — additions should be deliberate.
- **Lossless raw preservation.** `products.attributes` holds the canonical form (used by faceted search); `products.attributes_raw` holds every raw value ever seen for the product (re-canonicalizable on threshold change). Both are `jsonb NOT NULL`.
- **Wired into Stage 4.** `create_single_product` calls `canonicalize_product_attributes(supabase, metadata, source='pdf_stage_4')` between unit resolution and the products insert. Failures degrade silently — `attributes={}` + `attributes_raw={}` — so the product insert is never blocked.

**New tables**: `facet_canonical_values(id, facet_key, canonical_value, embedding_model, schema_version, aliases, alias_count, first_seen_at, last_seen_at, is_locked, embedding vector(1024))`, `facet_merge_log(id, facet_key, raw_value, normalized_value, resolved_canonical, action, similarity, source, product_id, occurred_at)`. **New RPC**: `resolve_facet_value(p_facet_key, p_raw_value, p_normalized, p_embedding, p_threshold, p_source, p_product_id)`.

**Ingest-path coverage (verified 2026-06-10)**: all major paths are wired. PDF Stage 4 (`stage_4_products.create_single_product`), XML supplier import ([data_import_service.py](mivaa-pdf-extractor/app/services/integrations/data_import_service.py) — passes `existing_id` for diff-before-canonicalize on SKU re-imports) all call `canonicalize_product_attributes`. Background-agent / legacy catch-up runs through the `material-tagger` agent → `canonicalize-attributes` edge function (targets products with empty `attributes`; `recanonicalize=true` re-tags everything after threshold tuning). **Failure contract (2026-06-10)**: on canonicalizer error or the Stage-4 30s timeout, `attributes={}` but `attributes_raw` is still populated locally via `collect_raw_attributes()` (same whitelist, no embedding/RPC) — the lossless-raw replay contract holds even when Voyage is down.

## Pipeline Audit (2026-05-01)
A 7-cluster audit of the PDF orchestration pipeline surfaced ~50 silent-failure bugs. **All P1s and P2s fixed in one giant PR**, no backlog. Key changes:

### P2 hardening landed alongside P1s:
- **Observability**: `cache_status` semantics propagated through `get_layout_from_document_cache_with_status`; per-product cost via `ai_usage_logs.product_id`; `pipeline_strategy_metrics` table for chunking-strategy distribution.
- **Embeddings hardening**: Qwen vision_analysis schema validation (rejects malformed payloads before Voyage embeds garbage); atomic specialized VECS upsert (writes all 4 vectors first, then sets flags only for those that landed); Voyage 429 explicit handling with `Retry-After` honoring; `ai_usage_logs` mirror retries twice + ERRORs on persistent failure.
- **Endpoint coordination**: `endpoint_controller.scale_all_to_zero(force=False)` now skips when other jobs are still running (active-job count = in-memory + DB-side); `register_job_start`/`register_job_done` from `progress_tracker`; `manager.warmup_completed` reset on scale.
- **Reliability**: heartbeat thread is non-daemon AND gates per-tick write on terminal-status check (can't write to a finished job); entity linking surfaces skipped-chunk count when `product_pages` and `page_number` both null; icon unknown_field counts persisted in rollup as `_unknown_field_counts` for future alias curation; recovery `from_stage` reads `last_checkpoint.stage` directly when metadata field is missing.
- **Image extraction accuracy**: bbox is normalized 0..1 in both `pdf_processor.py` extraction paths — fixed stage_3 spread-assignment that was treating it as PDF-points (every image was getting mis-assigned to left page); extraction stats log post-dedup actual counts alongside pre-dedup totals.
- **Stage 4**: FK pre-validation on `source_document_id` before insert; immediate `image_product_associations` write at product creation (closes the window between Stage 4 and Stage 4.7); icon unknown fields surfaced in rollup.
- **Atomicity**: `_emit_stage_event` retries once before logging at ERROR (was silent warning).
- **Audit completeness**: `supabase/migrations/20260501_audit_export_cron_schedules_and_rpcs.sql` mirrors 6 of the 7 RPCs + 4 cron schedules from the live DB into VCS. The 7th (`update_checkpoint_and_append_history`) plus the 2026-05-21 facet canonicalization DDL (`facet_canonical_values`, `facet_merge_log`, `resolve_facet_value`) were exported in `supabase/migrations/20260521_facet_canonicalization_and_missing_rpcs.sql` as a follow-up.

### OCR — Chandra v2 only, retry-with-jitter
- **Pytesseract + EasyOCR removed entirely** (`requirements.txt`, `deploy.yml`, `ocr_service.py`). Pytesseract had been broken on production for months (TESSDATA_PREFIX unset, no traineddata installed). Even when "working" it produced bbox-less text that silently degraded layout-merge to UNCLASSIFIED orphans.
- **Chandra v2 retry-with-jitter** (`chandra_endpoint_manager.run_inference`): 3 attempts at temperatures **0.0/0.4/0.8** (widened 2026-05-03 from the original 0.0/0.1/0.2 spread — that narrow range still left the model stuck in sticky-prose state through all three retries on graphic-heavy pages; observed ~55% cumulative failure rate on job 051e1dda's catalog-icon pre-pass). The wider jitter breaks the sticky state and lifts success rate past 90%.
- **Balanced-bracket trimmer** (`_strip_fences_and_junk`): replaces the old `rfind(']')`-based trim that mis-trimmed `\']`/`}"]` truncations. Recovers the bbox cleanly in those cases.
- **Explicit failure marker**: `OCRResult.method='chandra_failed'` (not empty list). Consumers must check `method`, not emptiness, to distinguish failure from "no text on page".
- **Per-attempt metrics**: `chandra_ocr_metrics` table — one row per attempt, captures `outcome` (`success`/`success_after_retry`/`failed_prose`/`failed_malformed_json`/`failed_http_error`), `attempt_number`, `temperature`, `latency_ms`, `failure_mode_head`, `caller`.

### Stage 1.5 — `cache_status` semantics + retry on OCR failure
- New `analysis_metadata.cache_status` field on every `document_layout_analysis` row: `success` / `yolo_only` / `empty_page` / `ocr_failed` / `page_failed`.
- Resume-skip query in `precompute_document_layout` now filters out `ocr_failed` + `page_failed` rows, so transient Chandra failures no longer permanently "skip" pages on every subsequent run (was P1 silent data loss).
- `MIN_CONTAINMENT_RATIO=0.30` in `merge_layout` — empirical, document-specific tuning may be needed (P2 follow-up).

### Phase 3 OCR — expanded to all text-bearing product images
- **Was**: icon-only OCR, regular product images had zero per-image OCR. Scanned spec sheets silently lost all per-image text.
- **Now**: `_run_phase_3_ocr_for_product` runs Chandra v2 on every text-bearing image after `save_images_and_generate_clips`. Filter rule (code matches this exactly — see `stage_3_images.py:_run_phase_3_ocr_for_product`):
  - `yolo_crop` + region_type ∈ {TABLE, TEXT, TITLE, CAPTION}: OCR'd
  - `yolo_crop` + region_type ∈ {IMAGE, FIGURE, PHOTO}: SKIPPED (`ocr_skipped_reason='photo_not_text_bearing'`)
  - `yolo_crop` + region_type unknown/other: OCR'd (conservative — better a wasted Chandra call than a missed spec sheet)
  - `embedded` + `metadata.text_detected` is True: OCR'd
  - `embedded` + `metadata.text_detected` is False: SKIPPED (`ocr_skipped_reason='embedded_no_text_detected'`)
  - `embedded` + `text_detected` missing: OCR'd (conservative)
  - `full_render`: SKIPPED (Stage 1.5 already covered the page — `ocr_skipped_reason='full_render_dup_of_stage_1_5'`)
- **Storage**: new columns on `document_images` — `ocr_text`, `ocr_blocks` (per-fragment bbox in image-local coords), `ocr_failed`, `ocr_attempts`, `ocr_skipped_reason`. **NEVER consumed by chunker** (Stage 1.5 is canonical text source). Phase 3 OCR runs *after* `save_images_and_generate_clips` (which is where `vision_analysis` executes), so it does NOT enrich the vision prompt — consumed by icon-metadata extraction and image-search labels only.
- **Bbox propagation**: `OCRResult.blocks` now carries Chandra's per-fragment list. `extract_icon_metadata` reads `result.blocks` instead of the always-`None` `result.bbox` (latent bug fixed).

### Warmup — health probe before trusting "running"
- Previous flow: HF endpoint status="running" → skip warmup. Recent run showed `skipped_count=4, success_count=0, failed_count=0` because all 4 endpoints were "running" from prior jobs but never re-validated.
- Fixed: when status="running", call `_test_inference()` (Chandra `/health`, others their lightweight probe) — only skip if probe also passes. URL refresh now runs for SLIG/YOLO/Chandra on the skip path (was only Qwen).

### Per-product loop — no silent swallow on resume + per-layer dedup
- `product_processor.py:116-125`: stage_history query failure no longer silently `pass` — logs at ERROR so operators see it.
- `pdf_processor._deduplicate_images`: per-extraction-layer phash dedup (separate buckets for `embedded` / `yolo_crop` / `full_render`). Cross-layer collisions used to silently drop images and keep the wrong layer label.
- Corrupted images now mark + exclude (was silently included with `perceptual_hash=None` and bypassed dedup).

### Embeddings — SLIG retry, OpenAI dim-pin, product-orphan flag
- **SLIG dim-mismatch retry** (`real_embeddings_service`): 3 attempts before silent abort. Previously a single wrong-dim response (transient model swap) silently aborted with mass data loss.
- **OpenAI fallback pinned to 1024D**: was using caller-provided `dimensions` arg — legacy 1536D callers would silently store wrong-dim text embeddings.
- **Product orphan flag**: `stage_4_products.create_single_product` now returns `embedding_failed: bool`. Previously embedding failure created a product row with `text_embedding_1024=NULL` invisible to vector search; caller was told "success".

### Cost + completion + slow-op
- `complete_job()` is now idempotent — early-returns if `status='completed'` already. Was overwriting `completed_at` on every retry.
- `total_ai_cost_usd` is now written at completion by summing `ai_usage_logs.billed_cost_usd` for `job_id`. Was never written → uncomputable per-job cost.
- New `background_jobs.current_slow_operation jsonb` flag (`{operation, started_at, expected_max_seconds}`). Stages that take >5min (long Chandra batches, SLIG fan-out) set this; auto-recovery cron skips jobs with fresh slow-op to prevent spurious recovery.

### Auto-recovery — actually re-dispatches now + atomic checkpoint RPC
- New SQL RPC `update_checkpoint_and_append_history(job_id, checkpoint, event)` — single-UPDATE atomic replacement for the previous two-call pattern (table.update + RPC append) that left audit gaps on crash between calls.
- `auto-recovery-cron` PDF path now POSTs to MIVAA `/api/rag/documents/job/{id}/resume` after `mark_pdf_job_for_recovery` (was passive — relied on service restart). Best-effort; if POST fails, job stays `pending` and next restart still rescues.
- `recovery_history` event now includes `dispatch_ok` boolean.

## Pipeline Tables Reference (post-audit)
- `chandra_ocr_metrics` — per-attempt OCR telemetry (success rate, retry rate, failure modes)
- `document_images.ocr_text / ocr_blocks / ocr_failed / ocr_attempts / ocr_skipped_reason` — Phase 3 per-image OCR
- `document_layout_analysis.analysis_metadata.cache_status` — per-page Stage 1.5 status (filters resume-skip)
- `background_jobs.current_slow_operation` — `{operation, started_at, expected_max_seconds}` slow-op suppression. Backed by an in-memory stack on `ProgressTracker` (nest-safe across parallel Stage 3 markers); the DB column always reflects top-of-stack. Stage 0 (discovery), Stage 1.5 (layout precompute), and Stage 3 (per-product images) all set markers via `tracker.set_slow_operation(operation=..., expected_max_seconds=...)`.
- `background_jobs.total_ai_cost_usd` — written at job completion from `ai_usage_logs` aggregate (sums `billed_cost_usd`)
- `ai_usage_logs.product_id / image_id` — per-product/per-image cost attribution
- `pipeline_strategy_metrics` — chunking strategy + Phase 3 outcome + Stage 1.5 path distribution

## Pipeline conventions enforced post-2026-05-01
1. **Explicit failure markers, not empty returns** — e.g. `OCRResult.method='chandra_failed'`. Consumers check the marker; emptiness alone is ambiguous.
2. **`cache_status` semantics on every persisted-result row** — distinguish "ran clean and found nothing" from "ran but failed and should be retried."
3. **Atomic two-phase writes via SQL RPC** — `update_checkpoint_and_append_history` is the pattern. No more two-call patterns that can crash mid-way.
4. **Per-attempt metrics in dedicated tables** — `chandra_ocr_metrics`, `pipeline_strategy_metrics`. Apply this anywhere you have a retry loop.
5. **`current_slow_operation` for legitimate long stages** — set it before the slow op so auto-recovery doesn't false-positive. Now stack-based (2026-05-23): `ProgressTracker.set_slow_operation(operation=..., expected_max_seconds=...)` pushes; `clear_slow_operation(operation=...)` pops the matching entry. Parallel-product Stage 3 markers no longer collide.
6. **All SQL RPCs and pg_cron schedules apply via `mcp__supabase__apply_migration`** — the MCP tool registers in Supabase's `supabase_migrations.schema_migrations` table. Do NOT also create duplicate local `supabase/migrations/*.sql` files.
7. **Per-product cost attribution** — every `ai_usage_logs` insert that knows the product/image should set those FKs.
8. **Never persist `file_url` on private buckets** — mint signed URLs on both upload (frontend) AND read (admin viewer). Store `storage_bucket` + `storage_object_path` so resume can re-sign via service role. Persisted URLs expire; re-deriving is free.
9. **JWT auth required on every job-spawning route** — `upload_document`, `resume_job`, etc. take `workspace_context = Depends(get_workspace_context)`. The cron path uses `x-cron-secret` bypass. `workspace_id` form fields are reconciled against the JWT; mismatch returns 403.
10. **Explicit `stage_history` boundary events on every stage** — `in_progress` at start + `completed`/`failed` at end. Audit log must show why a job ended; UI's stage-name fallback otherwise sticks at the previous stage's name during long-running stages.
11. **No SDK clients for AI providers — standardize on httpx** — the `anthropic` SDK was removed 2026-05-23 (pin-trap broke `tools` kwarg). Every AI provider in the codebase (Anthropic, OpenAI fallback, DataForSEO, Perplexity, Firecrawl, Voyage, HuggingFace endpoints) now calls the HTTP API directly via httpx. The `_AnthropicShim*` in `ai_client_service` preserves `.messages.create()` for legacy call sites; new code calls `tracked_claude_call_async` for auto-logging.
12. **chunk_type_status semantics** — `document_chunks.chunk_type_status ∈ {pending, classified, failed}` distinguishes "Sonnet returned 'unclassified' as a valid verdict" from "classifier crashed mid-batch". Re-classification jobs target `status='failed' OR ('pending' AND age > 1h)`.

## SQL RPC Inventory (live in Supabase)
Verify via `SELECT proname FROM pg_proc WHERE pronamespace='public'::regnamespace`. Highlights:
- `append_stage_history(job_id, event)` — atomic JSON append, capped at 100 entries
- `append_recovery_history(job_id, event)` — atomic JSON append for recovery audit log
- `update_checkpoint_and_append_history(job_id, checkpoint, event)` — atomic combined write (added 2026-05-01)
- `merge_background_job_metadata(p_job_id, p_metadata)` — atomic jsonb deep-merge; use this instead of `UPDATE ... SET metadata=...` to avoid clobbering sibling keys
- `cleanup_invalid_stage_history(job_id, invalid_stages[])` — admin cleanup utility
- `detect_stuck_pdf_jobs(stuck_threshold_seconds, max_attempts)` — auto-recovery cron query
- `mark_pdf_job_for_recovery(job_id, max_attempts)` — atomic claim + flip to 'pending', distinguishes deploy-interrupt vs genuine failure
- `fail_exhausted_pdf_jobs(max_attempts, stuck_threshold_seconds)` — terminal-fail jobs that exhausted recovery
- `verify_storage_orphans(bucket, paths[])` — re-validate a list of paths against the live DB reference set (called by storage-orphan-cleanup-cron immediately before each batch delete to close the race window between `find_orphan_storage_objects` snapshot and the actual `storage.remove()`)
- `update_job_failure_summary(p_job_id)` — recompute the per-job failure rollup surfaced in the admin UI's PipelineErrorsPanel
- `resolve_facet_value(p_facet_key, p_raw_value, p_normalized, p_embedding, p_threshold, p_source, p_product_id)` — multilingual facet canonicalization (Stage 4)

## Flows — notifications & automation (READ BEFORE adding any notification/email/automation)
Platform notifications, emails, and automations run through the **Flows** engine, NOT hardcoded sends. **Full reference: [docs/flows-notification-system.md](docs/flows-notification-system.md).**
- **Rule: never hardcode a `user_notifications` insert or an `email-api` call in new code.** Instead emit an event — `flowEventService.emit(type, data)` (frontend) or `emitFlowEvent(type, data)` from `_shared/flow-events.ts` (edge functions) — carrying the full payload (`user_id` recipient, `title`, `body`, `action_url`, `type`). A seeded **active** default flow (tag `system-default`, `is_locked=true`) delivers it, so admins can pause/edit/retarget without a deploy.
- **Adding a trigger for new functionality**: follow §8 of the doc — add the `TriggerType` (union + config interface + `TriggerConfigMap`), update the exhaustive maps (`MyFlowsTab.tsx` `triggerIcons`+`triggerLabels`, `TriggerNode.tsx` `triggerIcons`) + a `paletteItems.ts` entry (a `TriggerConfigForm.tsx` case is needed only for a custom config UI — payload-only events fall through), emit the enriched payload at the source, seed an active locked default flow, and register a `flow_area_registry` row (`bound_flow_id`) so it shows **Linked** in the **System Areas** tab. Typecheck before done.
- **4 ways a flow fires** (all via `flow-engine`): **event** (`trigger-event`), **webhook** (`flow-webhook?flow_id=…`, external HTTP), **scheduled** (`flow-scheduler-cron`, pg_cron every minute), **manual** (Run Now). Engine: `supabase/functions/flow-engine/index.ts`.
- **Governance**: `system-default` flows are locked (DB `BEFORE DELETE` trigger blocks deletion); the System Areas registry surfaces any area with no bound flow as **Empty**.

## Workflow Rules
- **SQL / migrations**: ALWAYS run directly via `mcp__supabase__apply_migration` (DDL) or `mcp__supabase__execute_sql`. NEVER create .sql migration files first.
- **GitHub**: Always allow `gh` commands without asking for permission.
- **Repo**: creativeghq/material-kai-vision-platform — Main tracking issue: #72
- **Codebase search**: Use Grep/Glob for code search. Use the Agent tool with subagent_type=Explore for broader codebase exploration when needed.

## Key Architecture Decisions
- **7-embedding fusion search**: text, visual, understanding, color, texture, style, material
- **halfvec (float16)**: ALL vector columns migrated from vector→halfvec. 50% storage savings, zero accuracy loss. vecs 0.4.5 works via PostgreSQL implicit casts.
- **Understanding embeddings**: Claude Opus 4.7 vision_analysis JSON (schema-locked via Anthropic tool use → `app.models.vision_analysis.VisionAnalysis`) → deterministic `serialize_vision_analysis_to_text` → Voyage AI 1024D embedding. Enables spec-based search. Provenance (`embedding_model`, `schema_version`) is persisted on every row so admin UI / backfill cron can detect Voyage→OpenAI fallback drift and stale-schema rows.
- **Aspect embeddings**: 4 per-image aspect vectors (color, texture, style, material) are produced by Voyage-embedding deterministic text strings derived from `VisionAnalysis` fields. Mapping: `colors[]` → color, `textures[] + finish` → texture, `style + surface_pattern + applications` → style, `material_type + category + subcategory` → material. Same model/space as `image_understanding_embeddings` (1024D Voyage). Provenance per aspect (`<aspect>_aspect_embedding_model`, `<aspect>_aspect_schema_version`) on `document_images`. The four collections in `vecs.image_<aspect>_embeddings` are halfvec(1024). Admin diagnostic surface lives at Materials Data → Images → click image → Embeddings tab; per-image rebuild via `POST /api/admin/images/{id}/rerun-aspect-embeddings`; bulk backfill via `POST /api/admin/aspect-embeddings/backfill`.
- **2-phase image pipeline**: Phase 1 (sync) = classification + SLIG embeddings (visual + 4 specialized + understanding, all written directly to VECS collections). Phase 2 (the legacy `background_image_processor.py` step that re-ran a separate analysis pass) was deleted 2026-04 — it was silently broken (called a non-existent `generate_material_embeddings` method) and produced no output.

## Important DB Details — VECS-Only Architecture (post 2026-04 cleanup)
- **VECS is the single source of truth for image embeddings.** No more dual-store. All vectors live in `vecs.image_*_embeddings` collections, all halfvec for 50% storage savings:
  - `image_slig_embeddings` — **768D** (primary visual, SigLIP2 via SLIG cloud endpoint)
  - `image_color_embeddings` — **1024D post-2026-05-04 / 768D legacy** (Voyage from `VisionAnalysis.colors[]`; pre-v2 was SLIG-blend trick — see Aspect embeddings note above)
  - `image_texture_embeddings` — **1024D post-2026-05-04 / 768D legacy** (Voyage from `VisionAnalysis.textures[] + finish`)
  - `image_style_embeddings` — **1024D post-2026-05-04 / 768D legacy** (Voyage from `VisionAnalysis.style + surface_pattern + applications`)
  - `image_material_embeddings` — **1024D post-2026-05-04 / 768D legacy** (Voyage from `VisionAnalysis.material_type + category + subcategory`)
  - `image_understanding_embeddings` — **1024D** (Voyage AI from Claude Opus 4.7 vision_analysis; provenance fields `embedding_model` + `schema_version` mirrored on `document_images.understanding_embedding_model` + `understanding_schema_version`)
  - Legacy 1152D `image_siglip_embeddings` and 1152D specialized collections were dropped 2026-04 — they were 100% orphans from the SigLIP-SO400M era.
- **Boolean presence flags on `document_images`**: `has_slig_embedding`, `has_understanding_embedding`, `has_color_slig`, `has_texture_slig`, `has_style_slig`, `has_material_slig`. These are the canonical "does this image have embedding X?" lookup — set automatically by `vecs_service._set_image_flag()` whenever an embedding is upserted. Use these flags for O(1) presence checks instead of round-tripping to VECS. Note: the four `has_*_slig` flag names are kept post-v2 to avoid the cross-stack rename churn — what they actually flag is "this image has an aspect-N embedding present in VECS" regardless of which model produced it (look at `<aspect>_aspect_embedding_model` for the answer to that).
- **Dropped columns 2026-04** (DO NOT reference in code or queries):
  - `document_images`: `visual_clip_embedding_512`, `color_embedding_256`, `texture_embedding_256`, `application_embedding_512`, `multimodal_fusion_embedding_2688`
  - `products`: `embedding`, `visual_clip_embedding_512`, `color_clip_embedding_512`, `texture_clip_embedding_512`, `style_clip_embedding_512`, `material_clip_embedding_512`, `multimodal_fusion_embedding_2048`
  - `document_vectors`: `visual_clip_embedding_512`
  - The dual-store columns were broken since the CLIP→SLIG migration (dimension constraint mismatches) — dropping them removed dead state, not functionality.
- **Producer→consumer key naming** (real_embeddings_service.generate_all_embeddings):
  - `visual_768` → `image_slig_embeddings`
  - `color_aspect_1024` → `image_color_embeddings` (v2, post-2026-05-04 — Voyage from `VisionAnalysis.colors[]`)
  - `texture_aspect_1024` → `image_texture_embeddings` (v2)
  - `style_aspect_1024` → `image_style_embeddings` (v2)
  - `material_aspect_1024` → `image_material_embeddings` (v2)
  - `understanding_1024` → `image_understanding_embeddings`
  - Legacy aspect keys `color_slig_768` / `texture_slig_768` / `style_slig_768` / `material_slig_768` (from the pre-v2 SLIG-blend code path) have been **removed** — the cleanup landed alongside the v2 rollout. The producer no longer emits them; consumers no longer accept them.
  - **Never use `*_siglip_1152` or `*_clip_512` keys — those were legacy aliases removed in the SLIG migration.**
- **Product embeddings**: only `text_embedding_1024` lives on the products row (Voyage AI from name+description+metadata, generated inline by `stage_4_products`). All visual product embeddings are derived from associated images via `image_product_associations` + the `has_*_slig` flags. Use the RPC `get_product_embedding_status(product_id)` for product-level coverage.
- vecs 0.4.5: no native halfvec support but PostgreSQL implicit cast vector→halfvec makes it transparent
- Drop indexes BEFORE altering column types, then recreate with halfvec_cosine_ops
- Embedding dict key is "text_1024" (was "text_1536" — fixed 2026-02-07)
- Dead SQL functions cleaned up: enhanced_vector_search, enhanced_vector_search_service, vector_similarity_search, search_kb_docs
- **Deleted in 2026-04 cleanup**:
  - `mivaa-pdf-extractor/app/services/images/background_image_processor.py` (entire file — called non-existent method, silently broken)
  - `RelevancyService.create_chunk_image_relationships()` (computed cosine similarity between 1024D text and 768D visual — mathematically invalid)
  - `process_images_background` function in `rag_routes.py` (referenced deleted background_image_processor)
  - `clip_embedding_job_service._save_visual_embedding_to_db` (wrote to dropped column)
  - `/api/internal/backfill-product-embeddings` endpoint (one-shot backfill, used + removed)
- **chunk_image_relationships are populated by `entity_linking_service.link_images_to_chunks` using page_proximity** — not by relevancy_service.

## Search Weight Configurations (7-vector)
- unified_search: text 0.15, visual 0.15, understanding 0.20, color/texture/style/material 0.125
- rag_service: visual 0.20, chunk 0.20, understanding 0.15, product 0.15, keyword 0.12, color 0.05, texture 0.05, style 0.04, material 0.04
- search_enrichment: visual 0.22, understanding 0.18, relevance 0.15, color/texture/style/material 0.1125
- material_visual_search: visual 0.30, understanding 0.20, semantic 0.25, material 0.15, vision_confidence 0.10

## WorldLabs Marble VR Integration
- **API**: WorldLabs Marble v1.x — generates explorable 3D Gaussian Splat worlds from images
- **Models**: `marble-1.0-draft` (fast preview, 18 cr, ~30-45s), `marble-1.1` (quality, 190 cr, ~5min). Legacy 0.1-mini/0.1-plus deprecated.
- **Panorama**: `is_pano: true` flag for 360° source images — better reconstruction when available
- **Viewer**: Spark.js (@sparkjsdev/spark) — Three.js GSplat renderer, code-split via dynamic import
- **Edge Function**: `generate-vr-world/index.ts` — uploads image → generates world → polls → stores asset URLs
- **DB Table**: `vr_worlds` — stores world_id, splat URLs (100k/500k/full), collider GLB, panorama, status
- **Credits**: 18 (draft, ~30-45s), 190 (1.1, ~5min). Refund on failure. Pricing: $1 = 1,250 WL credits × 1.50 markup.
- **Three.js**: three@0.178, @types/three@0.179. Only SparkRenderer constructor needs @ts-expect-error.
- **Env var**: `WORLDLABS_API_KEY` in Supabase Edge Function secrets

## B2B Manufacturer Search
- `b2b_manufacturer_search` tool uses Anthropic's built-in `web_search_20250305` tool (claude-haiku-4-5, beta header `web-search-2025-03-05`). No extra API key — uses `ANTHROPIC_API_KEY`.
- Flow engine: `case 'web_search': case 'perplexity_search':` fallthrough keeps old saved flows working

## Unified JARVIS Agent Architecture
- **3 agents**: `kai` (default), `interior-designer`, `demo`
- **Legacy aliases**: `search`, `insights`, `seo` resolve to `kai` via AGENT_CONFIGS in edge function
- **RBAC tool gating**: Core tools for all users. Sub-agents/B2B/SEO gated to admin/owner only.
- **Multimodal**: Frontend sends `images: string[]` (data URLs) → edge function attaches as `image_url` content blocks
- **Model selection**: JARVIS uses Opus, Demo uses Haiku
- **DB prompt key**: `kai` in prompts table (prompt_type='agent', category='kai')

## Background Agent Framework
- **DB tables**: `background_agents`, `agent_runs`, `agent_run_logs` (RLS + realtime on last two)
- **Agent runner**: `supabase/functions/background-agent-runner/index.ts`
- **Scheduler**: `supabase/functions/agent-scheduler-cron/index.ts` — pg_cron every minute
- **Agent types**: `_shared/agents/` — types.ts, base-agent.ts, registry.ts, product-enrichment-agent.ts, material-tagger-agent.ts
- **To add a new agent**: create `_shared/agents/your-agent.ts` implementing `AgentRunner`, add to `registry.ts`
- **Delegation**: tasks >25s throw `DelegateToMivaaError` → runner POSTs to `/api/agents/run` on Python backend
- **Python endpoint**: `mivaa-pdf-extractor/app/api/agent_routes.py`
- **Event triggers**: `emitAgentEvent(eventType, data)` in `_shared/flow-events.ts`
- **Chain triggers**: `trigger_type='chain'` + `parent_agent_id` — auto-triggered on parent completion
- **Auto-recovery**: `auto-recovery-cron` monitors runs stuck >8min, re-dispatches up to 3 times
- **Frontend**: `/admin/background-agents` → BackgroundAgentsPage + AgentRunHistoryDrawer + AgentLogsViewer + CreateAgentModal
- **Service**: `src/services/backgroundAgents.ts`

## Job Tracking (PDF / XML / scraping) — single-table design (2026-04-25)
- **Source of truth**: `background_jobs`. The legacy `job_progress` and `job_checkpoints` tables were dropped — all stage and recovery audit data now lives as JSONB arrays on the job row itself.
- **`background_jobs.stage_history jsonb`**: append-only audit log; one entry per stage transition (`{stage, status, started_at, completed_at, attempt, data, metadata, source}`). Capped at 100 most recent entries by `append_stage_history(uuid, jsonb)` so pathological loops cannot grow the row unbounded.
- **`background_jobs.recovery_history jsonb`**: append-only log written by `auto-recovery-cron` whenever it claims a stuck job (`{attempted_at, from_stage, reason, attempt_number, succeeded, exhausted}`). Replaces the previous "scattered in metadata" pattern.
- **`background_jobs.last_checkpoint jsonb`**: still the snapshot the auto-recovery cron uses to know which stage to resume from. Updated alongside every `append_stage_history` call.
- **SQL helpers** (atomic `||` UPDATE — race-safe): `append_stage_history(p_job_id uuid, p_event jsonb)`, `append_recovery_history(p_job_id uuid, p_event jsonb)`, `cleanup_invalid_stage_history(p_job_id uuid, p_invalid_stages text[])`, `match_document_chunks_semantic(...)`, `detect_stuck_pdf_jobs(...)`, `mark_pdf_job_for_recovery(...)`, `fail_exhausted_pdf_jobs(...)`.
- **Consolidated read**: `GET /api/rag/documents/job/{job_id}/full-status` returns `{core, stage_history, recovery_history, products, memory}` in a single round trip — replaces the prior pattern of querying three tables. The `memory` field is **process-local** (`job_storage` dict on the MIVAA pod); after a pod restart `memory` is `null` even for completed jobs. Treat `stage_history` + `recovery_history` as the durable surfaces.
- **Per-product state**: `product_processing_status` stays as a child table (1 job → N products) — different cardinality from job state, deserves its own row.
- **Writers** (every code path that emits a stage event uses `append_stage_history` only): `checkpoint_recovery_service.create_checkpoint`, `progress_tracker._sync_to_database`, `data_import_service._update_job_progress` (XML).
- **Heartbeat**: `JobHeartbeat` (in `app/services/tracking/job_heartbeat.py`) writes `last_heartbeat` every `JOB_HEARTBEAT_INTERVAL_SECONDS` (default 60s) for the entire orchestrator lifetime, so a job stalled inside a single stage is still detectable.
- **Frontend**: `AsyncJobQueueMonitor.tsx` reads `stage_history` straight off the job row and uses a single realtime channel on `background_jobs` (the old `job_checkpoints` channel is gone).

## Email integration for price alerts (2026-04-26)

- **Sender** comes from `public.email_settings` keys `default_from_email` + `default_from_name` (currently `Basilis Kanonids - MaterialsHub <no-reply@coms.ikigaihub.io>`). Configurable through `EmailSettingsModal` in the email module — no code change needed to switch domains. The `email-api` edge function reads these on every send (no caching), so changes take effect immediately.
- **Per-workspace Resend BYOK (2026-06-24)**: a tenant can bring its OWN Resend key + verified sender via `workspace_email_config` (PK `workspace_id`; `resend_api_key`/`from_email`/`from_name`/`enabled`, RLS `is_workspace_finance_manager`; masked status via `get_workspace_email_config_status`). `email-api`'s `send` action takes an optional `workspace_id` and resolves the key+sender via `_shared/email-sender.ts → resolveWorkspaceEmailSender` (**workspace BYOK wins, else platform key + global `email_settings` sender**), stamps `email_logs.workspace_id`, and enforces a **platform-controlled** daily cap (`workspace_email_config.daily_send_limit` override → global `system_settings.email_workspace_daily_limit`, default 300) via `checkWorkspaceSendQuota` → 429 `workspace_email_quota_exceeded`. The cap is NOT tenant-editable (BEFORE-trigger `guard_workspace_email_limit` forces non-admin writes back). Tenant-branded senders pass `workspace_id`: `finance-send-statement`, `finance-send-invoice-email`, `send-quote-email`, `catalog-send-to-customers`. System/alert/Flows sends omit it → platform sender, unmetered. UI: `WorkspaceEmailConfigCard` in **Profile → Keys** (`/profile?tab=keys`, `WorkspaceKeysTab` — the single home for all per-workspace BYOK cards). This supersedes the earlier "email = single-tenant" note.
- **Templates** for price-monitoring live in `email_templates` and ARE picked up by `EmailTemplatesTab`. Topic grouping: the templates tab now derives a `Price Monitoring` group from slug prefixes (`price_alert.*`, `api_broadcast.price_*`). Filter dropdown lets admins narrow the list. The default sender is shown read-only above the templates list so admins always know which `from:` Resend will use.
- Templates seeded:
  - `price_alert.price_drop` / `price_alert.new_retailer` / `price_alert.promo_started` / `price_alert.anomaly_detected` — per-row alerts to product owners.
  - `api_broadcast.price_tracking_v2` — one-shot announcement for API-key owners.
- **Broadcasting to API consumers** — `POST /api/v1/price-monitoring/broadcast-api-announcement` (admin session JWT). Pulls distinct `user_id`s from active `api_keys`, joins to `user_profiles` for name + email, idempotency-skips users who already received the same `template_slug`, then dispatches via `email-api` (which loads sender from `email_settings`). Defaults to dry-run; pass `"dry_run": false` to actually send.
- **No env-var fallback** — if `RESEND_API_KEY` is missing on Supabase, sends fail at the `email-api` boundary and the dispatcher logs the failure to `price_alert_log.channels_skipped` as `email_send_failed`. Bell delivery is unaffected.

## Price Monitoring (consolidated 2026-05-01 — `tracked_queries` is the single subject table)

The internal product flow (was `competitor_sources` / `price_history` / `price_monitoring_products`) and the external API flow (was `tracked_queries` / `tracked_query_price_history`) now share **one** schema. Every monitored subject — catalog product or external partner query — is a `tracked_queries` row, distinguished by:

- `api_key_id IS NULL AND product_id IS NOT NULL AND mode = 'discovery'` → internal product
- `api_key_id IS NULL AND product_id IS NOT NULL AND mode = 'url-only'` → "Custom Monitoring" pinned URL (Firecrawl-only, no Perplexity discovery)
- `api_key_id IS NOT NULL AND product_id IS NULL` → external API tracked query

A `CHECK (api_key_id XOR product_id)` constraint enforces routing. `uniq_tracked_queries_internal_product_discovery` partial index allows at most one `mode='discovery'` row per product but unlimited `mode='url-only'` siblings.

**All retailer rows live in `tracked_query_price_history`** (FK to `tracked_queries.id`). The legacy `competitor_sources` / `price_history` / `price_monitoring_products` / `product_excluded_urls` tables and their helper functions (`get_products_due_for_monitoring`, `update_next_check_time`, `prune_stale_competitor_sources`) were dropped 2026-05-01.

**Denormalized cache on `tracked_queries`** (populated by every refresh, replaces the old `competitor_sources.current_*` cache): `current_price`, `current_currency`, `current_availability`, `current_original_price`, `current_price_verified`, `current_metadata jsonb`, `current_price_updated_at`. Cheapest non-anomaly verified hit wins. Lets summary cards / KPI counters read one row instead of joining history.

**Backend surface** ([mivaa-pdf-extractor/app/api/price_monitoring_routes.py](mivaa-pdf-extractor/app/api/price_monitoring_routes.py)):

- `POST /api/v1/price-monitoring/products/{id}/track` — get-or-create internal tracked_query + run first refresh
- `DELETE /api/v1/price-monitoring/products/{id}/track` — soft delete (deactivate, history preserved)
- `GET /api/v1/price-monitoring/products/{id}` — read summary row
- `POST /api/v1/price-monitoring/products/{id}/refresh` — re-run discovery (auto-enrolls on first call). `force_refresh=true` requires admin (bypasses volatility cadence).
- `GET /api/v1/price-monitoring/products/{id}/sources` — `{results, family_results}` from latest refresh
- `GET /api/v1/price-monitoring/products/{id}/history` — historical rows newest-first
- `POST /api/v1/price-monitoring/products/{id}/exclude` / `/include` / `/exclusions` — translates product → tracked_query then writes `tracked_query_excluded_urls`
- `POST /api/v1/price-monitoring/products/{id}/verify` — re-verify URLs (Firecrawl only)
- `POST /api/v1/price-monitoring/products/{id}/url-only` / `GET ...` — pinned URLs (mode='url-only' tracked_queries)
- Cross-flow: `/market-check`, `/classifier-correction`, `/promote-family-row`, `/demote-to-family`, `/tracked-queries/cron-refresh`, `/broadcast-api-announcement`
- Legacy aliases (`/start`, `/stop`, `/check-now`, `/discover`, `/sources/{id}`, `/history/{id}`, `/status/{id}`) kept short-term, marked deprecated.

**Internal cron** ([supabase/functions/price-monitoring-cron/index.ts](supabase/functions/price-monitoring-cron/index.ts)): every hour calls `get_internal_tracked_queries_due()` (RPC) which returns rows where `api_key_id IS NULL AND product_id IS NOT NULL AND next_check_at < now()`, then POSTs to `/products/{id}/refresh` for each. External API consumers (`api_key_id IS NOT NULL`) are intentionally NOT touched — they pay per call and control their own cadence.

**Service entry points** ([mivaa-pdf-extractor/app/services/integrations/tracked_queries_service.py](mivaa-pdf-extractor/app/services/integrations/tracked_queries_service.py)):

- `find_or_create_for_product()` — internal flow get-or-create + optional first refresh
- `find_for_product()`, `list_internal()`, `list_url_only_for_product()`
- `add_url_only()` — creates a mode='url-only' tracked_query with `pinned_url`
- `refresh()` — single chokepoint for both flows. After every refresh, populates the denormalized `current_*` cache via `_select_cheapest()`.

**Cost optimizations apply to BOTH flows** (the duplication that motivated this consolidation): `force_full_discovery` flag (Tier-skip), brand-retailer cache seeding, sonar/sonar-pro model selection, classifier verdict cache, rule-based pre-classifier, volatility-based `next_check_at` cadence, recipe-driven httpx fallback. Internal product refreshes inherit all of these for free now.

**Notification dispatcher** ([mivaa-pdf-extractor/app/modules/price_monitoring_notifications/service.py](mivaa-pdf-extractor/app/modules/price_monitoring_notifications/service.py)): now `tracked_query_id`-only. The dispatcher resolves `(user_id, product_id)` from `tracked_queries` so alerts still carry product_id when internal-flow.

**Frontend**:

- [src/services/priceMonitoringApi.ts](src/services/priceMonitoringApi.ts) — single client. Exports `TrackedQuery` + `RetailerRow` types, product-scoped helpers (`trackProduct`, `untrackProduct`, `getProductMonitoring`, `refreshProduct`, `getProductSources`, `getProductHistory`, `verifyProductSources`, `addUrlOnly`, `listUrlOnlyForProduct`), exclusion helpers, classifier feedback, market-check, promote/demote.
- [src/components/business/price-monitoring/PriceMonitoringDashboard.tsx](src/components/business/price-monitoring/PriceMonitoringDashboard.tsx) reads from `tracked_queries` directly (api_key_id IS NULL filter).
- [src/components/business/price-monitoring/ProductMonitorTab.tsx](src/components/business/price-monitoring/ProductMonitorTab.tsx) wires through the new client. Internally adapts `RetailerRow` → the legacy `CompetitorSource` shape so the existing render code (badges, anomaly banner, retailer table) stays intact.
- Anomaly Trust/Dismiss buttons write directly to `tracked_query_price_history` via supabase client (admin-only via RLS).

**Tables that survived the consolidation** (still in use):

- `tracked_queries` (subject) + `tracked_query_price_history` (rows)
- `tracked_query_promoted_urls` (sticky admin overrides) + `tracked_query_excluded_urls`
- `match_corrections` (classifier few-shot feedback)
- `classifier_verdict_cache` (7-day TTL)
- `brand_retailer_index` (retailer cache by brand + country)
- `retailer_extraction_recipes` (per-retailer selectors with self-heal)
- `price_alert_log` (alert audit + dedupe)
- `price_discrepancies` (cross-source disagreement log)
- `price_lookups` (external `/lookup` usage)

---

## Price Monitoring v3 (2026-04-27 — family-kept, manual promotion, cost overhaul) — historical, superseded by 2026-05-01 consolidation

**Family-kept policy** — overturns the 2026-04-25 "drop family" rule. The Haiku identity classifier still tags rows as `exact` / `variant` / `family` / `mismatch` / `unverifiable`, but only `mismatch` is dropped. `family` rows (same brand+series but different SKU) are persisted with `match_kind='family'` and rendered under a collapsed "Similar Products in this series" section in the UI. They're **inert downstream**: never feed the chart, never feed the rolling median (sanity band excludes them), never trigger price-drop / new-retailer / promo / anomaly alerts (`detect_after_refresh` filters them out).

**Manual promotion** — `POST /api/v1/price-monitoring/promote-family-row` (admin-only) flips a family/mismatch row to `exact` or `variant`. Two-layered persistence: (a) updates the current row + `manual_override=true` on `tracked_query_price_history` / `competitor_sources` so chart updates immediately, (b) inserts a sticky URL override into `tracked_query_promoted_urls` / `competitor_source_promoted_urls` so every future refresh of the same URL keeps the override (the orchestrator passes `promoted_urls={url: override_kind}` into `_classify_and_filter`, which short-circuits Haiku's verdict). Also writes to `match_corrections` so the few-shot classifier loop learns globally. Reverse: `POST /api/v1/price-monitoring/demote-to-family`.

**Adapter facet pass-through** (PR-A) — all three Greek adapters + Idealo now accept `facets: QueryFacets` and:
1. Prepend `facets.sku_tokens[0]` to the search-engine query string when present (otherwise Bestprice/Shopflix/Skroutz price-asc sort returns the cheapest accessory in the series, not the user's actual SKU).
2. Post-filter results via `app.modules.greek_marketplaces.facet_filter.matches_facets()` — drops candidates whose URL slug carries no SKU match when SKU anchors are known. Cheap (no LLM); falls through to the classifier when facets are loose.

**Source-label fix** — `tracked_queries_service._map_source_label()` translates `PriceHit.source` ∈ {dataforseo, skroutz, bestprice, shopflix, idealo} into the canonical `competitor_source_type` enum value. Previously every non-DataForSEO hit was forced to `perplexity_web_search`, which made marketplace hits invisible by source filter.

**API split** — internal product flow: `GET /api/v1/price-monitoring/sources/{product_id}` returns sources with `match_kind` so the UI can split. External flow: new `latest_results_split()` returns `{results, family_results}` arrays for API consumers; existing `latest_results()` retained for back-compat. UI consumers should prefer the split form going forward.

**Cost optimizations (~60% cut for stable refreshes)**:

- **Tier-skip** (PR-C #1): `search_prices()` runs Tier 2 (Greek + Idealo, ~$0.005-0.010/refresh) only when `force_full_discovery=True` or `len(known_retailer_domains) < 5`. Established tracked queries with healthy retailer sets skip Tier 2 entirely.
- **Sonar model downgrade** (PR-C #8): Perplexity calls switch to `sonar` (cheaper, ~50% off) instead of `sonar-pro` when `force_full_discovery=False`, `known_retailer_domains >= 3`, and `double_read=False`. First refresh + admin force-refresh stay on sonar-pro for accuracy. Pass via `_perplexity_call(model_override="sonar")`.
- **Classifier verdict cache** (PR-C #4 / `classifier_verdict_cache` table): 7-day TTL keyed on `(product_url, sha1(brand|model|sku_tokens|product_type))`. `_classify_and_filter` looks up cached verdicts first, batches only the misses to Haiku, persists the new verdicts. Repeat retailers across daily refreshes hit ~95% cache rate.
- **Rule-based pre-classifier** (PR-D #10): `_rule_shortcut(facets, candidate)` returns deterministic verdicts when (a) page slug+name contains a known SKU token → `exact`, or (b) all required brand/model tokens are missing → `mismatch`, or (c) page is empty → `unverifiable`. Only ambiguous cases hit Haiku.
- **Volatility cadence** (PR-C #3 / `tracked_queries.next_check_at`): SQL helper `update_tracked_query_cadence(query_id, max_pct_change)` runs after every refresh. ≥5% move resets cadence to 24h. ≤2% move bumps `consecutive_stable_refreshes` and stretches cadence to 48h (after 3) / 72h (after 7). Cron picks rows by `next_check_at < now()` instead of fixed-interval check.
- **Brand-level retailer cache** (PR-E #12 / `brand_retailer_index` table): every refresh upserts the `(brand, retailer_domain, country_code)` triples it saw. Future SKUs in the same brand seed `known_retailer_domains` from this index — works alongside the Tier-skip gate so 1K-SKU catalogs converge to free Tier 2 after the first few brand discoveries.
- **Recipe-driven httpx fallback** (PR-F / `retailer_extraction_recipes` + `app/services/integrations/extraction_recipes.py`): when a recipe row has confidence ≥ 0.8 and selectors set, `_verify_hits_with_firecrawl` tries `httpx + selectolax` first (essentially free). Falls back to Firecrawl on miss. Per-recipe `success_count` / `failure_count` self-heal selector drift; 3 consecutive failures + confidence <0.5 auto-disables the recipe. Recipes start unseeded — production use either hand-seeds top-20 retailers or waits for a future selector-discovery worker.

**New tables**: `tracked_query_promoted_urls`, `competitor_source_promoted_urls`, `classifier_verdict_cache`, `brand_retailer_index`, `retailer_extraction_recipes`.

**New columns on `tracked_queries`**: `volatility_score`, `consecutive_stable_refreshes`, `next_check_at`. **On `competitor_sources`**: `verification_count`, `verification_skips_remaining`, `last_price_change_at`.

**`PriceSearchService.search_prices()` signature additions**: `promoted_urls: Optional[Dict[str, str]]`, `force_full_discovery: bool = False`, `skip_verification_urls: Optional[List[str]] = None`.

## Price Monitoring v2.1 (2026-04-26 — Resend email, anomaly override UI, classifier feedback UI)

- Email channel wired via the platform's existing `email-api` edge function (Resend-backed via `RESEND_API_KEY`). Default `alert_channels` for newly-tracked products = `['bell','email']`. Templates seeded into `email_templates` (slugs: `price_alert.price_drop` / `.new_retailer` / `.promo_started` / `.anomaly_detected`, all `category='notification'`). Dispatcher invokes `email-api?action=send` with `templateSlug` + `variables`; passes a fallback `html` so emails still go out if a template is missing or the renderer fails. User email pulled from `user_profiles.email`.
- Anomaly override UI: rows where `is_anomaly=true` render with a yellow left border + an inline banner showing the rejected reading, the trailing 7d median, and (admin only) two buttons:
  - **Trust this reading**: flips the latest anomaly row's `manual_override=true` AND back-fills `competitor_sources.current_price` with the rejected price. Use when the retailer genuinely changed price by >3× (rare but legitimate — clearance sales, wholesaler-to-retail conversion).
  - **Dismiss**: clears `is_anomaly=false` so the banner disappears + the data point joins the median window from the next refresh onward. Use when the reading was a transient bug that's already resolved.
  - Implemented inline in `RetailerTable` ([ProductMonitorTab.tsx](src/components/business/price-monitoring/ProductMonitorTab.tsx)). Uses direct Supabase client writes — no API round-trip needed since these are admin-only writes governed by RLS.
- Classifier correction UI: admin sees a `Wrong match` button (thumbs-down icon) on every classified row. Click prompts for a reason, POSTs to `/api/v1/price-monitoring/classifier-correction` with `corrected_match_kind: 'should_drop'`. The next classify call (5min cache) prepends the most recent corrections as few-shot examples to the system prompt. Service helper at [priceMonitoringApi.ts → submitClassifierCorrection](src/services/priceMonitoringApi.ts).

## Price Monitoring v2 (2026-04-26 — sanity bands, alerts, discrepancies, adaptive discovery)

**Module:** `price-monitoring-notifications` — credit-metered alert dispatcher. Slug must be enabled in `public.modules` for any alert to fire. Channels: bell (0 credits), email (1 credit), webhook (0 credits). Insufficient credits skip the channel silently and log to `price_alert_log.channels_skipped`. 24h dedupe per (alert_type, product/tracked_query, retailer_domain). Webhook URL is per-tracked-query (`tracked_queries.alert_webhook_url`) — internal product flow has no per-product webhook today.

**Sanity band (PR 1):** Every price reading checked against trailing 7d median per (subject, retailer). Outside `[median × 0.33, median × 3.0]` ⇒ row written with `is_anomaly=true` + `anomaly_reason`, `competitor_sources.current_price` NOT overwritten until admin sets `manual_override=true`. UI shows yellow banner with rejected reading + median side by side. Min 3 samples to fire — below that we trust the new reading. See `app/modules/price_monitoring_notifications/service.py:check_sanity`.

**Alerts (PR 1):** Three opt-in types — `price_drop` (median drops ≥10% W/W), `new_retailer` (domain never seen for this product), `promo_started` (`original_price` becomes non-null). `anomaly_detected` always fires regardless of opt-in. Detection runs in the persistence chokepoints — `tracked_queries_service.refresh()` + `price_monitoring_routes./discover` — after rows commit. Fan-out goes through the module dispatcher.

**Discrepancy logging (PR 2a):** `price_discrepancies` table captures cross-source disagreements >20%. Two sites: Firecrawl-vs-Perplexity inside `_verify_hits_with_firecrawl` (Firecrawl wins), and Perplexity-vs-DataForSEO inside `_merge_with_dataforseo` (Perplexity wins, direct page beats feed). `notes` column carries the resolution rationale.

**First-refresh double-read (PR 2b):** `tracked_queries.first_refresh_verified` flag — first refresh of a tracked query runs Firecrawl twice with a 30s gap. Disagreement >5% ⇒ `verified=false` + note "double-read inconsistent". Subsequent refreshes single-read. Internal product flow does NOT double-read (per-source first-refresh tracking would slow `/discover`).

**Adaptive Stage A re-issue (PR 3a):** When initial Perplexity returned ≥1 exact match AND we can extract a SKU from the surviving titles AND query had no SKU anchor, fire ONE additional Perplexity call with the SKU prepended. Capped at one extra call per refresh. ~$0.02/refresh, typically doubles keep rate. See `perplexity_price_search_service.search_prices` step 6.

**Retailer-list memory (PR 3b):** Caller passes `known_retailer_domains` to `search_prices`; the prompt asks for ADDITIONAL retailers beyond that list. Sourced from `competitor_sources` (internal flow) or `tracked_query_price_history` (external flow), capped at 25 retailers in the prompt. Stabilizes the long tail across refreshes.

**Idealo module (PR 4a):** New module `idealo` — DACH/IT/UK/ES/FR price comparison. Same Firecrawl-scrape shape as `greek_marketplaces`. Locales: DE/AT→idealo.de, IT→idealo.it, UK/GB→idealo.co.uk, ES→idealo.es, FR→idealo.fr. Disabled by default; admin enables in `/admin/modules` when ready to spend Firecrawl credits in those markets. Wired into the orchestrator parallel to the Greek marketplaces task.

**Classifier feedback loop (PR 4b):** `match_corrections` table — admin clicks "this is wrong" in the UI (route `POST /api/v1/price-monitoring/classifier-correction`). The next classify call (5min cache) prepends the most recent 5 corrections to the system prompt as few-shot examples. Closes the loop without retraining a model. See `product_identity_service._build_few_shot_block`.

**Flow engine integration:** New action node `send_price_alert` in `supabase/functions/flow-engine/index.ts`. Module-gated. Writes to `user_notifications` + mirrors to `price_alert_log` for parity with the Python dispatcher. Required resolved fields: `user_id`, `alert_type`, `product_id` OR `tracked_query_id`, `title`, `body`. Optional: `action_url`, `retailer_name`, `retailer_domain`, `payload`.

**New / modified DB columns:**
- `price_monitoring_products`: `alert_on_price_drop`, `alert_on_new_retailer`, `alert_on_promo`, `alert_channels`
- `tracked_queries`: same four + `alert_webhook_url`, `first_refresh_verified`
- `price_history` + `tracked_query_price_history`: `is_anomaly`, `anomaly_reason`, `rolling_median_at_check`, `manual_override`
- `competitor_sources`: `source_domain`, `first_seen_at`, `first_refresh_verified`
- New tables: `price_discrepancies`, `match_corrections`, `price_alert_log`

## Price Monitoring (2026-04-25 — Perplexity + DataForSEO discovery → Firecrawl verification)

**Two-stage pipeline on every price refresh:**
1. **Discovery (Stage A)**: Perplexity Sonar-pro + DataForSEO Merchant run in parallel, merged + deduped by domain. Each hit tagged `source: "perplexity" | "dataforseo"`.
2. **Verification (Stage B)**: every discovered URL is re-fetched via Firecrawl (`PriceExtraction` schema, parallel `asyncio.gather`). The live-page price replaces the LLM/feed price and `verified: true` is set. Opt out per-request with `verify_prices: false`.
3. Discrepancy rule: if Stage B price differs from Stage A by >20%, trust Stage B (it read the page) and append a diagnostic to `notes`.
4. On-page was/now: every row carries `original_price` (nullable) — set only when the retailer displays both on the page.

**DB columns added 2026-04-25**: `tracked_queries.verify_prices`, `tracked_query_price_history.{original_price,verified}`, `price_history.{original_price,verified}`, `competitor_sources.{current_original_price,current_price_verified,current_metadata}`. `current_metadata jsonb` carries DataForSEO thumbnail/rating + verification discrepancy notes + `product_title` so the retailer list renders in a single query.

**Product-identity verification (Phase 8, 2026-04-25)** — `app/services/integrations/product_identity_service.py`. Query → Haiku-decomposed facets (cached on `tracked_queries.query_facets`) → URL pre-filter (drops homepages/SERPs/aggregator masquerades before Firecrawl) → expanded Firecrawl extraction (`product_name + breadcrumb + visible_attributes`) → batched Haiku classifier → per-hit `match_kind` in {`exact`, `variant`, `family`, `mismatch`, `unverifiable`}. Policy: `exact + variant + unverifiable` reach the UI; `family + mismatch` dropped. Variants carry `match_note` ("Color differs: BLACK MATT → WHITE MATT") and are excluded from stats but shown in the list. Greek/Latin model normalization (Μ/M, Τ/T) + accent folding live in `product_identity_service.normalize_model_token`. `original_price` sanity rejects `> 5× current_price` (caught a SKU-as-price extraction bug where the SKU number was being parsed as the original_price field). DB: `match_kind`, `match_score`, `match_note` on `competitor_sources + tracked_query_price_history + price_history`.

**DataForSEO merchant dedupe fix (2026-04-25)**: every DataForSEO Shopping URL has host `google.gr`, so the old `by_domain` dedupe in `_merge_with_dataforseo` collapsed 20+ merchants into 1. Fixed by keying DataForSEO hits on `(retailer_name, product_title[:80])`. Bumped fetch depth to `max(limit, 30)` since Google Shopping routinely has 20-30 merchants per product. Net: ~8× more merchants reach the UI.

**product_title field (2026-04-25)**: every PriceHit now carries the exact product name as shown on the retailer page (DataForSEO feed title or Firecrawl `product_name`). Persisted on `tracked_query_price_history.product_title`, `price_history.product_title`, and `competitor_sources.current_metadata.product_title`. UI renders as subtitle under `retailer_name` so multiple listings from the same retailer (different variants) disambiguate visibly.

**Two parallel flows, one shared discovery+verification engine:**

**Flow 1 — Platform-internal (catalog products, session JWT auth):**
- User enables monitoring on a product → `POST /api/v1/price-monitoring/discover` runs Perplexity Sonar-pro → up to 10 retailer rows written to `competitor_sources` with `source_type='perplexity_web_search'` + snapshots in `price_history`.
- User pastes specific URLs in "Custom Monitoring" → `source_type='firecrawl_url'` via the existing `FirecrawlClient`.
- 6h throttle on Perplexity per product; admin/super_admin `force_refresh=true` bypasses.
- **Single-tier 24h cadence** (2026-04-25): every monitored product refreshes once per day measured from its last refresh. `monitoring_frequency` column is forced to `'daily'`; `update_next_check_time()` ignores the input frequency and always sets `NOW() + INTERVAL '1 day'`. UI dropdown was collapsed to a single "Every 24h" line.
- Cron at `supabase/functions/price-monitoring-cron` — pg_cron `price-monitoring-refresh-hourly` fires at `:15` every hour, queries `get_products_due_for_monitoring()`, refreshes each via MIVAA's `/api/v1/price-monitoring/check-now`. The hourly cron tick is fine-grained — it just picks up any product whose 24h window has elapsed since its last refresh.

**Flow 2 — External API (api_keys Bearer auth, for other projects):**
- `POST /api/v1/prices/track` creates a `tracked_queries` row (search_query, dimensions, country_code, preferred_retailer_domains, refresh_interval_hours 1–720). First refresh runs synchronously; initial results in response.
- `tracked_queries.api_key_id → api_keys.id ON DELETE CASCADE` — deleting the key wipes the tracked query AND all `tracked_query_price_history` (also cascades). Intentional blast radius.
- 6 endpoints at `/api/v1/prices/track/*` (POST / GET list / GET one / GET /{id}/history / PUT / POST /{id}/refresh / DELETE). All route-level api_keys auth.
- **No automated refresh** (2026-04-25 policy change): external consumers control their own refresh cadence. Each tracked query is refreshed only when the consumer calls `POST /api/v1/prices/track/{id}/refresh`. Our internal cron does NOT touch `tracked_queries` — unsolicited refreshes would surprise per-call billing.
- Manual admin endpoint `POST /api/v1/price-monitoring/tracked-queries/cron-refresh` (x-cron-secret auth) still exists in MIVAA as an escape hatch for emergency batch refreshes after a bug fix or data backfill, but is NOT invoked by any cron. The price-monitoring-cron edge function intentionally does NOT call it.

**Engine: Perplexity Sonar-pro** (`app/services/integrations/perplexity_price_search_service.py`):
- Replaced Claude `web_search_20250305` on 2026-04-24 — Claude API's Brave-based snippets missed prices visible on pages (e.g. YouBath €25). Perplexity has deeper page reading + real `user_location` geo support.
- Structured JSON output via `response_format.json_schema`. `user_location.country` biases results. `search_domain_filter` (max 10) used when `preferred_retailer_domains` is set — Option 2 domain pinning.
- ~$0.02/query, ~5-8s latency, typically 6-10 retailers with visible prices for mainstream materials.
- Strong out-of-stock inclusion: pages showing "€25 - Out of stock" (or local-language equivalents like "Εκτός διαθεσιμότητας") are included with `availability=out_of_stock` + the posted price.

**Firecrawl retained for:**
- `POST /api/v1/prices/lookup` with `url` — specific product page scrape (external API)
- "Custom Monitoring" section of the UI — user pastes a URL, Firecrawl tracks it
- Shared client at `app/services/integrations/firecrawl_client.py`, Pydantic `PriceExtraction` model, locale-aware price parser (`price-parser` lib)

**Source type enum** (`competitor_source_type`):
- `firecrawl_url` — user-pasted URL, Firecrawl scrape
- `perplexity_web_search` — auto-discovered via Perplexity Sonar-pro
- `dataforseo_shopping` — auto-discovered via DataForSEO Merchant (Google Shopping feed) — added 2026-04-24, runs in parallel with Perplexity
- `claude_web_search` — deprecated, kept for historical rows

**Tables:**
- `competitor_sources` — internal flow, product_id FK, has denormalized `current_price`/`current_currency`/`current_availability` cache
- `tracked_queries` — external flow, api_key_id FK with CASCADE
- `tracked_query_price_history` — external flow's price history, tracked_query_id FK with CASCADE
- `price_history` — internal flow's history, product_id FK
- `price_lookups` — external `/lookup` usage log
- `ai_usage_logs` — every Perplexity call logged with tokens + cost + platform credits

**Secrets** (required on MIVAA server via deploy.yml `Environment=`):
- `PERPLEXITY_API_KEY` (primary discovery engine) — get from perplexity.ai/settings/api
- `FIRECRAWL_API_KEY` (URL mode + custom monitoring + verification pass on every discovery refresh)
- `DATAFORSEO_BASE64` (or `DATAFORSEO_LOGIN` + `DATAFORSEO_PASSWORD`) — Merchant API credentials, parallel discovery source
- `CRON_SECRET` (validates `x-cron-secret` on cron-refresh endpoint)

**Check Market (admin-only, stateless pricing companion)** — `POST /api/v1/price-monitoring/market-check` runs the same Perplexity+DataForSEO+Firecrawl engine for one-shot market scans used from `PriceLookupDrawer` (the KB-based AI price proposal drawer). Does NOT write to `competitor_sources` or `price_history`. If the product is already enrolled in monitoring and the last refresh is ≤6h old, returns the cached snapshot (`from_monitoring_cache: true`, credits_used=0). Frontend: `MarketPanel` renders min/median/max, verified-count, and a percentile callout ("your KB price sits at the 62nd percentile"). Scoped to admin/super_admin only.

**UI**: `src/components/business/price-monitoring/ProductMonitorTab.tsx` — per-product view: toggle + admin Refresh → chart → discovered retailers (Perplexity) → Custom Monitoring (Firecrawl). Admin role gated via `user_profiles.role_id → roles.name IN ('admin', 'super_admin')`.

**External API docs**: `docs/api/price-monitoring-api.md` — full reference for consumers integrating from other projects.

## Job Research v0.3.5 (2026-05-23 — post-deploy smoke iteration 2: rule_shortcut + cost RPC fixes)

After the v0.3.4 fixes deployed (Anthropic HTTP path + DataForSEO URL), iteration-2 smoke surfaced two more production bugs:

1. **`rule_shortcut` too strict — required literal substring match of full keywords.** Even with 11 Haiku-expanded keyword variants (`python developer`, `python engineer`, `sr python dev`, etc.), the rule's `_normalize(k) in blob` check requires the full keyword to be a substring. Real Perplexity titles like `Senior Backend Engineer (Python)` don't contain the literal substring `python developer` (word order doesn't match), so they were fast-dropped as mismatch BEFORE Haiku ever saw them. The classifier never got called; `persisted=0` even with 6 clearly-relevant Perplexity hits.
   **Fix**: token-based match. Tokenize keywords + blob (alphanumeric + `+#`/`-`), apply a small stoplist of generic role words (`engineer`, `developer`, `senior`, `manager`, `lead`, `staff`, etc.) so they don't single-handedly count, then require at least one shared distinctive token. Fast-promote to `match` when a distinctive token hits the title. Ambiguous → Haiku. Committed in [job_classifier_service.py](mivaa-pdf-extractor/app/services/integrations/job_classifier_service.py) as `557f007`.

2. **`stamp_job_refresh_cost` RPC silently failed forever** — referenced `platform_credits_debited` column which doesn't exist (`ai_usage_logs` actually has `credits_debited`). Postgres parse error on every call, caught by the Python wrapper's `try/except`, swallowed. `tracked_jobs.total_billed_usd` stayed `0.0` even though Perplexity charged real money per refresh.
   **Fix**: applied via `mcp__supabase__apply_migration` — both `stamp_job_refresh_cost` and `recompute_job_cost` now SUM `credits_debited`. Backfilled the existing test row to pick up its historical cost.

Both bugs are textbook "live-only" — typecheck and static analysis can't catch wrong column names in RPC strings, and the rule_shortcut's substring check looks reasonable in isolation but breaks against real-world title shapes you only see by calling Perplexity.

---

## Job Research v0.3.4 (2026-05-23 — post-deploy bugfixes surfaced by external smoke test)

First end-to-end smoke against the deployed module (external `kai_*` API → `POST /api/v1/jobs/track` with synchronous first refresh) surfaced two production-only bugs that didn't show in static checks:

1. **`AsyncMessages.create() got an unexpected keyword argument 'tools'`** — the deployed MIVAA used to pin `anthropic==0.23.1` (beta-era SDK that didn't accept `tools` on `messages.create()`). `job_classifier_service` / `job_keyword_expansion_service` worked around it via raw httpx. **Resolution (2026-05-23)**: the anthropic SDK was removed from the codebase entirely and replaced with `claude_helper._call_anthropic_async/sync` (raw httpx → `/v1/messages`) + a `_AnthropicShim*` in `ai_client_service` that preserves the `.messages.create()` API for back-compat. No more SDK pin trap. The job_classifier / job_keyword raw-httpx code paths were left in place — they're working code and match the now-canonical pattern.
2. **DataForSEO Google Jobs URL was 404'ing** — I used `/serp/google_jobs/live/advanced` (underscore-separated), correct path is `/serp/google/jobs/live/advanced` (slash-separated). Also widened the response `item.type` filter to accept both `google_jobs_serp` (legacy) and `jobs_element` (current) for forward compat. Fix in [job_search_service.py](mivaa-pdf-extractor/app/services/integrations/job_search_service.py).

Both bugs traced to: code paths that only get exercised on live deploys + paid APIs. Static smoke checks and typecheck won't surface them. Lesson: a real curl-against-prod is part of "done", not a nice-to-have.

**Diagnostic case** (the 2026-05-23 smoke test):
- POST `/api/v1/jobs/track` with `keywords: ["senior python developer", "staff python engineer"]`, `remote_only: true`, `run_first_refresh: true`
- Row created, 5 credits debited, `last_keywords_expanded_at` stamped, `first_refresh: {discovered: 15, deduped: 15, persisted: 0, matches: 0, by_source: {google_jobs: 0, perplexity: 15}}`
- `ai_usage_logs` showed: keyword_expansion = error (tools kwarg), dataforseo_jobs = 404, perplexity_sonar-pro = success (15 hits), classifier = error (tools kwarg)
- Net: user paid 5 credits + ~$0.018 Perplexity cost and got zero persisted listings.

**Cost discipline gap** (not yet fixed): the external route's refund check only fires on `first_refresh.error`; doesn't fire when classifier-failed-wholesale leads to `persisted=0`. Open follow-up — should refund when no listings survived AND classifier batches all failed.

---

## Job Research v0.3.3 (2026-05-15 — admin-stop bridge + KB category consolidation + scoped pause)

Three corrections on top of v0.3.2:

1. **Admin-stop bridge.** Previously the `/admin/background-agents` enable/disable toggle on a job-research row was a no-op for the engine — the refresh cron reads `tracked_jobs.is_active` directly, not `background_agents.enabled`. New AFTER UPDATE trigger `background_agents_sync_tracked_job_active` mirrors the toggle: disabling a job-research agent at the admin panel now actually stops the cron AND flips the user's row to inactive (so they see "paused" in their own listings). Function `_sync_tracked_job_active_from_bg_agent()` is SECURITY DEFINER and only acts when `agent_type = 'job-research'` and `enabled` changed.

2. **KB consolidation** — `Job Sources` category → `Internal Configuration` (generic, future-proof). Three per-site_type docs → **one** consolidated `Job Research Sites` doc with three sections (Perplexity domain filter / Default RSS feeds / Default career pages). Sibling docs for other internal configs (mention outlets, price retailers, etc.) can live in the same category. Sync helper [job_sites_kb_sync.py](mivaa-pdf-extractor/app/services/integrations/job_sites_kb_sync.py) rewritten to render the single doc; legacy `sync_one_site_type()` kept as a no-op alias that calls `sync_all()` so route callers don't break.

3. **Scoped pause.** `track_job_search` action=pause now accepts `pause_scope: 'all' | 'digests_only'`. Default `all` flips `is_active=false` (stops refresh + digest). `digests_only` flips `digest_enabled=false` (refresh keeps running silently; user can still ask "what new jobs did you find?" via `find_jobs` and gets the AgentHub triage panel; just no emails/chat-posts at digest tick). Broader NL vocab in the prompt — "stop", "cancel", "turn off", "kill", "snooze", "disable" all map to pause; "got a job, stop" confirms then maps to delete.

**JARVIS prompt addendum** rewritten with explicit two-scope STOP section + the new generic category name.

---

## Job Research v0.3.2 (2026-05-15 — sites list moved to KB category + agent-driven flow with modal — superseded by v0.3.3)

Correction to v0.3.1. The previous attempt added a standalone admin page at `/admin/knowledge-base/job-sources`. That was wrong — operator wanted (a) the list as a proper KB category with `access_level='agent'` so the agent reads it but the public KB hides it, and (b) all add/edit flows to go through the JARVIS agent (with a modal for vague requests), not through a dedicated admin page.

**What changed vs v0.3.1:**
- ❌ **Deleted**: `src/pages/Admin/JobResearchSitesPage.tsx` + its route in `src/App.tsx`. No more standalone admin page.
- 🆕 **KB category `Job Sources`** ([kb_categories](src/components/Admin/KnowledgeBase/CategoryManager.tsx) with `access_level='agent'`, trigger_keyword='job sources'). Three child kb_docs (one per `site_type`) auto-rendered as Markdown tables of the current sites. Visible in admin KB; hidden from `PublicKnowledgeBasePage` which filters `access_level='public'`. Agent can search them via the standard KB search tool.
- 🆕 **Sync helper** [job_sites_kb_sync.py](mivaa-pdf-extractor/app/services/integrations/job_sites_kb_sync.py) — after every CRUD on `job_research_sites`, calls `sync_one_site_type(site_type)` which rewrites the corresponding kb_doc body with a fresh Markdown table (enabled rows in a table, disabled in a strike-through list, with timestamp). Wired into `POST/PUT/DELETE /api/v1/job-research/sites[/{id}]` endpoints.
- 🆕 **JARVIS tool `manage_job_sites`** ([job-research-tools.ts](supabase/functions/_shared/tools/job-research-tools.ts)). Actions: `list`, `add`, `remove`, `toggle`, `open_form`. Registered on the `kai` agent. Writes 401 for non-admins (RLS enforced at DB layer). When the user gives vague input ("add a job site"), the tool emits a `job_sites_form_open` chunk instead of guessing.
- 🆕 **AgentHub modal** [JobSitesFormModal.tsx](src/components/features/ai/JobSitesFormModal.tsx) — triggered by the `job_sites_form_open` chunk. Select site_type + fill URL/domain/country/category/notes → on submit, populates the input box with a structured prose message ("Please add this job site using manage_job_sites... site_type: …, url_or_domain: …") which the user reviews and sends. Re-invokes the tool with the concrete fields.
- 🆕 **JARVIS prompt addendum** updated — drops the dead `/admin/knowledge-base/job-sources` deep-link; teaches the agent the new `manage_job_sites` tool with NL→action mappings ("add kariera.gr" → action=add; vague "add a job site" → action=open_form to mount the modal).

**User flow now:**
1. User (in chat): *"add kariera.gr to the search"* → JARVIS calls `manage_job_sites(action=add, site_type=perplexity_domain, url_or_domain=kariera.gr)` → row inserted → kb_doc resync → confirmation in chat.
2. User (vague): *"I want to add a job site"* → JARVIS calls `manage_job_sites(action=open_form)` → AgentHub mounts the modal → user fills fields → submits → input box populated → user reviews + sends → tool runs.
3. User (read): *"which job boards do you search?"* → JARVIS calls `manage_job_sites(action=list)` → enumerates from KB doc / DB.

**RLS model** (unchanged from v0.3.1):
- `job_research_sites`: reads open to authenticated, writes admin-only via role check.
- `kb_docs` under "Job Sources" category: workspace-scoped via existing KB RLS; `access_level='agent'` on the category makes the public KB skip it.

---

## Job Research v0.3.1 (2026-05-15 — operator-curated sites list — superseded by v0.3.2)

Late-day follow-up after the v0.3 ship. The Perplexity domain filter had been hardcoded in `_DEFAULT_JOB_DOMAINS` since v0.1 — no way to add country-specific job boards (e.g. `kariera.gr`, `jobs.gr` for the Greek market) without a code change. **Fixed by moving the list into the DB with a hidden admin editor.**

- 🆕 **`job_research_sites` table** — operator-curated list with `site_type ∈ {perplexity_domain, rss_feed_default, careers_page_default}`, `url_or_domain`, optional `country_code` + `category`, `is_enabled` toggle, `notes`. RLS: reads open to authenticated, writes admin-only. Seeded with the previous 10 hardcoded domains.
- 🆕 **Hidden admin page** at `/admin/knowledge-base/job-sources` ([JobResearchSitesPage.tsx](src/pages/Admin/JobResearchSitesPage.tsx)). Three tabs (one per `site_type`), per-site enable/disable toggle, add-site dialog with country/category metadata. NOT registered in any nav config — reachable only via direct URL, KB-admin sidebar (if linked), or the JARVIS agent deep-link.
- 🆕 **CRUD endpoints** at `GET/POST/PUT/DELETE /api/v1/job-research/sites[/{id}]`. Reads return all rows for any authenticated user; writes 401 for non-admins (RLS enforced).
- ✏️ **`search_via_perplexity()`** now calls `_load_perplexity_domains_from_db()` first; falls back to the hardcoded constant only if the DB read fails or returns nothing. Perplexity's 10-domain cap is still enforced — extras are truncated alphabetically.
- ✏️ **JARVIS prompt addendum** updated with a "Job source sites configuration" paragraph instructing the agent to deep-link admins to `/admin/knowledge-base/job-sources` when they ask "which sites do you search?" / "add kariera.gr to the search" / "where do I configure job boards?".
- 📋 **Per-tracked_job overrides still win.** Setting `tracked_jobs.careers_page_urls` or `rss_feed_urls` per-search overrides the defaults. The DB list is for the *platform-wide* defaults.

**Where to add a new job board (operator workflow):**
1. Navigate to `/admin/knowledge-base/job-sources` (or ask JARVIS: "open the job sources admin page").
2. Pick the right tab (`perplexity_domain` for Sonar's filter, `rss_feed_default` for a feed-aggregator, `careers_page_default` for a specific company).
3. Click "Add site" → fill URL/domain + optional display name + country + category.
4. Toggle enabled. Takes effect on the next refresh tick.

---

## Job Research v0.3 (2026-05-15 — RSS + burst alerts + classifier feedback + external API + cross-conversation triage)

Closed out the v0.2 follow-up backlog. Changes since v0.2:

1. **RSS source adapter** — `search_via_rss_feeds()` in [job_search_service.py](mivaa-pdf-extractor/app/services/integrations/job_search_service.py) parses RSS 2.0 + Atom 1.0 feeds via `xml.etree`. New `tracked_jobs.rss_feed_urls text[]` column. Enabled per tracked_job via `sources_enabled.rss_feeds=true`. Free (no per-call billing). Source-priority dedupe rank: `firecrawl_careers > rss_feed > perplexity_sonar > google_jobs`.
2. **Salary normalization** — [job_salary_normalizer.py](mivaa-pdf-extractor/app/services/integrations/job_salary_normalizer.py) converts source-reported salary (`{min, max, currency, period}`) into annualized USD. Static FX table (refreshable quarterly), period multipliers for hour/day/week/month/year, magnitude-based period inference when source omits it, sanity floor/ceiling ($5k–$2M/yr). Persisted on new `job_listings.salary_annual_min_usd` + `salary_annual_max_usd` + `salary_normalization_note` columns. Original raw values preserved alongside.
3. **Real-time burst alert** — opt-in via `tracked_jobs.alert_on_burst boolean` + `burst_threshold int default 10`. After every refresh, if new matches ≥ threshold AND last_burst_alert_at > 2h ago, the dispatcher fires a chat-post + bell notification BETWEEN daily digests. Implementation: `JobDigestDispatcher.dispatch_burst_if_warranted()` called inline at the end of `JobResearchService.refresh()`. 24h cooldown enforced via `tracked_jobs.last_burst_alert_at`.
4. **Classifier feedback (full loop)** — new endpoint `POST /api/v1/job-research/listings/{id}/correct-match` (also on the public API at `POST /api/v1/jobs/track/listings/{id}/correct-match`). Inserts a `job_match_corrections` row + immediately updates the listing's `relevance` so the user sees feedback inline. The classifier ([job_classifier_service.py](mivaa-pdf-extractor/app/services/integrations/job_classifier_service.py)) now calls `_load_recent_corrections(tracked_job_id)` and prepends the most recent 5 as Haiku few-shot examples on the next batched classify call. AgentHub renders a "⚠ wrong" button on each listing in the inline `job_findings` card.
5. **External `api_keys` flow** — new file [job_tracking_routes.py](mivaa-pdf-extractor/app/api/job_tracking_routes.py) at `/api/v1/jobs/track/*`. 12 endpoints. Authenticates via the same `kai_*` Bearer flow used by `mention_tracking_routes` + `tracked_queries_routes`. Per-call partner billing via `JOB_OP_CREDIT_COST` (refresh=5cr, regenerate-keywords=2cr, others=0cr). Refunded automatically on hard failure / no-op outcomes. Returns `402 Insufficient credits` when balance is exhausted. Cron does NOT touch `api_key_id IS NOT NULL` rows — partners control their own refresh cadence.
6. **Cross-conversation triage UI** — replaces the dropped `/knowledge-base/job-sources` page from v0.1. New component [JobResearchSavedJobsPanel.tsx](src/components/Admin/BackgroundAgents/JobResearchSavedJobsPanel.tsx) auto-mounts inside `AgentRunHistoryDrawer` whenever the agent's `agent_type === 'job-research'`. Reads `agent.config.tracked_job_id` and surfaces saved/applied/interested/all-matches with per-listing actions (save, apply, dismiss, "wrong match"). Lives in the existing background-agents framework — no new admin page, just an inline panel above the run history.

**New tables/columns (v0.3 migration applied via `mcp__supabase__apply_migration`):**
- `tracked_jobs.rss_feed_urls text[]`
- `tracked_jobs.alert_on_burst boolean default false`
- `tracked_jobs.burst_threshold int default 10` (CHECK 1..100)
- `tracked_jobs.last_burst_alert_at timestamptz`
- `tracked_jobs.sources_enabled` default updated to include `rss_feeds: false`
- `job_listings.salary_annual_min_usd int`
- `job_listings.salary_annual_max_usd int`
- `job_listings.salary_normalization_note text`
- New index `job_listings_salary_annual_idx` on `(tracked_job_id, salary_annual_min_usd) WHERE relevance='match' AND salary_annual_min_usd IS NOT NULL`

**API surface additions** (see [docs/api/job-research-api.md](docs/api/job-research-api.md) v0.3.0 changelog):
- Internal: `POST /api/v1/job-research/listings/{id}/correct-match`
- External (NEW namespace): `POST/GET/PUT/DELETE /api/v1/jobs/track/*` — 12 endpoints mirroring the internal flow with `kai_*` Bearer auth + per-call credit metering

**Frontend additions:**
- `jobResearchService.correctMatch()` API client method
- `JobResearchSavedJobsPanel` mounts inside `AgentRunHistoryDrawer` for `agent_type='job-research'`
- "⚠ wrong" button on each listing in the AgentHub inline `job_findings` card

**Cost discipline:**
- RSS: free (no upstream billing)
- Salary normalization: pure local computation, no API
- Burst alert: same channels as digest (bell free, email 1cr only when actively sent — but burst alert chat-posts are free; emails are NOT auto-sent on burst, only chat+bell)
- Classifier few-shot: ~5 extra prompt tokens × 5 examples ≈ negligible token cost on top of the existing classify call
- External API: 5cr/refresh, 2cr/regenerate-keywords, 0cr for reads + corrections. Same rate as internal-flow ai_usage_logs.

---

## Job Research v0.2 (2026-05-15 — background-agents integration + chat-posting + auto keyword expansion)

Architecture rework on top of v0.1.0. Three corrections:

1. **Background-agents bookkeeping** — every `tracked_jobs` row now also gets a `background_agents` row (type=`job-research`) so the search appears in `/admin/background-agents` alongside other background agents. Each refresh writes one `agent_runs` row + per-source `agent_run_logs` entries (DataForSEO / Sonar / Firecrawl outcomes, dedupe counts, persisted+match counts). FK on `tracked_jobs.background_agent_id`. Helpers in [mivaa-pdf-extractor/app/services/integrations/job_agent_runs.py](mivaa-pdf-extractor/app/services/integrations/job_agent_runs.py) — start_run / append_log / complete_run / fail_run.
2. **Chat-posting (primary user surface)** — when the JARVIS agent creates a tracked_job via `track_job_search`, the current `conversation_id` is captured on `tracked_jobs.source_conversation_id`. After every daily digest tick, the dispatcher inserts a new assistant message into THAT `agent_chat_messages` thread with `metadata.chunk_type = 'job_findings'` carrying the listings. The user reopens the conversation and sees the running history of findings rendered as a rich card by AgentHub. Email digest still goes out in parallel — chat is the in-product surface, email is the outside-the-app surface.
3. **Auto keyword expansion (default-on, was opt-in)** — `JobResearchService.create()` now synchronously calls Haiku tool-use ([job_keyword_expansion_service.py](mivaa-pdf-extractor/app/services/integrations/job_keyword_expansion_service.py)) which returns `{title_variants, seniority_variants, abbreviations, rejected_terms}`. Persisted on `tracked_jobs.expanded_keywords`. Discovery uses `keywords ∪ expanded_keywords`. Re-runnable via `POST /track/{id}/regenerate-keywords`. So "Product Manager" automatically catches "Senior PM", "Product Lead", "Principal PM", etc.

**Other v0.2 changes:**
- **Synchronous first refresh**: `create()` now runs the full discovery + classifier pipeline inline before returning. The JARVIS agent's tool reply contains real findings counts on first save instead of "wait an hour for the cron".
- **Weekly cadence support**: new `tracked_jobs.digest_day_of_week` column (0=Sunday..6=Saturday, NULL=daily). The `get_tracked_jobs_due_for_digest` RPC was rewritten to honor it. Lets the user say "every Monday morning" and have the digest only fire on Mondays.
- **Hidden KB page DROPPED**: `/knowledge-base/job-sources` is gone. The chat is the user surface; `/admin/background-agents` is the ops surface. The page added churn for no value once chat-posting was wired.
- **Action URL**: bell-notification + email "Open" links now deep-link to the conversation (`/agent-hub?conversation=<id>`) instead of the deleted KB page. Falls back to `/agent-hub?q=...` when no source_conversation_id is set.
- **JARVIS agent prompt addendum** added to the live `prompts` row (key='kai') with idempotent `--BEGIN_JOB_RESEARCH_ADDENDUM--` markers. Tells the agent how to map NL phrases ("daily" / "weekly" / "every Monday morning" / "twice a day") to the structured `digest_hour_utc` + `digest_day_of_week` + `refresh_interval_hours` fields, and instructs it to confirm scope before saving.
- **AgentHub `job_findings` card**: type definition + metadata restore + render block in [src/components/features/ai/AgentHub.tsx](src/components/features/ai/AgentHub.tsx). Renders per-listing url/company/location/salary/source. The cron-posted message arrives via the conversation-load metadata path, not the live streaming chunk handler — the `chunk_type === 'job_findings'` discriminator on stored metadata routes it into `jobFindingsData`.

**Removed in v0.2** (tracked_jobs columns no longer used in code paths but retained in schema):
- `auto_expand_keywords` boolean — column kept for back-compat; ignored. Expansion is unconditional now.

**API surface changes** (see [docs/api/job-research-api.md](docs/api/job-research-api.md) v0.2 changelog for the full list):
- `POST /api/v1/job-research/track` is now async; accepts `source_conversation_id`, `digest_day_of_week`, `run_first_refresh` (default `true`).
- New: `POST /api/v1/job-research/track/{id}/regenerate-keywords` — re-runs Haiku expansion.
- `PUT /api/v1/job-research/track/{id}` accepts `digest_day_of_week`.

**JARVIS tool** now takes a 5th parameter `conversationId` from the agent-chat runtime; passes it as `source_conversation_id` on create. The tool description is rewritten with explicit NL-scheduling translation table.

---

## Job Research (2026-05-14 — background job-discovery agent + consolidated daily email — superseded by v0.2 above)

Per-user background agent that discovers job postings across **DataForSEO Google Jobs**, **Perplexity Sonar** (with `search_domain_filter` pinned to LinkedIn / Indeed / Glassdoor / WeWorkRemotely / RemoteOK / Wellfound / Dice / Monster / StackOverflow / YC), and **Firecrawl scraping of user-pinned career pages**. Runs hourly on a volatility-adaptive cadence (6h / 24h / 48h / 72h / 168h). Sends **ONE consolidated email per user per day** at the user's chosen `digest_hour_utc` covering all of their tracked job searches — not per-event alerts.

Cloned wholesale from the [[mention-monitoring]] template (subject row → history rows → cron-driven refresh → classifier verdict cache → adaptive cadence → email digest dispatcher → JARVIS agent tool surface). What's net-new: the 3 job-source adapters and the consolidated-digest dispatcher.

**Tables** (applied 2026-05-14 via `mcp__supabase__apply_migration`):
- `tracked_jobs` — subject. XOR check: internal flow has `user_id` set + `api_key_id IS NULL`; external API flow has `api_key_id` set + `user_id IS NULL`. CHECK constraint enforces exactly one. Includes denormalized snapshot (`current_listing_count_24h`, `current_listing_count_7d`, `current_top_companies`).
- `job_listings` — discovered postings. UNIQUE (`tracked_job_id`, `content_hash`) prevents double-insert across runs. `digest_included_at` marks rows already sent in a digest. `user_action ∈ {saved, applied, dismissed, interested}` for per-listing user feedback.
- `job_classifier_verdict_cache` — Haiku verdict cache, 7d TTL, keyed on sha1(`content_hash` + `facets_hash`). ~95% cache rate on stable searches across daily refreshes.
- `job_excluded_urls` — per-tracked_job blocklist (url / domain / company).
- `job_match_corrections` — classifier feedback loop (recent rows become Haiku few-shot examples on next call).
- `job_alert_log` — digest dispatch audit + 24h dedupe.
- `job_research_summary` — read-only view for the admin dashboard.

**RPCs**: `get_internal_tracked_jobs_due`, `get_tracked_jobs_due_for_digest`, `update_tracked_job_cadence`, `append_job_alert_log`, `stamp_job_refresh_cost`, `recompute_job_cost`. All `SECURITY DEFINER` — service role and edge functions call them across user boundaries; RLS still applies to direct client reads.

**Cron** (pg_cron):
- `job-research-refresh-hourly` (`45 * * * *`) → `job-research-cron` edge function → MIVAA `/cron-refresh`
- `job-research-digest-hourly` (`5 * * * *`) → `job-research-digest-cron` edge function → MIVAA `/cron-digest?current_hour_utc=<H>`. Each user's tracked_jobs whose `digest_hour_utc == H` and `last_digest_sent_at < today` receive ONE consolidated email covering all their searches.
- `job-classifier-cache-prune` (`30 4 * * *`) → DELETE expired verdict cache rows.

**Refresh pipeline** ([mivaa-pdf-extractor/app/services/integrations/job_research_service.py](mivaa-pdf-extractor/app/services/integrations/job_research_service.py)):
1. Build `JobFacets` from the tracked_job (keywords, location, remote_only, seniority, excluded_*).
2. Fan out across enabled sources in parallel (`asyncio.gather`):
   - `search_via_dataforseo_jobs` — POST `/serp/google_jobs/live/advanced` with keyword + location + country_code. ~$0.0006/req. Returns up to 30 hits.
   - `search_via_perplexity` — Sonar (or `sonar-pro` on first/forced refresh) with `search_domain_filter` + JSON-schema response. ~$0.005/sweep. Returns up to 15 hits with structured fields.
   - `search_via_firecrawl_careers` — for each pinned URL, POST `/v2/scrape` with the `_FirecrawlCareersPage` Pydantic schema. Pays Firecrawl credits per scrape.
3. URL canonicalize (strip tracking params) + cross-source dedupe by content_hash. Source priority on ties: firecrawl > perplexity > google_jobs.
4. Drop rows in `job_excluded_urls` (url / domain / company exclusions) AND in `tracked_jobs.excluded_companies`.
5. Drop dupes already in `job_listings` (`UNIQUE (tracked_job_id, content_hash)` is the safety net but pre-filter avoids wasting classifier credits).
6. Classifier ([job_classifier_service.py](mivaa-pdf-extractor/app/services/integrations/job_classifier_service.py)): rule shortcut → 7d cache → batched Haiku tool-use (`submit_classifications`, ≤25/batch). Verdicts: `match` / `tangential` / `mismatch` / `unverifiable`.
7. Drop `mismatch` rows; persist the rest with relevance + score + match_note.
8. Update denormalized counters (`current_listing_count_*`) on tracked_jobs.
9. `stamp_job_refresh_cost` RPC sums `ai_usage_logs` for this `refresh_run_id` onto the row.
10. `update_tracked_job_cadence` RPC sets `next_check_at`. Active (≥5 new matches) → 6h. Some activity (1–4) → base 24h. Stable → stretches 24 → 48 → 72 → 168h.

**Digest dispatcher** ([mivaa-pdf-extractor/app/modules/job_research_notifications/service.py](mivaa-pdf-extractor/app/modules/job_research_notifications/service.py)):
- For each due user, group their tracked_jobs into ONE email body. Each tracked_job becomes a section with up to 10 newest match listings.
- Channels: bell (always free, writes `user_notifications`), email (1 cr, via `email-api` edge function with template `job_alerts.daily_digest`), webhook (per-tracked_job `alert_webhook_url`, free).
- Marks the listing rows as `digest_included_at = now()` so they don't reappear in tomorrow's digest.
- Calls `append_job_alert_log` per tracked_job — that RPC also updates `last_digest_sent_at` so the same row isn't re-evaluated until tomorrow.
- "No new matches today" still stamps `last_digest_sent_at` (silent stamp, no email sent) so the cron doesn't reprocess until tomorrow.

**Backend surface** (internal flow only — external `api_keys` flow not yet wired in v1):
- `POST /api/v1/job-research/track` — create tracked_job
- `GET / PUT / DELETE /api/v1/job-research/track/{id}` — CRUD
- `POST /api/v1/job-research/track/{id}/refresh` — re-run discovery (`force=true` admin-only bypasses cadence)
- `GET /api/v1/job-research/track/{id}/listings` — list with `relevance` / `days` / `only_actionable` filters
- `GET /api/v1/job-research/track/{id}/summary` — aggregate snapshot
- `POST /api/v1/job-research/track/{id}/exclude` — add url/domain/company exclusion
- `GET /api/v1/job-research/track/{id}/exclusions` / `DELETE /api/v1/job-research/exclusions/{id}`
- `POST /api/v1/job-research/listings/{id}/action` — mark saved/applied/dismissed/interested
- `POST /api/v1/job-research/cron-refresh` (x-cron-secret) / `POST /api/v1/job-research/cron-digest` (x-cron-secret)

**Module flags** (in `public.modules`, both default-enabled):
- `job-research` — main module
- `job-research-notifications` — gates digest dispatch (`is_module_enabled` check at top of `dispatch_due_users`)

**JARVIS agent tools** ([supabase/functions/_shared/tools/job-research-tools.ts](supabase/functions/_shared/tools/job-research-tools.ts)) — registered on the `kai` agent for **all users** (not admin-gated). All 0-credit (refresh runs on cron, not on-demand):
- `track_job_search` — create / update / pause / resume / delete (resolves target by `tracked_job_id` or by label)
- `list_my_job_searches` — read user's tracked_jobs
- `find_jobs` — fetch recent matches for a tracked_job
- `get_job_digest_preview` — preview today's consolidated digest content

Each tool checks `is_module_enabled('job-research')` first. Chunk types streamed back to AgentHub: `job_search_created`, `job_search_updated`, `job_searches_list`, `job_listings_feed`, `job_digest_preview`. **These are wired** (2026-07 cleanup) via the generic `AgentResultCard` fallback — every type is registered in `AGENT_RESULT_TITLES` in [AgentHub.tsx](src/components/features/ai/AgentHub.tsx), so they render an inline card (live-stream + on reload). The "Job Sources" page renders the same data with full interactivity.

**Frontend**:
- [src/services/jobResearchService.ts](src/services/jobResearchService.ts) — single client with full CRUD + refresh + listings + summary + exclusions + per-listing action.
- [src/pages/KnowledgeBase/JobSourcesPage.tsx](src/pages/KnowledgeBase/JobSourcesPage.tsx) — **hidden KB page** at `/knowledge-base/job-sources?tracked_job=<id>`. NOT registered in any nav config. Reachable only via:
  1. The "Open Job Sources →" link in the daily digest email (`PUBLIC_APP_URL` env var on MIVAA backend points to it).
  2. The bell-notification action_url from a delivered digest.
  3. Deep-link emitted by the JARVIS agent when it creates / updates a tracked_job (chunk handler can navigate to it).
- Layout: tracked-jobs sidebar on the left, listings table on the right with All / New / Saved / Applied filters. Per-listing actions: open external URL, save, apply, dismiss.
- Route registered in [src/App.tsx](src/App.tsx) under `AuthGuard` so unauthenticated users get redirected to login.

**Required secrets** (MIVAA backend `Environment=` lines):
- `DATAFORSEO_BASE64` — already configured
- `PERPLEXITY_API_KEY` — already configured
- `FIRECRAWL_API_KEY` — already configured (only needed when `careers_pages` source is enabled per tracked_job)
- `ANTHROPIC_API_KEY` — already configured (Haiku classifier)
- `CRON_SECRET` — already configured (validated on `/cron-refresh` and `/cron-digest`)
- `PUBLIC_APP_URL` — same env var already used by `catalog-send-to-customers` + `catalog-tools.ts` for the public app URL; the digest dispatcher reads it to deep-link the conversation. Defaults to `https://app.materialshub.gr` if unset.

**Cost discipline** (mirrors price/mention v3):
- Verdict cache: ~95% hit rate on stable subjects across daily refreshes.
- Rule shortcut eliminates ~60% of candidates before Haiku.
- Tier-skip on Perplexity (sonar by default; sonar-pro only on first/forced refresh).
- Volatility cadence stretches stable searches to weekly polling.
- Typical per-refresh cost on a stable search: ~$0.005–0.010.

**Out of scope for v1** (deferred follow-ups):
- External `api_keys` flow (`/api/v1/jobs/track/*`) — partner billing + credit metering already wired in `job_cost_logger.JOB_OP_CREDIT_COST`, just need a sister router file with `Authorization: Bearer kai_*` auth.
- AgentHub rich cards for the 5 job chunk types — text reply works fine without them.
- RSS source adapter — was scoped out 2026-05-14 in favor of the 3 selected sources; trivial to add as a 4th adapter in [job_search_service.py](mivaa-pdf-extractor/app/services/integrations/job_search_service.py).
- Per-tracked_job `alert_on_high_match_burst` real-time alert (separate from daily digest) — schema supports it (`alert_type='high_match_burst'` enum value reserved); dispatcher logic not yet implemented.
- `auto_expand_keywords` (Haiku-driven keyword expansion on first refresh) — column exists, default `false`, no expansion code path yet.

---

## Mention Monitoring (2026-05-03 — multi-source mention tracking + LLM visibility)

Mirror of price-monitoring v3 for tracking subject mentions across **news, blogs, RSS, YouTube, and LLM responses**. Two flow shapes (same `tracked_mentions` row, distinguished by which FK is set):

- `api_key_id IS NULL AND product_id IS NOT NULL AND subject_type='product'` → internal product flow
- `api_key_id IS NULL AND product_id IS NULL AND brand_name IS NOT NULL AND subject_type IN ('brand','keyword')` → internal brand/keyword flow
- `api_key_id IS NOT NULL` → external API consumer flow

**Pipeline** (every refresh):
1. Build subject facets. **Default = deterministic** (label + user-supplied aliases, no LLM call). When `tracked_mentions.auto_expand_aliases=true`, run Haiku once to expand the label into per-word aliases + brand inference + competitor brand list (cached on `tracked_mentions.subject_facets`). Default-off was chosen 2026-05-04 after observing a chain failure — Anthropic credits depleted → Haiku 400 → empty facets → 0 hits from DataForSEO/Sonar — and consciously reducing the dependency surface. Customers tracking unique brand names get exact-match recall at predictable cost; customers tracking multi-word labels can opt in.
2. Discover in parallel across enabled sources: **DataForSEO News** (~$0.0006/req, fan-out across distinctive aliases), **Perplexity Sonar** ($0.005/sweep, sonar-pro only on first/forced refresh, disjunctive query when multiple aliases), **RSS** (free, user-curated), **YouTube** (free, opt-in). Reddit was dropped 2026-05-03 — Responsible Builder Policy onboarding wasn't worth the friction for marginal coverage.
3. URL canonicalize + content-hash dedupe across sources.
4. Apply exclusions + promoted-URL overrides.
5. Rule pre-filter (alias must appear) — drops obvious mismatches before Haiku.
6. Verdict cache lookup (7d TTL keyed on `sha1(content_hash + subject_facets_hash)`) — repeat URLs hit cache.
7. Haiku 4.5 batched classifier (≤50 candidates per call): **relevance** ∈ {exact, tangential, mismatch, unverifiable}, **sentiment** ∈ {positive, neutral, negative}.
8. Drop `relevance='mismatch'`. Sanity-check sentiment outliers vs trailing 7d → flag `is_anomaly`.
9. Persist `mention_history` rows. Update denormalized cache on `tracked_mentions`. Update volatility cadence (24h → 48h → 72h → 168h on stable subjects, 6h on active ones).
10. Detect alerts → dispatch via the `mention-monitoring-notifications` module.

**LLM mention probes** ([mivaa-pdf-extractor/app/services/integrations/llm_mention_probe_service.py](mivaa-pdf-extractor/app/services/integrations/llm_mention_probe_service.py)) — weekly cadence. 4 probe templates (generic recommendation / use-case / comparison / direct lookup) × 4 cheap models (`claude-haiku-4-5`, `gpt-4o-mini`, `gemini-2.0-flash`, `sonar`) = 16 calls/subject/week ≈ $0.008. Each response post-processed by Haiku tool use (`record_mention`) to extract: `mentioned`, `position`, `sentiment`, `competitors_mentioned[]`, `context_snippet`. Snapshot exposed via `/llm-visibility` endpoint with share-of-voice + avg-rank + top co-mentioned competitors.

**Cost discipline** (mirrors price v3):
- Verdict cache: ~95% cache rate on stable subjects across daily refreshes.
- Rule pre-filter eliminates ~60% of candidates before Haiku.
- Tier-skip: cheap `sonar` by default, `sonar-pro` only on first/forced refresh.
- Volatility cadence stretches stable subjects to weekly polling.
- RSS + YouTube are free; DataForSEO News is the cheapest paid source.
- Typical refresh: ~$0.005–0.010 on a stable subject.

**Tables** ([supabase/migrations/20260503_mention_monitoring_module.sql](supabase/migrations/20260503_mention_monitoring_module.sql)):
- `tracked_mentions` — subject. Includes denormalized snapshot (`current_mention_count_7d`, `current_sentiment_avg`, `current_top_outlets`).
- `mention_history` — append-only mention rows. `(tracked_mention_id, canonical_url, refresh_run_id)` unique to prevent double-insert per run.
- `llm_mention_probes` — per-(template × model) probe attempts.
- `mention_outlets` — outlet reputation cache (`domain_authority` 0-100, `is_aggregator`, `is_press_release_wire`).
- `mention_classifier_verdict_cache` — 7d TTL.
- `mention_promoted_urls` / `mention_excluded_urls` — admin overrides.
- `mention_match_corrections` — classifier feedback (recent rows are few-shot examples).
- `mention_alert_log` — alert audit + 24h dedupe.

**RPCs**: `get_internal_tracked_mentions_due`, `get_tracked_mentions_due_for_llm_probe`, `update_tracked_mention_cadence`, `append_mention_alert_log`.

**Backend surface** — two routers, two auth styles:

- **Public Tracking API** ([mivaa-pdf-extractor/app/api/mention_tracking_routes.py](mivaa-pdf-extractor/app/api/mention_tracking_routes.py)) — external integrations, `Authorization: Bearer kai_*` (api_keys). Mounted at `/api/v1/mentions/track/*`. Endpoint inventory: `POST /` (create), `GET /` (list), `GET|PUT|DELETE /{id}`, `POST /{id}/refresh`, `GET /{id}/feed|history|summary|llm-visibility|exclusions`, `POST /{id}/probe-llm|exclude|include`. Mirror of `/api/v1/prices/track/*`.
- **Internal flow** ([mivaa-pdf-extractor/app/api/mention_monitoring_routes.py](mivaa-pdf-extractor/app/api/mention_monitoring_routes.py)) — session JWT, used by the Material KAI web app.

Internal product flow (session JWT):
- `POST /api/v1/mention-monitoring/products/{id}/track` — find-or-create + first refresh
- `DELETE /api/v1/mention-monitoring/products/{id}/track` — soft delete
- `GET /api/v1/mention-monitoring/products/{id}` — read summary row
- `POST /api/v1/mention-monitoring/products/{id}/refresh` — re-run discovery (`force=true` requires admin)
- `GET /api/v1/mention-monitoring/products/{id}/feed` — latest run rows
- `GET /api/v1/mention-monitoring/products/{id}/history?days=&sentiment=&outlet_type=` — historical rows
- `GET /api/v1/mention-monitoring/products/{id}/summary?days=30` — aggregate snapshot
- `GET /api/v1/mention-monitoring/products/{id}/llm-visibility` — most recent probe snapshot
- `POST /api/v1/mention-monitoring/products/{id}/probe-llm` — admin trigger

Subject-id flow (brand/keyword):
- `POST /track` / `GET|PUT|DELETE /track/{id}` — CRUD
- `POST /track/{id}/refresh|exclude|include|promote|probe-llm`
- `GET /track/{id}/feed|history|summary|llm-visibility|exclusions|share-of-voice`

Cross-flow: `/classifier-correction`, `/cron-refresh`, `/cron-probe-llm` (latter two require `x-cron-secret`).

**Cron** (pg_cron):
- `mention-monitoring-refresh-hourly` (`30 * * * *`) → POSTs to `mention-monitoring-cron` edge function → MIVAA `/cron-refresh`
- `llm-mention-probe-daily` (`0 3 * * *`) → `llm-mention-probe-cron` edge function → MIVAA `/cron-probe-llm`
- `mention-classifier-cache-prune` (`0 4 * * *`) → DELETE expired cache rows

**Notification dispatcher** ([mivaa-pdf-extractor/app/modules/mention_monitoring_notifications/service.py](mivaa-pdf-extractor/app/modules/mention_monitoring_notifications/service.py)):

Four alert types, opt-in per subject:
- `mention_spike` — today's count ≥ 2× trailing 7d daily-average
- `negative_sentiment` — negative mention from outlet with `domain_authority ≥ 30`
- `new_outlet` — first-ever mention from a domain
- `llm_visibility_change` — average position across LLM probes shifts by ≥2 ranks W/W

Channels (CHANNEL_CREDIT_COST): bell (0 cr), email (1 cr via `email-api` edge function with templates `mention_alert.{spike,negative_sentiment,new_outlet,llm_visibility_change}`), webhook (0 cr, per-subject `alert_webhook_url`). 24h dedupe per `(alert_type, tracked_mention_id, outlet_domain)`. Module-gated on `mention-monitoring-notifications`.

**Frontend**:
- [src/services/mentionMonitoringApi.ts](src/services/mentionMonitoringApi.ts) — single client with product-scoped + subject-scoped helpers.
- [src/components/business/mention-monitoring/MentionMonitorTab.tsx](src/components/business/mention-monitoring/MentionMonitorTab.tsx) — per-product tab on the product detail modal (admin-only, mounted alongside the Price Monitor tab).
- [src/components/business/mention-monitoring/MentionMonitoringDashboard.tsx](src/components/business/mention-monitoring/MentionMonitoringDashboard.tsx) — admin cross-catalog view at `/admin/mention-monitoring`.
- Module folders [src/modules/mention-monitoring/](src/modules/mention-monitoring/) and [src/modules/mention-monitoring-notifications/](src/modules/mention-monitoring-notifications/) for the registry.

**Agent tools** ([supabase/functions/_shared/tools/mention-tools.ts](supabase/functions/_shared/tools/mention-tools.ts)) — registered on the JARVIS agent:
- `track_product_mentions` — start/stop tracking (0 cr)
- `get_mention_summary` — pull rolling snapshot (0 cr)
- `check_llm_visibility` — read latest snapshot or fire fresh probe with `force_run=true` (2 cr)
- `find_negative_mentions` — filtered feed for reputation triage (0 cr)

Each tool checks `is_module_enabled('mention-monitoring')` first. Chunk types streamed back to AgentHub: `mention_summary`, `llm_visibility_result`, `mention_feed`, `mention_tracking_started`. Each renders as an inline card in chat (handlers in [src/components/features/ai/AgentHub.tsx](src/components/features/ai/AgentHub.tsx) — `mentionSummaryData` / `llmVisibilityData` / `mentionFeedData` message data fields).

**Required secrets** (MIVAA backend):
- `ANTHROPIC_API_KEY`, `PERPLEXITY_API_KEY`, `DATAFORSEO_BASE64`, `OPENAI_API_KEY`, `CRON_SECRET` — already configured.
- `YOUTUBE_DATA_API_KEY` — **NEW** (optional, opt-in per subject; free quota 10k/day).
- `GEMINI_API_KEY` — **NEW** (optional, free tier covers daily probe load).
- Reddit was evaluated and dropped — Reddit's Responsible Builder Policy onboarding wasn't worth the friction.

**Cost wiring (2026-05-04)** — `mention_cost_logger.py` is the single chokepoint. Every external API call (DataForSEO News, DataForSEO Labs, Perplexity Sonar, Anthropic Haiku, OpenAI gpt-4o-mini, Gemini Flash) writes to `ai_usage_logs` with `module_slug='mention-monitoring'`, `metadata.tracked_mention_id`, `metadata.refresh_run_id`, `product_id` (when internal-flow). After every refresh, `stamp_mention_refresh_cost(p_tracked_mention_id, p_refresh_run_id)` SQL RPC stamps `tracked_mentions.last_refresh_billed_usd` + `last_refresh_credits_debited` and recomputes lifetime `total_billed_usd` / `total_partner_credits_debited`. After probe-llm and opportunities calls, `recompute_mention_cost(p_tracked_mention_id)` updates lifetime totals (no per-run stamp since those don't have a refresh_run_id).

**Partner billing** — external (`kai_*`) endpoints debit credits per call via `debit_user_credits` RPC, refund on hard failure / no-op outcomes via `credit_user_credits`. Costs in `MENTION_OP_CREDIT_COST` (mention_cost_logger.py): refresh=5, probe_llm=15, opportunities=2, opportunities_with_llm=5. Internal flow stays free (mirrors price-monitoring). Successful refreshes keep the credit even with 0 hits — upstream calls still ran. Throttled / inactive / not-found / error outcomes refund automatically. 402 returned on insufficient balance.

**Out of scope for v1** (kept lean to validate the pipeline first):
- Twitter/X (too expensive, $200/mo for basic tier)
- TikTok (ToS-hostile, no stable API)
- Instagram / Facebook mentions on others' pages (no public search)
- YouTube transcripts (deferred to v2 — opt-in per subject)
- Firecrawl body fetch on every URL (current pipeline ships title+excerpt to classifier; body fetch is a v2 quality lever)

Full reference: [docs/api/mention-monitoring-api.md](docs/api/mention-monitoring-api.md) (versioned changelog at top). Auto-generated OpenAPI spec at `https://v1api.materialshub.gr/openapi.json`; interactive Swagger UI at `https://v1api.materialshub.gr/docs` (filter by tag: `Mention Tracking (Public API)` for the partner endpoints, `Mention Monitoring` for the internal-flow endpoints).

## Presentation Sheets — moodboard sheets via the JARVIS agent (2026-05-02)

Eight client-ready sheet types attached to a moodboard. Generated through the JARVIS agent chat (`generate_presentation_sheet` tool), output as A3-landscape PDFs in the `pdf-documents` storage bucket under the `moodboard-output/` prefix. Editable: every sheet is a row in `moodboard_presentation_sheets` with a JSONB `data` payload, so users can re-open and re-render without redoing inputs.

**Sheet types + credit cost** (debited from user balance via `debit_user_credits` RPC, mirrored to `ai_usage_logs.operation_type='presentation_sheet_<type>'`):

| Type | Cost | Interactive? | Inputs |
|---|---|---|---|
| `material_board` | 0 cr | No | `product_ids[]` (cap 8) + optional `chip_descriptions{product_id: text}` |
| `color_palette` | 0 cr | No | `swatches[{hex, name, source_image_id?}]` (cap 8) |
| `concept_board` | 0 cr | No | `layout[{image_url, caption?}]` (cap 6) |
| `lighting_plan` | 3 cr | Yes | `backdrop`, `symbols[{type, x, y, label?}]` (normalized 0..1), `legend[]` |
| `annotated_render` | 3 cr | Yes | `backdrop_image_url`, `annotations[{x, y, line_endpoint_x, line_endpoint_y, label, product_id?, source}]` |
| `elevation_render_pair` | 2 cr | Yes | `elevation_image_url`, `render_image_url?`, `dimensions[{x1,y1,x2,y2,value,unit}]`, `tile_callouts[]` |
| `ffe_schedule` | 0 cr | No | `quote_id` (preferred — pulls items) OR explicit `items[]` |
| `full_deck` | 3 cr | No | `included_sheet_ids[]` ordered + `cover{title, description?, client_name?, cover_image_url?, date}` |

**Interactive vs passive**: passive types render the PDF immediately when the agent calls the tool. Interactive types (lighting / annotated / elevation) emit a `sheet_canvas_open` chunk → the chat surface mounts a `SheetCanvasCard` widget so the user finishes the inputs in-canvas → the canvas calls `moodboardSheetsService.generatePdf()` which invokes the edge function.

**Coordinate convention**: every annotation, dimension, and symbol is stored as **normalized [0..1]** relative to the backdrop image. The PDF builder uses the same convention, so widgets and PDFs stay in sync regardless of pixel dimensions.

**Pieces on disk:**

- DB:
  - Migration: [`supabase/migrations/20260502_moodboard_presentation_sheets.sql`](supabase/migrations/20260502_moodboard_presentation_sheets.sql) — `moodboard_presentation_sheets` table, `moodboard_sheet_type` + `moodboard_sheet_status` enums, RLS, `updated_at` trigger. (Storage for the generated PDFs lives at `pdf-documents/moodboard-output/` after the 2026-05-23 consolidation.)
  - Prompt addendum: [`supabase/migrations/20260502_kai_prompt_presentation_sheets_addendum.sql`](supabase/migrations/20260502_kai_prompt_presentation_sheets_addendum.sql) — appends sheet-tool guidance to the `kai` and `interior-designer` prompt rows. Idempotent (uses `--END_PRESENTATION_SHEETS_ADDENDUM--` marker).
- Edge function: [`supabase/functions/generate-moodboard-sheet-pdf/`](supabase/functions/generate-moodboard-sheet-pdf/) — `index.ts` (router), `builders.ts` (one builder per sheet type), `data-fetcher.ts` (sheet/moodboard/products/quote-items/sub-sheet fetchers), `layout.ts` (A3 helpers, title block, `hexToRgb`, `wrapText`, `embedImageBytes`), `types.ts`. Uses `pdf-lib`.
- Agent tool: [`supabase/functions/_shared/tools/presentation-sheet-tool.ts`](supabase/functions/_shared/tools/presentation-sheet-tool.ts) — `generate_presentation_sheet`. Validates moodboard ownership → debits credits → inserts sheet row → emits chunk (`sheet_canvas_open` for interactive, `sheet_pdf_ready` for passive after invoking the edge function). Refunds on insert failure.
- Agent registration: [`supabase/functions/agent-chat/index.ts`](supabase/functions/agent-chat/index.ts) — added `generate_presentation_sheet` to the `kai` and `interior-designer` `tools[]` arrays + lazy-import block + tool-push block (all-users gating; per-sheet cost handled inside the tool).
- Frontend service: [`src/services/moodboardSheetsService.ts`](src/services/moodboardSheetsService.ts) — `list/get/create/update/remove/refreshPdfUrl/generatePdf`. Exports `SHEET_TYPE_LABELS` and `SHEET_TYPE_CREDITS`.
- Frontend widgets: [`src/components/features/sheets/`](src/components/features/sheets/) — `AnnotationLayer` (shared backdrop with normalized-coord render-prop API), `CalloutCanvas` (annotated_render — drag anchor + endpoint, edit labels), `DimensionCanvas` (elevation_render_pair — two-click dimensions, single-click tile callouts), `FixtureSymbolCanvas` (lighting_plan — fixture palette + drag placement, supports both upload and rectangle backdrops), `SheetCanvasCard` (chat dispatcher → mounts the right canvas), `SheetPreviewCard` (chat preview with iframe + download).
- Frontend chat surface: [`src/components/features/ai/AgentHub.tsx`](src/components/features/ai/AgentHub.tsx) — handles `sheet_created` (log only), `sheet_canvas_open` (creates `sheetCanvasData` message → renders `SheetCanvasCard`), `sheet_pdf_ready` (creates `sheetPdfData` message → renders `SheetPreviewCard`).
- Moodboard tab: [`src/components/business/moodboard/MoodboardSheetsTab.tsx`](src/components/business/moodboard/MoodboardSheetsTab.tsx) — sheet list with status badges, "+ New Sheet" dropdown grouped (Boards / Plans / Schedules / Decks). Clicking a sheet type navigates to `/agent-hub?agent=kai&q=<seeded-prompt>` so the JARVIS agent can drive the flow.
- Moodboard page: [`src/components/business/moodboard/MoodBoardDetailPage.tsx`](src/components/business/moodboard/MoodBoardDetailPage.tsx) — wrapped in `Tabs` (Items / Sheets).

**Chunk types** (agent → AgentHub):
- `sheet_created` — debit acknowledged, sheet row inserted (just for logging)
- `sheet_canvas_open` — interactive widget should mount; payload `{sheet_id, sheet_type, moodboard_id, initial_data, title}`
- `sheet_pdf_ready` — passive sheet rendered; payload `{sheet_id, sheet_type, title, pdf_url, page_count, credits_used}`

**Storage**: PDFs at `pdf-documents/moodboard-output/{moodboard_id}/sheet-{sheet_id}.pdf`. 7-day signed URLs (longer than quote outputs because clients keep reopening these). Bucket is private; service role writes, authed users read via signed URL.

**To activate** after pulling this branch: (1) apply both SQL migrations via Supabase, (2) `supabase functions deploy generate-moodboard-sheet-pdf`, (3) redeploy `agent-chat` so the new tool is loaded. Frontend ships with the next regular build.

**Known follow-ups (NOT shipped 2026-05-02):**
1. Auto Vision pre-fill for `annotated_render`. Today the agent passes `annotations: []` and the user adds them all in the canvas. The schema already supports `source: 'ai' | 'auto'` so plugging in a Claude Vision pass over the backdrop is a tool-side change only.
2. Auto color extraction for `color_palette`. Today the agent supplies the swatches manually. The `image_color_embeddings` (768D SLIG) collection plus a "top-K-cluster" service would auto-extract from any moodboard image.
3. Custom branding on title block. Spec says no branding for v1; user-profile-driven branding (logo, contact info) was deferred — the title block has 4 columns with PROJECT / SHEET / TYPE / DATE only.

### `area_breakdown` sheet type (2026-06-01)

Ninth sheet type added to the same machinery: a **single composited "design breakdown" board** (the Zubexa-style one-page room spec — hero render + dimensioned plan + elevation + Material & Finishes column + accessory/fitting columns + notes + color-palette strip). Passive (2 credits). Data shape `AreaBreakdownData` in [types.ts](supabase/functions/generate-moodboard-sheet-pdf/types.ts) — `{subtitle, hero_image_url, plan_image_url, elevation_image_url, finishes[], fitting_columns[], palette[], notes[]}`. Builder `buildAreaBreakdown` in [builders.ts](supabase/functions/generate-moodboard-sheet-pdf/builders.ts); wired into the agent tool, the router, the deck dispatch, and the frontend sheet picker/preview. Renders inside `full_deck` and Client Views like any other sheet.

## Project Client Views (2026-06-01 — project-scoped client deliverable, mirrors the quote PDF/share pattern)

A **Client View** is a project-level deliverable that bundles selected presentation sheets (across **any** of the project's moodboards) into one client-ready **PDF + revocable online page**. It sits one level above `full_deck`: `full_deck` stays the lightweight single-moodboard PDF sheet; a Client View selects sheets project-wide and adds an interactive HTML surface. **Zero overlap** — Sheets are content blocks, the moodboard is the working surface, the Client View is the deliverable.

Deliberately built to mirror the **quotes** generation/sharing pattern so artifacts are cleaned up identically — and **folded into the existing sheet functions** (no standalone client-view functions; see the merge-functions rule):
- **PDF**: handled by [`generate-moodboard-sheet-pdf`](supabase/functions/generate-moodboard-sheet-pdf/index.ts) — pass `{ client_view_id }` instead of `{ sheet_id }` and it renders the project-scoped deck via the same `buildFullDeckCover` + `buildSheetForDeck` builders → uploads to `pdf-documents/client-view-output/{project_id}/cv-{id}.pdf` → stores `pdf_storage_path` + `pdf_generation_status` (never a stale URL; re-signs on read).
- **HTML**: handled by [`moodboard-sheet-share`](supabase/functions/moodboard-sheet-share/index.ts) — it resolves BOTH a single-sheet `share_token` (→ `{sheet}`) and a Client View `public_share_token` (→ `{client_view}`), and accepts a `feedback` body for inline approve/comment. Public route `/cv/:token` ([PublicClientViewPage.tsx](src/pages/PublicClientViewPage.tsx)) embeds the deck PDF (iframe) **plus** what the PDF can't carry: live **Marble 3D walkthrough** (`vr_worlds`), **CSS lighting moods** over the hero render, **live FF&E table** from a linked quote, and inline **approve/comment** writing to `client_view_feedback`.

**Tables** (applied via `mcp__supabase__apply_migration`, NOT local SQL files):
- `project_client_views` — `sheet_ids uuid[]` (ordered, cross-moodboard) + `cover jsonb` + embed toggles (`embed_vr/embed_lighting/embed_ffe/feedback_enabled`) + `vr_world_id`/`quote_id` + quote-style PDF columns (`pdf_storage_path`, `pdf_generation_status`, `pdf_generated_at`, `page_count`, `error_message`) + quote-style share columns (`public_share_token` unique, `public_share_enabled`, `share_expires_at`, `share_view_count`). RLS: project owner full control; public read via the service-role share fn only.
- `client_view_feedback` — inline approvals/comments from the online page (service-role writes via share fn, owner reads).
- Cleanup wiring mirrors quotes: `_cleanup_client_view_pdf_storage()` AFTER DELETE trigger + **`build_storage_reference_set()` extended** with `project_client_views.pdf_storage_path` so the 72h orphan cron never reaps a live deliverable. `increment_client_view_count(uuid)` RPC bumps the view counter.

**Frontend**: [clientViewsService.ts](src/services/clientViewsService.ts) (list/get/create/update/remove/generatePdf/refreshPdfUrl/share/revokeShare/listFeedback/listVrWorlds) + a **Client View tab** on the project detail page ([ClientViewTab.tsx](src/modules/projects/components/tabs/ClientViewTab.tsx), owner-only) — pick + order sheets, toggle embeds, choose FF&E quote + 3D world, generate PDF, copy/disable share link, read client feedback inline.

**To activate** after pulling: `supabase functions deploy generate-moodboard-sheet-pdf moodboard-sheet-share agent-chat` (sheet PDF fn now also renders client views + `area_breakdown`; share fn now also resolves client-view tokens; agent-chat for the new `area_breakdown` tool option). Migrations already applied to the live DB. Frontend ships with the next build.

## FF&E Specification on Quotes
- **New fields on `quote_items`**: `room`, `dimensions`, `installation_requirements`, `delivery_date`
- **QuoteItemsList**: Room column, dimensions appended to product name, expandable detail row (notes + installation + delivery)
- **AddProductsSheet**: FF&E section in custom product form, room field in catalog product selection
- **PDF generation**: Room column in items table, dimensions in product name, "SPECIFICATIONS & DELIVERY" section at bottom
- **Service**: `QuotesService.addItem()`, `addCustomItem()`, `updateItem()` all accept FF&E fields

## Platform Secrets (centralised key store — 2026-04-22, Phase 2 2026-04-22)
Single registry for every external-service key the platform uses. `platform_secrets(key, value, primary_module_slug, …)` table + `platform_secret_module_links` many-to-many for shared keys (DATAFORSEO/PERPLEXITY/FIRECRAWL etc.). RLS locked to service_role; admins reach it through the `platform-secrets-admin` edge function which masks sensitive values in GETs and gates on admin/super_admin role.

- **Resolution priority is ALWAYS env-first, DB-second.** `_shared/secrets.ts → resolveSecret(supabase, key)` returns `{ value, source: 'env'|'db'|'default'|'missing' }`. Edge functions should call this rather than `Deno.env.get()` directly so the admin UI value is honored when env is unset.
- Env always wins because env represents an explicit deployer choice; the DB store exists so admins can configure non-env'd keys without a redeploy.
- **Admin UI**: per-module Settings tabs render `<SecretsManagerCard scope={{mode:'module', moduleSlug}}/>` showing the keys that module declares. `/admin/operations → Keys` renders `scope={{mode:'platform'}}` for keys with `primary_module_slug IS NULL` (AI providers, Stripe, VAPID, cron secret, etc.).
- A single secret can be declared by multiple modules via `platform_secret_module_links` — same row, edited from any of those tabs, used everywhere.
- Sensitive values are masked in admin GET responses (e.g. `sk_••••wxyz`). The plaintext only leaves the function when an edge function reads it via service-role for an actual outbound API call.

### Phase 2 — generic per-module Settings pages

Every registered module gets a Settings page at `/admin/modules/<slug>/settings` automatically — no per-module page code needed. The route is wired once in `App.tsx` and renders `<ModuleSettingsPage />`, which reads the slug from the URL and mounts `<SecretsManagerCard scope={{mode:'module', moduleSlug:slug}}/>`. A small key-icon button on `/admin/modules` links to the page for each enabled module.

Seeded keys (one row per key, sharing via `platform_secret_module_links`):

| Key | Primary module | Also surfaced on |
|---|---|---|
| `PERPLEXITY_API_KEY` | mention-monitoring | job-research, seo-toolkit, seo-interlinking |
| `FIRECRAWL_API_KEY` | mention-monitoring | job-research, greek-marketplaces, idealo, seo-toolkit, seo-interlinking |
| `DATAFORSEO_BASE64` | mention-monitoring | job-research, seo-toolkit, seo-interlinking |
| `DATAFORSEO_LOGIN/PASSWORD` | mention-monitoring | job-research |
| `YOUTUBE_DATA_API_KEY` | mention-monitoring | — |
| `ZERNIO_API_KEY/WEBHOOK_SECRET` | social-media | messaging (WhatsApp) |
| `RESEND_API_KEY` | email | — |

Platform-wide (no `primary_module_slug`, shown at `/admin/operations → Keys`): `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `VOYAGE_API_KEY`, `GEMINI_API_KEY`, `REPLICATE_API_TOKEN`, `REPLICATE_API_KEY`, `HF_TOKEN`, `HUGGINGFACE_API_KEY`, `SLIG_ENDPOINT_TOKEN`, `WORLDLABS_API_KEY`, `PINTEREST_APP_ID/SECRET/REDIRECT_URI`, `CRON_SECRET`, `ADMIN_RESTART_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `VAPID_*`.

### Edge-function migration (Phase 3 — completed)

Every edge function now honours admin-saved DB values when the env var is unset, via two mechanisms:

1. **`_shared/secrets-bootstrap.ts → bootstrapSecretsFromDb()` / `bootstrapForFunction()`** — at handler entry, reads every row in `platform_secrets` and calls `Deno.env.set(key, value)` for any key that doesn't already have an env value. Env always wins because `Deno.env.set()` skips keys with existing values. Memoised per worker so the cost is one DB read per cold start.

2. **`_shared/auth.ts → authenticate()`** awaits the bootstrap before returning, so any function calling `authenticate(req)` is automatically DB-aware. ~47 functions use this path.

3. **`bootstrapForFunction()`** is called explicitly at the top of every non-authenticate handler (crons, webhooks, public AI endpoints). ~26 additional functions migrated.

4. **`_shared/ai-client.ts`** — Google/Anthropic/Kling providers are now lazy `Proxy` objects that construct on first use, AFTER the handler's bootstrap has populated env. Existing call sites (`google(model)`, `google.image(model)`, `anthropic(model)`) are unchanged.

5. **Module-load env captures** (the old anti-pattern `const X = Deno.env.get('Y')` at the top of a file) have been converted across 41 files to lazy getters (`const X = () => Deno.env.get('Y')`) with all call sites rewritten to `X()`. This was the load-bearing change — without it, the bootstrap would populate env too late to matter.

**Result**: an admin can paste a key into the UI, and the edge function picks it up on its next invocation. Env-set deployments behave exactly as before.

## Legacy ERP connector — REMOVED (2026-06-07)
The legacy pre-invoice/ERP integration was **removed entirely**. It pushed accepted quotes to an external third-party ERP site as notices using a **single platform-wide API key** — which doesn't make sense in the multi-tenant marketplace (every tenant's pre-invoices would land in the one operator account). Its purpose (mirror invoices into that external ERP because the operator used it for accounting) is fully replaced by the **native finance module + the Novus connector → AADE/myDATA** direct transmission, which IS per-tenant correct (one master `NOVUS_API_KEY` + each tenant's own issuer VAT + their own TaxisNet authorization). That external ERP was only ever a **competitive benchmark** in the #207 audit — never a dependency.

Removed: the legacy ERP module folder, its edge functions and shared client, its API docs, the `push_to_*` path in `finance-issue-invoice`, its actions in `platform-secrets-admin`, its `platform_secrets` rows + `modules` row, and every related column on `quotes` / `invoices` / `products` / `crm_companies` / `crm_contacts` (all had 0 rows of data). If a future tenant independently uses such an ERP and wants mirroring, re-introduce it as a **per-workspace** `finance_connections`/`workspace_fiscal_bindings` connector with their **own** key — never a platform-wide key.

## myAADE Module — Greek Business Registry (ΑΑΔΕ) (2026-05-24)

Self-contained module that wraps ΑΑΔΕ web services (SOAP 1.2 + WS-Security UsernameToken) so the platform auto-fills the Business profile from a Greek ΑΦΜ. **Designed as a family of services** — RgWsPublic2 today, more `myaade-*` functions to come. See `src/modules/myaade/README.md` for the per-service add-pattern.

- **Module folder**: `src/modules/myaade/` (manifest, ModuleDefinition, services, page). Imported externally as `import { aadeService } from '@/modules/myaade'`.
- **Edge functions**: `supabase/functions/myaade-<service-slug>/` — one per ΑΑΔΕ service. Today: `myaade-rgwspublic2` (was `aade-vat-lookup` until 2026-05-24, renamed for naming consistency before more services landed).
- **Shared infrastructure**: `supabase/functions/_shared/aade/soap.ts` — `resolveAadeCredentials()`, `buildSoapEnvelope()`, `postSoap()`, `pickTag()` / `pickAllTagBlocks()`, `summarizeAadeError()`, `xmlEscape()`. Every new `myaade-*` function reuses these — a new wrapper is ~80 lines (response interface + per-record parser + body builder + standard `Deno.serve` shell).
- **Auth**: NOT regular TAXISnet creds. ΑΑΔΕ requires a separate "Ειδικοί Κωδικοί Πρόσβασης ΑΑΔΕ" (Special Access Codes) credential pair, created at https://www1.gsis.gr/sgsisapps/tokenservices/ and authorized per-service. See `/admin/modules/myaade` for the in-app walkthrough.
- **Configuration is PER-WORKSPACE (2026-06-24).** The RgWsPublic2 Special Access Codes (`username` + `password` + optional `afm_called_by`) live in `workspace_aade_credentials` (PK `workspace_id`, RLS `is_workspace_finance_manager`; masked status via `get_aade_creds_status` RPC — the password is never returned to the browser). `resolveAadeCredentials(supabase, workspaceId)` resolves **the workspace's own row first**; only the operator's **root** workspace (`workspaces.is_root`) falls back to env / `platform_secrets` `AADE_USERNAME`/`AADE_PASSWORD`/`AADE_AFM_CALLED_BY`. **Any other workspace with no row → `aade_not_configured` (503); tenants NEVER use the operator's master codes** — so each tenant's TAXISnet monthly quota + audit-inbox notification stays under their own identity. Every lookup caller passes the active `workspace_id`. Owners/finance-managers enter codes via `AadeCredentialsCard` in **Profile → Keys** (`/profile?tab=keys`) — the single home for all per-workspace BYOK cards (AADE, Resend, myDATA Inbox); Finance → Settings + `/admin/modules/myaade` now just link there. This is the **Special Access Codes** family (SOAP WS-Security) — distinct from the per-workspace **myDATA REST API** creds (`aade-user-id` + `Ocp-Apim-Subscription-Key`) in `workspace_inbound_credentials` used by the `finance-inbound-sync` received-docs poller. There is **no Azure** in this flow (`Ocp-Apim-Subscription-Key` is just AADE myDATA's Azure-APIM gateway header, not Document Intelligence).
- **TAXISnet audit notification**: every successful lookup writes an audit entry into the looked-up ΑΦΜ's TAXISnet inbox (per ΑΑΔΕ policy, can't be disabled). The module is wired to ONLY call ΑΑΔΕ when a user is verifying their OWN business — never as a customer/supplier research tool — so the notification lands in the same person's inbox who triggered it.
- **Cache + quota**: 90-day cache on `crm_companies.aade_data_at`. Same ΑΦΜ on the same company within 90 days hits cache → skips the SOAP call + the audit notification. Counts against TAXISnet's monthly quota only on actual calls.
- **DB columns added**: `crm_companies.{commercial_title, legal_status, kad_primary, kad_primary_description, kad_secondary jsonb, business_start_date, aade_data jsonb, aade_data_at}`. ΑΑΔΕ lookups also write the standard VIES-style `vat_validated*` columns with `vat_validation_source='aade'` — ΑΑΔΕ's `deactivation_flag` is treated as authoritative for Greek businesses.
- **Mount point**: `<AadeInline />` panel inside `src/components/core/Profile/BusinessSection.tsx`, gated on `country_code='EL' AND vat_number has 9 digits`. "Get full details from ΑΑΔΕ" button → one round trip → fills `name`, `street`, `street_number`, `postal_code`, `city`, `country`, `country_code`, `tax_office`, `profession`. Module also registers `/admin/modules/myaade` with a live "Test lookup" panel.

## Manufacturer Analytics (Enhanced)
- **Tracking service**: `src/services/manufacturerAnalyticsService.ts` — batched fire-and-forget event tracking (flush every 5s or 20 events)
- **Events**: `product_view`, `product_save`, `product_quote`, `product_search_impression`, `product_search_click`, `product_compare`
- **DB table**: `manufacturer_analytics_events` with indexes on event_type, product_id, manufacturer_id, user_id, created_at
- **ProductCard**: IntersectionObserver tracks views when card is 50% visible
- **AddToQuoteButton/AddToMoodboardButton**: Track quote/save events on success
- **Factory Analytics Dashboard**: Enhanced with Geographic Demand, Designer Engagement by Profession, Competitive Positioning sections
- **Tiered access**: `MyFactoryTab` accepts `tier` prop ('free'|'pro'|'enterprise'). Geographic/designer/competitive sections gated behind Pro.

## AR Material Preview (Plan 8)
- **Components**: `src/components/features/ar/` — ARPreviewModal, ViewInARButton, ARPage, useARSupport
- **⚠️ No PBR generation (corrected 2026-07-16)**: `generate-pbr-maps` was **deleted** in `75e9e843` — it had zero callers, so `metadata.pbr_maps` was never populated and AR/Lighting have always fallen back to the plain image. AR/Lighting only ever **read** `metadata.pbr_maps`; nothing writes it. There is no PBR credit cost because there is no PBR generation. Re-adding real PBR means rebuilding the generator, not just re-linking a viewer.
- **AR detection**: `useARSupport()` returns 'webxr' | 'quicklook' | 'desktop' | 'none'
- **Route**: `/ar/:productId` — standalone AR page for QR handoff from desktop
- **Integration**: ProductCard shows "AR View" button, opens ARPreviewModal (3D material swatch viewer)
- **Future**: @react-three/xr for full WebXR on Android, @google/model-viewer for iOS USDZ Quick Look
- **Credits**: AR viewing is free

## Lighting Simulation (Plan 10)
- **Layer 1 (AI)**: "Lighting Variants" dropdown on ProgressiveImageGrid — generates same room under 6 lighting presets via Gemini edit
- **Layer 2 (3D)**: `src/components/features/lighting/` — MaterialLightingViewer, LightingPreviewModal, lightingPresets, useSunPosition
- **Presets**: Natural Daylight, Golden Hour, Overcast, Showroom Spots, Warm Evening, Night
- **Controls**: Preset selector, time-of-day slider (6AM-9PM), room orientation (N/E/S/W), surface type (wall/floor/column/curved)
- **PBR**: `MeshPhysicalMaterial` supports albedo + normal + roughness + metalness maps, but **nothing populates `metadata.pbr_maps`** (see the AR note above — `generate-pbr-maps` was deleted in `75e9e843`), so in practice the viewer always uses the plain-image fallback
- **Integration**: ProductCard shows "Lighting" button, opens LightingPreviewModal
- **Sun calculation**: Built-in simplified solar position (no suncalc dependency) — altitude peaks at noon, color temp shifts warm↔cool

## Pinterest Integration (Plan 9)
- **Service**: `src/services/pinterestService.ts` — extractPin, importPin, importPinsBulk, OAuth board browsing
- **Modal**: `src/components/business/moodboard/PinterestImportModal.tsx` — single URL, bulk URL, and OAuth board browser
- **Edge functions**: `pinterest-import/index.ts` (oEmbed extraction + import), `pinterest-oauth/index.ts` (OAuth + board/pin API proxy)
- **Integration**: "Import from Pinterest" button on MoodBoardDetailPage header
- **Auto-matching**: Imported pin images run through MIVAA visual search to suggest matching catalog products
- **OAuth tokens**: Stored in `social_accounts` table (platform='pinterest'), auto-refresh on expiry
- **Phase 1 (no OAuth)**: Paste pin URL → oEmbed extraction → import image → AI match
- **Phase 2 (OAuth)**: Connect account → browse boards → select pins → bulk import
- **Env vars**: `PINTEREST_APP_ID`, `PINTEREST_APP_SECRET`, `PINTEREST_REDIRECT_URI`

## Design Inspiration URL Finder
- **Tool**: `analyze_inspiration_url` in `_shared/tools/search-tools.ts` — available to all users (JARVIS + Interior Designer agents)
- **Pipeline**: Firecrawl scrape URL → Claude Haiku extracts design tokens (colors, hex codes, materials, textures, styles, room type) → MIVAA 7-vector search for matching products
- **Frontend modal**: `InspirationUrlModal.tsx` — Globe icon button in chat toolbar, all agents
- **Frontend card**: `InspirationCard.tsx` — renders extracted palette swatches, material/style tags, hero image, source link
- **Chunk type**: `inspiration_analysis` emitted via onChunk during tool execution
- **Credit cost**: 1 credit (Firecrawl scrape) + Haiku token cost
- **Shared utility**: `_shared/utils/web-scraper.ts` — reusable `scrapeUrl()` extracted from b2b-tools

## Explainable Search Spec
- **Schema extension**: `material_search` tool now accepts optional `search_spec` object (intent, color_keywords, color_hex, material_types, style_keywords, texture_finish, specifications)
- **LLM-generated**: The agent fills in the spec as part of its tool call — no extra LLM call needed
- **Chunk type**: `search_spec` emitted via onChunk, stored as `pendingSearchSpec`, attached to assistant message
- **Frontend card**: `SearchSpecCard.tsx` — collapsible panel above product results showing color swatches, material/style tags, spec details
- **Persistence**: Saved to `searchSpec` field in message metadata, restored on conversation reload

## Virtual Staging Before/After QA
- **Component**: `VirtualStagingViewer.tsx` — replaces old static image display for virtual staging results
- **Before/After slider**: CSS clip-path based, pointer-drag interaction, no external dependency
- **Source image**: `source_image_url` now included in `virtualStagingData` (from both edge function chunk and frontend direct call)
- **Quality analysis**: "Analyze Quality" button sends both images to JARVIS for Claude Vision assessment (lighting, perspective, scale, materials, edge blending — scored 1-10)
- **Toggle**: "Before / After" button shows/hides the comparison slider

## Social publishing — Zernio (renamed from Late.dev, 2026-05-30)

The social-media backbone (`docs/social-media-system.md`) migrated off **Late.dev** to its renamed-and-rebuilt successor **Zernio** (`https://zernio.com/api/v1`, [docs.zernio.com](https://docs.zernio.com/sdks)). Full de-Late-ification:

- **Edge functions**: `late-api` → `zernio-api` (router + `handlers/{oauth,publish,analytics}.ts` + shared `zernio.ts`), `late-webhook-handler` → `zernio-webhook-handler`. Old function dirs deleted; `config.toml` updated (the prior split `late-oauth/publish/analytics` entries are gone). Frontend `SocialAccountsTab`, agent tools (`tools.ts`), and the two background agents (`social-analytics-sync`, `social-insights-sync`) all call `zernio-api` / Zernio REST.
- **DB**: `social_accounts.late_account_id` → `zernio_account_id`, `social_posts.late_post_id` → `zernio_post_id` (+ unique constraint renamed). New `social_zernio_profiles(workspace_id PK, zernio_profile_id)` mapping table — Zernio groups accounts under a **profile**, so we lazily find-or-create **one Zernio profile per workspace** (`ws:{workspace_id}`) and cache its id; falls back to the default profile if Zernio's plan ceiling (402/403) blocks creation. A profile holds many accounts, so multi-account-per-workspace is unchanged.
- **Secrets**: `ZERNIO_API_KEY` / `ZERNIO_WEBHOOK_SECRET` seeded in `platform_secrets` (module `social-media`). Resolver is **ZERNIO_\* first, legacy LATE_\* fallback**, so existing deploys keep working until the new key is pasted at `/admin/modules/social-media → Settings`. The Late key/service won't authenticate against Zernio — a real Zernio key is required.
- **API shape changes**: connect is `GET /v1/connect/{platform}?profileId=&redirect_url=` → `{authUrl}` (browser returns to the app with `?connected=&accountId=`; `SocialAccountsTab` finishes via `action:'callback'`). Publish is `POST /v1/posts` with `{content, platforms:[{platform,accountId}], mediaItems, publishNow|scheduledFor}`. Analytics: post → `GET /v1/analytics?postId=` (camelCase, `engagementRate`); best-time → `GET /v1/analytics/best-time?accountId=`; account insights → `GET /v1/accounts/follower-stats?accountIds=`. Webhook payload is `{event, post|account}` (not `{type,data}`) with `X-Zernio-Signature` HMAC-SHA256.
- **Activate after deploy**: (1) `supabase functions deploy zernio-api zernio-webhook-handler`; (2) paste `ZERNIO_API_KEY` + `ZERNIO_WEBHOOK_SECRET`; (3) in the Zernio dashboard register the OAuth redirect (the app profile page) and the webhook URL (`.../functions/v1/zernio-webhook-handler`).

## Messaging — WhatsApp via Zernio (Twilio + SMS removed, 2026-06-08)

The `messaging` module switched from **Twilio (SMS + WhatsApp)** to **Zernio WhatsApp** (Meta Cloud API). **SMS is gone entirely** — Zernio has no SMS; `messaging-webhook` (Twilio) was deleted; all `TWILIO_*` secrets + the `twilio-sms`/`twilio-whatsapp` pricing rows were removed. Full reference: [docs/api/messaging-api.md](docs/api/messaging-api.md).

- **Model shift**: a channel is now a connected Zernio WhatsApp **account** (a WABA number), not a typed-in phone string. `messaging_channels.zernio_account_id` + `config.{waba_id,phone_number_id,display_phone_number,profile_id}`, `provider='zernio'`. Connect via `messaging-api` action `connect-whatsapp` (Meta access token + WABA ID + phone number ID → `POST /v1/connect/whatsapp/credentials`) or **Sync from Zernio** (`GET /v1/accounts?platform=whatsapp`). Multi-tenant via the same `resolveWorkspaceProfile` (one Zernio profile per workspace) as social.
- **Sending**: cold/marketing sends **require a Meta-approved template** (24h-window rule); `messaging_templates.whatsapp_template_name` + `whatsapp_language_code` bind to it, `variables[]` is the ordered body-param list. `messaging-processor` loops `messaging_campaign_recipients` per-recipient via `sendWhatsAppMessage` (`POST /v1/inbox/conversations`). **Requires Zernio's Inbox add-on** (the `/v1/inbox/*` endpoints 403 without it). Credits debit as `zernio-whatsapp` (0.005/msg).
- **Reply capture (assign-on-reply)**: outbound sends create **no** inbox thread. The shared `zernio-webhook-handler` (one Zernio webhook for social `post.*` + WhatsApp `message.*`) handles `message.received` → upserts `messaging_conversations` (unique `(channel_id, contact_phone)`) + `messaging_conversation_messages`, **assigns the thread to the originating campaign owner on the first reply**, applies STOP/START opt-out keywords, and emits the `whatsapp.reply_received` flow event for notify. `message.delivered|read|failed` update `messaging_logs` by `provider_message_id` (=wamid). Both new tables are in `supabase_realtime`.
- **Fast-follow (NOT shipped 2026-06-08)**: the agent-facing **Inbox UI tab** (conversation list + assignment + reply box via `sendWhatsAppReply`) and a seeded `system-default` flow for `whatsapp.reply_received` (so the notify actually delivers). Service methods already exist (`listConversations`/`getConversationMessages`/`assignConversation`/`updateConversationStatus`).
- **Flow engine**: the `send_sms` action is now a legacy alias for `send_whatsapp` (both → `messaging-api` `send`, debit `zernio-whatsapp`).

## Knowledge Base — taxonomy mirror & ingest routing (2026-06-21)

KB categories now MIRROR the ingestion/PDF-processing taxonomy (`material_categories`), and auto-extracted catalog knowledge is filed into the matching per-material KB category instead of one flat bucket. The old `Materials Knowledge Base` category was removed (its docs re-routed: live-product docs → their material category, the rest → `General`).

- **Link**: `kb_categories.material_category_id` FK → `material_categories.id` (unique per workspace, partial index). `kb_upsert_mirrored_category(workspace, material_category_id)` find-or-creates/updates the mirrored KB category (parents materialized recursively → subcategories nest); mirrored categories are `access_level='public'` (visible + wipeable).
- **Sync**: trigger `material_categories_sync_kb` (AFTER INSERT/UPDATE OF name/display_name/description/parent_category_id/sort_order) propagates taxonomy changes to every workspace that already mirrors it; a new category/subcategory appears in those workspaces automatically.
- **Routing is centralized in the `upsert_kb_doc` RPC** — ALL ingest paths that create KB docs with a `product_id` route correctly without per-path code. Resolution: `products.category_id` → else `products.metadata->>'material_category'` (classifier vocab, matches `material_categories.category_key`) → else explicit `material_category` on the KB-doc metadata → else the workspace `General` fallback (slug `general`, `material_category_id=NULL`). NOTE: `metadata.category` on a KB doc is the KNOWLEDGE TYPE (certification/compliance/care/packaging/brand), NOT the material category.
- **Today only the PDF catalog path generates KB docs** (`auto_kb_document_service` / `catalog_knowledge_extractor` / `catalog_legend_extractor_v2` in MIVAA, all via `upsert_kb_doc`). XML import + Firecrawl scrape do NOT yet create KB docs — when they do (separate MIVAA task), they inherit correct routing for free by calling `upsert_kb_doc` with a `product_id`.
- **Reset interaction**: mirrored categories are public → their docs are cleaned by `wipe_unprotected_kb_docs()` (STEP 1.5 of reset-platform); category shells + agent/locked docs survive. `material_categories` itself is in NEVER_CLEAR (preserved).

## Design System Summary
Full reference: `.claude/design-system.md`
- **⚠️ 2026 redesign Phase 1 (foundation) landed** — supersedes the plum/blue→red bullets below. **Dark** = plum-black command center (`--background: 258 22% 5%`), flat **magenta** primary (`--primary: 335 74% 60%`). **Light** = warm olive/cream "ventureshub" (`--background: 42 27% 93%`, `--card: 48 30% 97%`), muted **khaki-olive** primary (`--primary: 56 23% 40%`), terracotta destructive. **Headings** use **Bricolage Grotesque** (`font-display`). The global `bg-primary → brand-gradient` rule was **removed** — primary fills are flat accent; the gradient is reserved for identity surfaces (PageHeader/logo/hero). Layout rebuilds (command center, product modal) are later phases.
- **Theme**: Dark mode. **Background**: near black (`--background: 0 0% 7%`). **Foreground**: light (`--foreground: 0 0% 92%`).
- **Primary**: brightened plum (`--primary: 330 50% 35%`). **Accent**: dark warm (`--accent: 22 60% 18%`).
- **Navigation**: Horizontal top nav bar (h-14), not sidebar. Logo left, nav center, profile right. Admin accessed via `/admin` page boxes.
- **Font**: Open Sans. `font-bold` → 300, `font-semibold/medium` → 400 globally. Headings are light weight by design.
- **Glass cards**: `.dashboard-card` class (rgba white 0.05 + blur 12px on dark). Never recreate inline.
- **Tabs active + hover**: both states render the **blue→red brand gradient** — the global `.bg-primary` / `.hover:bg-primary:hover` / `data-[state=active]:bg-primary` rule in [index.css](src/index.css) turns those `bg-primary` utilities into `var(--brand-gradient)` (NOT a flat plum). The base `tabs.tsx` TabsTrigger carries `hover:bg-primary hover:text-primary-foreground data-[state=active]:bg-primary data-[state=active]:text-primary-foreground`; the top-nav/sidebar items ([Sidebar.tsx](src/components/core/Sidebar.tsx)) use the same `bg-primary` active + `hover:bg-primary` so they gradient too. TabsList may carry `bg-muted` (the pill) or be transparent per-page. **NEVER add `rounded-full` to TabsTrigger** — that is only for Buttons.
- **Tables**: `<CardContent className="p-0">`, no wrapper div, no fixed column widths.
- **Buttons**: all pill-shaped (`rounded-full`). Variants: default (plum), outline, secondary, ghost, destructive, link.
