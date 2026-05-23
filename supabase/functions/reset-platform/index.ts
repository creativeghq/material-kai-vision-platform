import { createClient } from '@supabase/supabase-js';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticate, isAdminAccess } from '../_shared/auth.ts';
import { withApiLogging } from '../_shared/api-logger.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
const MIVAA_GATEWAY_URL = Deno.env.get('MIVAA_GATEWAY_URL') || 'https://v1api.materialshub.gr';
const MIVAA_API_KEY = Deno.env.get('MIVAA_API_KEY') || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ============================================================
// PRESERVED (never deleted during platform reset):
//
// DB Tables:
//   - system_settings          ← /admin/system-settings config
//   - upsells                  ← global admin-managed upsell catalogue
//   - timeline_steps           ← global project timeline steps
//   - flows                    ← flow engine definitions (admin-managed)
//   - background_agents        ← background agent definitions (admin-managed)
//   - roles / role_permissions ← RBAC
//   - ai_model_pricing         ← pricing reference data
//   - subscription_plans       ← billing plans
//   - webhook_endpoints        ← configured webhook URLs
//   - kb_docs / kb_categories / kb_doc_attachments / kb_search_analytics
//                              ← Knowledge Base (admin-managed docs)
//   - crm_companies / crm_contacts / crm_contact_relationships / crm_company_contacts
//                              ← CRM (user request — keep contacts)
//   - profiles / auth.users / workspaces / workspace_members
//                              ← user accounts & workspaces
//
//   ── Credits & Billing (DO NOT TOUCH) ──
//   - user_credits             ← per-user credit balances
//   - credit_transactions      ← full credit debit/top-up history
//   - credit_packages          ← available credit package catalogue
//
//   ── Prompts (admin-managed) ──
//   - prompts                  ← saved agent/system prompts
//   - extraction_prompts       ← PDF extraction prompt configurations
//   - prompt_history           ← audit trail — TRIMMED to 5 most recent per prompt_id (not wiped)
//
//   ── Price Monitoring (DO NOT WIPE — long-running observational state) ──
//   Price-history series are only useful when contiguous; a reset would
//   destroy weeks/months of trend data and invalidate sanity bands,
//   volatility scoring, classifier learnings, and brand-retailer cache.
//   Customer-facing tracked_queries (external API consumers) MUST survive.
//   Internal product monitoring also lives in tracked_queries now (api_key_id
//   IS NULL + product_id NOT NULL) — the legacy competitor_sources /
//   price_history / price_monitoring_products / product_excluded_urls tables
//   were dropped 2026-05-01.
//   - tracked_queries                 ← every monitored subject (internal + external)
//   - tracked_query_price_history     ← every price snapshot (internal + external)
//   - tracked_query_promoted_urls     ← sticky admin URL overrides
//   - tracked_query_excluded_urls     ← per-tracked-query exclusion list
//   - price_lookups                   ← external /lookup usage log
//   - price_discrepancies             ← cross-source disagreement log
//   - price_alert_log                 ← dispatched alert audit + dedupe
//   - match_corrections               ← admin "wrong match" feedback (few-shot)
//   - classifier_verdict_cache        ← Haiku product-identity verdict cache (7d TTL)
//   - brand_retailer_index            ← (brand, retailer_domain, country) cache
//   - retailer_extraction_recipes     ← per-retailer selector recipes + self-heal stats
//
// Storage Buckets (5 anchors post-consolidation 2026-05-23):
//   - pdf-documents            ← KB raw uploads + catalog-output/ + quote-output/ + moodboard-output/
//   - pdf-tiles                ← extracted/ (KB) + catalog-extracted/
//   - generation-images        ← AI outputs + product-crops/ + 3d/ + designer/ + agent/ + social/
//   - quote-templates          ← quote + catalog/ template assets (admin uploads)
//   - moodboard-sheet-references ← static UI illustrations for sheet picker
//   - profile-avatars          ← user avatar images ({userId}/avatar.ext)
// ============================================================

// Tables to clear (in order to respect foreign key constraints).
// Order matters — delete child tables before parent tables.
//
// Grouped by functional area. Anything that caches, embeds, summarizes or
// logs derived/AI-produced data MUST be in this list — otherwise a "reset"
// leaves behind stale state that the AI will happily serve back to users
// (hallucination from ghost data).
const TABLES_TO_CLEAR = [
  // ── Agent Chat (user conversations) ─────────────────────────────────
  'agent_chat_messages',           // Chat messages (child of conversations)
  'agent_chat_conversations',      // Chat conversations
  'agent_uploaded_files',          // Files uploaded in chat

  // ── Background Agent Framework (runs + state, NOT definitions) ──────
  // NOTE: 'background_agents' (agent definitions) is PRESERVED — admin config.
  'agent_tool_call_logs',          // Per-tool-call log (child of agent_runs)
  'agent_run_logs',                // Run log lines (child of agent_runs)
  'agent_runs',                    // Background agent runs
  'agent_checkpoints',             // Agent intermediate checkpoints
  'agent_memories',                // Agent long-term memory (hallucination risk)
  'agent_usage_logs',              // Per-run token/cost usage
  'agent_tasks',                   // Agent task records

  // ── Flow Engine ─────────────────────────────────────────────────────
  'flow_run_steps',                // Step runs (child of flow_runs)
  'flow_runs',                     // Flow runs
  // NOTE: 'flows' (definitions) is PRESERVED — admin config.

  // ── Quotes System (except global upsells and timeline steps) ────────
  'quote_timeline',                // Quote timeline progress
  'quote_upsells',                 // Quote upsells junction
  'quote_items',                   // Quote items
  'quote_requests',                // Quote requests
  'quotes',                        // Quotes
  'status_tags',                   // Custom status tags

  // ── Moodboards ──────────────────────────────────────────────────────
  'moodboard_comments',            // Comments on moodboards
  'moodboard_quote_requests',      // Moodboard quote requests
  'moodboard_products',            // Moodboard products
  'moodboard_items',               // Moodboard items
  'moodboards',                    // Moodboards

  // ── 3D / Video / VR generation ──────────────────────────────────────
  'generation_3d_segments',        // 3D generation segments (child of generation_3d)
  'generation_3d',                 // 3D generation history
  'generation_videos',             // Video generation history
  'vr_worlds',                     // WorldLabs Marble VR worlds

  // ── Analytics (user-generated + derived metrics) ────────────────────
  'analytics_events',              // Analytics events
  'manufacturer_analytics_events', // Manufacturer product view/save/quote events
  'quality_metrics_daily',         // Daily quality metrics
  'quality_scoring_logs',          // Quality scoring logs
  'recommendation_analytics',      // Recommendation analytics
  'recommendation_scores',         // Cached recommendation scores
  'response_quality_metrics',      // Assistant response quality
  'retrieval_quality_metrics',     // RAG retrieval quality
  'user_interaction_events',       // User interaction events
  'user_material_interactions',    // Per-user material interactions
  'user_behavior_profiles',        // Derived personalization profiles (hallucination risk)

  // ── Search caches & derived search state (direct hallucination risk)
  'saved_searches',                // User saved searches
  'search_analytics',              // Search analytics events
  'search_query_corrections',      // Derived query corrections
  'search_query_tracking',         // Per-query tracking
  'search_sessions',               // Search sessions
  'search_suggestion_clicks',      // Suggestion click tracking
  'search_suggestions',            // Derived autocomplete suggestions
  'trending_searches',             // Trending terms
  'unmatched_term_frequency',      // Unknown term frequency
  'query_intelligence',            // Derived query intelligence
  'query_understanding_cache',     // Cached NL→query parses (hallucination risk)
  'duplicate_detection_cache',     // Cached duplicate detection
  'product_similarity_cache',      // Cached product similarity

  // ── Document Entities & Relationships ───────────────────────────────
  'product_document_relationships',// Product↔document entity relationships
  'document_entities',             // Document entities (certificates, logos, specs)

  // ── Relevancy Relationships ─────────────────────────────────────────
  'image_product_associations',    // Image↔product associations
  'chunk_product_relationships',   // Chunk↔product relevancies
  'chunk_image_relationships',     // Chunk↔image relevancies
  'chunk_relationships',           // Chunk↔chunk relationships
  'material_metadata_values',      // Material metadata values
  'material_metadata_relevancy',   // Material metadata relevancy

  // ── PDF Processing & Chunking (derivative data) ─────────────────────
  // job_checkpoints + job_progress dropped — history is now stored as
  // JSONB arrays on background_jobs (stage_history, recovery_history).
  'ai_analysis_queue',             // AI analysis queue
  'image_processing_queue',        // Image processing queue
  'claude_validation_queue',       // Claude validation queue
  'processing_queue',              // Generic processing queue
  'processing_metrics',            // Processing metrics
  'batch_jobs',                    // Batch jobs
  'embeddings',                    // Text/image embeddings (public schema)
  'embedding_stability_metrics',   // Embedding drift metrics
  'product_tables',                // YOLO extracted tables
  'product_layout_regions',        // YOLO layout regions
  'product_enrichments',           // Product enrichment results
  'product_merge_history',         // Product merge history
  'product_processing_status',     // Product processing status
  'product_usage_stats',           // Product usage stats
  'chunk_boundaries',              // Chunk boundary metadata
  'chunk_classifications',         // Chunk classifications
  'chunk_quality_flags',           // Chunk quality flags
  'chunk_validation_scores',       // Chunk validation scores
  'category_extractions',          // Category extraction results
  'document_layout_analysis',      // YOLO document layout
  'document_processing_status',    // Document processing status
  'document_quality_metrics',      // Document quality metrics
  'ocr_results',                   // OCR results
  'spatial_analysis',              // Spatial analysis results
  'pdf_processing_results',        // PDF processing results
  'pdf_integration_health_results',// PDF integration health
  'validation_results',            // Validation results
  'review_summaries',              // Derived review summaries
  'document_images',               // Extracted images from PDFs
  'document_chunks',               // Semantic text chunks
  'products',                      // Extracted products
  'background_jobs',               // Processing jobs
  'documents',                     // PDF documents metadata
  'processed_documents',           // Processed document records

  // ── Materials & Catalog (user-populated) ────────────────────────────
  'material_images',               // Material images
  'material_properties',           // Material properties
  'material_categories',           // Material categories
  'materials_catalog',             // Materials catalog entries

  // ── Processing Results ──────────────────────────────────────────────
  'processing_results',            // Processing results

  // ── Web Scraping ────────────────────────────────────────────────────
  'scraped_materials_temp',        // Temporary scraped materials
  'scraping_pages',                // Scraping pages (child of sessions)
  'scraping_sessions',             // Scraping sessions

  // ── Data Import ─────────────────────────────────────────────────────
  'data_import_jobs',              // Data import jobs
  'data_import_history',           // Data import history

  // ── Generic Uploads ─────────────────────────────────────────────────
  'uploaded_files',                // Generic uploaded files

  // ── API / Webhook Logs ──────────────────────────────────────────────
  'ai_call_logs',                  // AI call logs (per-call)
  'ai_usage_logs',                 // AI usage aggregates
  'api_usage_logs',                // API usage logs
  'mivaa_api_usage_logs',          // MIVAA API usage logs
  'webhook_calls',                 // Webhook call history

  // ============================================================
  // PRESERVED (not in this list — see header comment for full list):
  // - Knowledge Base (kb_*)
  // - CRM (crm_*)
  // - Users / Profiles / Workspaces / Credits
  // - Admin config: system_settings, prompts, extraction_prompts,
  //   upsells, timeline_steps, flows, background_agents, roles,
  //   ai_model_pricing, subscription_plans, webhook_endpoints, etc.
  // - prompt_history — trimmed separately (keep 5 most recent per prompt)
  // - Price Monitoring (tracked_queries, tracked_query_price_history,
  //   tracked_query_promoted_urls, tracked_query_excluded_urls,
  //   price_lookups, price_discrepancies, price_alert_log,
  //   match_corrections, classifier_verdict_cache, brand_retailer_index,
  //   retailer_extraction_recipes)
  //   ⚠️ DO NOT add price-monitoring tables here — long-running
  //   observational data, customer-facing API state, and learned caches.
  // ============================================================
];

// ============================================================
// Storage buckets to clear (AI/processing-generated content only)
//
// Post-consolidation (2026-05-23): 5 anchor buckets exist. We clear the two
// that hold regenerable AI/processing output. pdf-documents holds raw user
// uploads (KB) plus generated outputs (catalog-output/, quote-output/,
// moodboard-output/) — those outputs become orphans when their DB rows are
// cleared above and the nightly storage-orphan-cleanup-cron sweeps them
// within 24h.
//
// PRESERVED buckets:
//   - pdf-documents                ← KB raw uploads + generated outputs (cleaned by orphan cron)
//   - quote-templates              ← admin-uploaded template assets (quotes + catalog branding)
//   - profile-avatars              ← user avatars (kept across resets)
//   - moodboard-sheet-references   ← admin-curated UI illustrations
// ============================================================
const BUCKETS_TO_CLEAR = ['pdf-tiles', 'generation-images'];

/**
 * Recursively list every file path in a bucket folder (handles subdirectories).
 * Returns a flat array of full file paths suitable for storage.remove().
 *
 * Paginates using offset so buckets with >1000 files are fully enumerated.
 */
async function listAllFiles(bucketName: string, folderPath = ''): Promise<string[]> {
  const PAGE_SIZE = 1000;
  const filePaths: string[] = [];
  let offset = 0;

  while (true) {
    const { data: items, error } = await supabase.storage
      .from(bucketName)
      .list(folderPath || undefined, { limit: PAGE_SIZE, offset });

    if (error || !items || items.length === 0) break;

    for (const item of items) {
      const itemPath = folderPath ? `${folderPath}/${item.name}` : item.name;

      if (item.metadata == null) {
        // item.metadata is null for folders — recurse (folders are never paginated)
        const nested = await listAllFiles(bucketName, itemPath);
        filePaths.push(...nested);
      } else {
        filePaths.push(itemPath);
      }
    }

    // If fewer than PAGE_SIZE were returned we've reached the end
    if (items.length < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return filePaths;
}

/**
 * Reset Platform Edge Function
 * Clears all user-generated data while preserving system configuration.
 *
 * PRESERVED: system_settings, upsells, timeline_steps, kb_* tables,
 *            crm_companies, crm_contacts, profiles/auth.users,
 *            user_credits, credit_transactions, credit_packages,
 *            prompts, extraction_prompts, prompt_history,
 *            price-monitoring tables (tracked_queries,
 *            tracked_query_price_history, tracked_query_promoted_urls,
 *            tracked_query_excluded_urls, price_lookups,
 *            price_discrepancies, price_alert_log, match_corrections,
 *            classifier_verdict_cache, brand_retailer_index,
 *            retailer_extraction_recipes),
 *            quote-templates bucket, pdf-documents bucket, profile-avatars bucket
 */
Deno.serve(withApiLogging('reset-platform', async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Authenticate request - requires admin role
    // Secret key bypasses role check
    const auth = await authenticate(req, {
      allowedRoles: ['admin'],
    });

    if (!auth.success && !isAdminAccess(auth)) {
      return new Response(
        JSON.stringify({ error: auth.error || 'Unauthorized' }),
        { status: auth.error?.includes('Required roles') ? 403 : 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!body.confirm) {
      return new Response(
        JSON.stringify({ error: 'Confirmation required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('🔄 Starting platform reset...');
    const results: any = {
      tables: [],
      storage: [],
    };
    let totalDeleted = 0;

    // STEP 1: Clear database tables
    console.log('\n🗑️  STEP 1: Clear database tables');
    for (const tableName of TABLES_TO_CLEAR) {
      try {
        console.log(`   Clearing ${tableName}...`);

        // Get count before deletion
        const { count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true });

        if (count === 0) {
          console.log(`   ✅ ${tableName} is already empty`);
          results.tables.push({ table: tableName, deleted: 0 });
          continue;
        }

        // Delete all rows
        const { error } = await supabase
          .from(tableName)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (error) {
          console.error(`   ❌ Failed to clear ${tableName}:`, error);
          results.tables.push({ table: tableName, deleted: 0, error: error.message });
        } else {
          console.log(`   ✅ Deleted ${count} rows from ${tableName}`);
          results.tables.push({ table: tableName, deleted: count });
          totalDeleted += count || 0;
        }
      } catch (error: any) {
        console.error(`   ❌ Error clearing ${tableName}:`, error);
        results.tables.push({ table: tableName, deleted: 0, error: error.message });
      }
    }

    // STEP 2: Clear storage buckets (AI/processing content only — NOT quote-templates or pdf-documents)
    console.log('\n🗑️  STEP 2: Clear storage buckets');

    for (const bucketName of BUCKETS_TO_CLEAR) {
      try {
        console.log(`   Clearing bucket: ${bucketName}...`);

        // Recursively list all files including those in subdirectories
        const allFiles = await listAllFiles(bucketName);

        if (allFiles.length === 0) {
          console.log(`   ✅ Bucket ${bucketName} is already empty`);
          results.storage.push({ bucket: bucketName, deleted: 0 });
          continue;
        }

        // Delete in batches of 100 (Supabase storage remove limit)
        const BATCH_SIZE = 100;
        let totalDeletedFromBucket = 0;
        let bucketError: string | undefined;

        for (let i = 0; i < allFiles.length; i += BATCH_SIZE) {
          const batch = allFiles.slice(i, i + BATCH_SIZE);
          const { error: deleteError } = await supabase.storage.from(bucketName).remove(batch);

          if (deleteError) {
            console.error(`   ❌ Failed to delete batch from ${bucketName}:`, deleteError);
            bucketError = deleteError.message;
          } else {
            totalDeletedFromBucket += batch.length;
          }
        }

        console.log(`   ✅ Deleted ${totalDeletedFromBucket} files from ${bucketName}`);
        results.storage.push({ bucket: bucketName, deleted: totalDeletedFromBucket, error: bucketError });
      } catch (error: any) {
        console.error(`   ❌ Error clearing bucket ${bucketName}:`, error);
        results.storage.push({ bucket: bucketName, deleted: 0, error: error.message });
      }
    }

    const totalStorageDeleted = results.storage.reduce((sum: number, r: any) => sum + (r.deleted || 0), 0);

    // STEP 3: Clear VECS collections (vector embeddings)
    console.log('\n🗑️  STEP 3: Clear VECS collections');
    results.vecs = [];

    // VECS collections to clear — every image embedding collection.
    // Missing even one causes the AI to retrieve ghost images after reset.
    const vecsCollections = [
      'image_slig_embeddings',          // Primary visual embeddings (SigLIP2, 768D)
      'image_color_embeddings',         // Color-focused SLIG (768D)
      'image_texture_embeddings',       // Texture pattern SLIG (768D)
      'image_style_embeddings',         // Design style SLIG (768D)
      'image_material_embeddings',      // Material type SLIG (768D)
      'image_understanding_embeddings', // Voyage AI understanding embeddings from Qwen3-VL vision_analysis (1024D)
    ];
    for (const collection of vecsCollections) {
      try {
        console.log(`   Clearing vecs.${collection}...`);

        // Query VECS table directly (schema: vecs)
        const { count, error: countError } = await supabase
          .schema('vecs')
          .from(collection)
          .select('*', { count: 'exact', head: true });

        if (countError) {
          console.log(`   ⚠️ Could not count vecs.${collection}: ${countError.message}`);
          results.vecs.push({ collection, deleted: 0, error: countError.message });
          continue;
        }

        if (!count || count === 0) {
          console.log(`   ✅ vecs.${collection} is already empty`);
          results.vecs.push({ collection, deleted: 0 });
          continue;
        }

        // Delete all rows from VECS collection
        const { error: deleteError } = await supabase
          .schema('vecs')
          .from(collection)
          .delete()
          .neq('id', '00000000-0000-0000-0000-000000000000');

        if (deleteError) {
          console.error(`   ❌ Failed to clear vecs.${collection}:`, deleteError);
          results.vecs.push({ collection, deleted: 0, error: deleteError.message });
        } else {
          console.log(`   ✅ Deleted ${count} rows from vecs.${collection}`);
          results.vecs.push({ collection, deleted: count });
        }
      } catch (error: any) {
        console.error(`   ❌ Error clearing vecs.${collection}:`, error);
        results.vecs.push({ collection, deleted: 0, error: error.message });
      }
    }

    const totalVecsDeleted = results.vecs.reduce((sum: number, r: any) => sum + (r.deleted || 0), 0);

    // STEP 4: Trim prompt_history to keep only the 5 most recent rows per prompt_id.
    // prompt_history is the audit trail of admin edits to prompts — we keep a
    // short rolling window rather than wiping it (so admins can still roll back
    // a recent change), but we don't let it grow unbounded across resets.
    console.log('\n🗑️  STEP 4: Trim prompt_history (keep 5 most recent per prompt)');
    results.prompt_history = { deleted: 0 };
    try {
      const { data: trimResult, error: trimError } = await supabase.rpc('trim_prompt_history', { keep_n: 5 });
      if (trimError) {
        console.error('   ❌ prompt_history trim failed:', trimError);
        results.prompt_history = { deleted: 0, error: trimError.message };
      } else {
        const trimmed = typeof trimResult === 'number' ? trimResult : 0;
        console.log(`   ✅ Trimmed ${trimmed} old prompt_history rows`);
        results.prompt_history = { deleted: trimmed };
      }
    } catch (error: any) {
      console.error('   ❌ prompt_history trim error:', error);
      results.prompt_history = { deleted: 0, error: error.message };
    }

    // STEP 5: Wipe MIVAA server /tmp folder.
    // Calls the admin cleanup endpoint on the Python backend with
    // max_age_hours=0 so every non-system temp file is removed.
    console.log('\n🗑️  STEP 5: Clear MIVAA server /tmp folder');
    results.server_tmp = { called: false };
    try {
      const tmpRes = await fetch(
        `${MIVAA_GATEWAY_URL}/api/system/cleanup-temp-files?max_age_hours=0&dry_run=false`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(MIVAA_API_KEY ? { Authorization: `Bearer ${MIVAA_API_KEY}` } : {}),
          },
        },
      );

      if (!tmpRes.ok) {
        const text = await tmpRes.text();
        console.error(`   ❌ MIVAA cleanup HTTP ${tmpRes.status}:`, text);
        results.server_tmp = { called: true, ok: false, status: tmpRes.status, error: text };
      } else {
        const tmpJson = await tmpRes.json();
        const freedMb = tmpJson?.stats?.total_size_freed_mb ?? 0;
        console.log(`   ✅ MIVAA /tmp cleanup complete — ${freedMb.toFixed?.(2) ?? freedMb} MB freed`);
        results.server_tmp = { called: true, ok: true, stats: tmpJson?.stats || null };
      }
    } catch (error: any) {
      console.error('   ❌ MIVAA cleanup call failed:', error);
      results.server_tmp = { called: true, ok: false, error: error.message };
    }

    const successfulTables = results.tables.filter((r: any) => !r.error).length;
    const failedTables = results.tables.filter((r: any) => r.error).length;
    console.log(`✅ Platform reset complete. Tables: ${totalDeleted} rows across ${successfulTables}/${TABLES_TO_CLEAR.length} tables (${failedTables} errors), Storage: ${totalStorageDeleted} files, VECS: ${totalVecsDeleted} embeddings, prompt_history trimmed: ${results.prompt_history.deleted}, server /tmp: ${results.server_tmp.ok ? 'cleaned' : 'skipped/failed'}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: `Deleted ${totalDeleted} rows from ${successfulTables}/${TABLES_TO_CLEAR.length} tables (${failedTables} failed), ${totalStorageDeleted} files from storage, ${totalVecsDeleted} embeddings from VECS, trimmed ${results.prompt_history.deleted} prompt_history rows, and ${results.server_tmp.ok ? 'cleaned' : 'failed to clean'} MIVAA /tmp`,
        results,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: any) {
    console.error('❌ Reset platform error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
}));
