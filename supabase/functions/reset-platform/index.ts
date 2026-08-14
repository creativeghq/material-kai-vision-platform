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
// LOCK RULE: any row with a boolean `is_locked = true` is NEVER deleted, in
// any cleared table (discovered dynamically via the reset_lock_aware_tables
// RPC). Lockable tables today are flows + facet_canonical_values (both already
// preserved); the guard is future-proof for anything lockable that later lands
// in the clear list. Knowledge Base CATEGORIES are preserved in full; KB DOCS
// are preserved except UNPROTECTED docs (public/unlocked/non-auto-synced — the
// auto-extracted catalog docs in the public per-material categories that mirror
// the ingestion taxonomy: Tiles/Wood/Heating/…/General), which are cleaned in
// STEP 1.5 via wipe_unprotected_kb_docs(). Locked/agent-level KB docs survive.
// PRESERVED (never deleted during platform reset):
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
//   - kb_categories / kb_doc_attachments / kb_search_analytics
//                              ← KB categories preserved in full
//   - kb_docs                  ← Knowledge Base docs — preserved EXCEPT unprotected
//                                (public/unlocked/non-auto-synced) docs, which are
//                                cleaned in STEP 1.5 (wipe_unprotected_kb_docs)
//   - crm_companies / crm_contacts / crm_contact_relationships / crm_company_contacts
//                              ← CRM (user request — keep contacts)
//   - profiles / auth.users / workspaces / workspace_members
//                              ← user accounts & workspaces
//   ── Credits & Billing (DO NOT TOUCH) ──
//   - user_credits             ← per-user credit balances
//   - credit_transactions      ← full credit debit/top-up history
//   - credit_packages          ← available credit package catalogue
//   ── Prompts (admin-managed) ──
//   - prompts                  ← saved agent/system prompts
//   - prompt_history           ← audit trail — TRIMMED to 5 most recent per prompt_id (not wiped)
//   ── Price Monitoring (DO NOT WIPE — long-running observational state) ──
//   Price-history series are only useful when contiguous; a reset would
//   destroy weeks/months of trend data and invalidate sanity bands,
//   volatility scoring, classifier learnings, and brand-retailer cache.
//   Customer-facing tracked_queries (external API consumers) MUST survive.
//   Internal product monitoring also lives in tracked_queries now (api_key_id
//   IS NULL + product_id NOT NULL) — the legacy competitor_sources /
//   price_history / price_monitoring_products / product_excluded_urls tables
//   were dropped.
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
//   ── Finance / Fiscal (LEGALLY RETAINED — NEVER WIPE) ──
//   Greek myDATA/AADE records are legally required to be retained. A reset
//   here is irreversible data destruction with compliance consequences.
//   - invoices / invoice_items / credit_notes / credit_note_items
//   - supplier_bills / supplier_credit_notes / supplier_credit_note_items
//   - payments / payment_allocations / planned_payments / cheques
//   - delivery_notes / delivery_note_items / inbound_documents
//   - stock_allocations / supplier_products / warehouse_coverage
//   - stock_movements / time_entries
//   - warehouses / warehouse_items / warehouse_pending_items
//   - pos_sessions / pos_cash_movements / pos_signatures / pos_terminals
//   - document_series             ← legal invoice/receipt numbering sequences
//   - fiscal_connectors / fiscal_submissions   ← AADE/Novus transmission ledger
//   - finance_settings / finance_branches / finance_categories / pricing_rules
//   - trip_expense_items / trip_expense_reports
//   - workspace_fiscal_bindings / workspace_inbound_credentials
//     / workspace_payment_config / workspace_storefront / workspace_doc_type
//     / workspace_module_entitlements
//   ── Secrets & API keys (NEVER WIPE) ──
//   - platform_secrets / platform_secret_module_links
//   - api_keys                    ← CASCADE root: deleting wipes every external
//                                    customer's tracked_queries/mentions/jobs
//   - material_kai_keys
//   ── Customer-facing monitoring (DO NOT WIPE — same policy as price monitoring) ──
//   Long-running observational series + external API consumer state.
//   - tracked_mentions + mention_history / mention_outlets / mention_promoted_urls
//     / mention_excluded_urls / mention_match_corrections / mention_alert_log
//     / mention_classifier_verdict_cache / llm_mention_probes
//   - tracked_jobs + job_listings / job_excluded_urls / job_match_corrections
//     / job_alert_log / job_classifier_verdict_cache / job_research_sites
//   - seo_tracked_domains / seo_research_runs / seo_domain_audit_history
//   ── Agent Fabric persistent layer (NEVER WIPE, secrets cascade) ──
//   - agent_definitions / agent_projects / agent_project_secrets
//     / agent_project_deployments / agent_project_snapshots
//     (only the runtime — agent_runs/agent_artifacts/agent_inbox_messages — is cleared)
//   ── Connection tokens (NEVER WIPE — re-auth pain) ──
//   - social_accounts / social_zernio_profiles
//   - messaging_channels / messaging_settings / messaging_optouts (compliance)
//   ── Config / reference ──
//   - modules / api_endpoints / mydata_reference / aade_lookup_log
//   - xml_mapping_templates / flow_area_registry / category_complement_rules
//   - catalog_templates           ← admin branding assets (parallels quote-templates)
//   - material_categories         ← admin-curated materials taxonomy that drives the
//                                    ingestion/PDF-processing classifier (ai_extraction_
//                                    enabled, prototype embeddings). NOT user content —
//                                    wiping it breaks discovery until re-seeded.
// Storage Buckets (6 buckets post-consolidation 2026-05-23):
//   - pdf-documents            ← KB raw uploads + catalog-output/ + quote-output/ + moodboard-output/
//   - pdf-tiles                ← extracted/ (KB) + catalog-extracted/
//   - generation-images        ← AI outputs + product-crops/ + 3d/ + designer/ + agent/ + social/
//   - quote-templates          ← quote + catalog/ template assets (admin uploads)
//   - moodboard-sheet-references ← static UI illustrations for sheet picker
//   - profile-avatars          ← user avatar images ({userId}/avatar.ext)
// ============================================================

// Tables to clear (in order to respect foreign key constraints).
// Order matters — delete child tables before parent tables.
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
  // 'background_agents' (agent definitions) is PRESERVED — admin config.
  'agent_tool_call_logs',          // Per-tool-call log (child of agent_runs)
  'agent_run_logs',                // Run log lines (child of agent_runs)
  'agent_runs',                    // Background agent runs
  'agent_checkpoints',             // Agent intermediate checkpoints
  'agent_memories',                // Agent long-term memory (hallucination risk)
  'agent_usage_logs',              // Per-run token/cost usage
  'agent_tasks',                   // Agent task records

  // ── Agent Fabric runtime — runtime only; the persistent layer
  //    (agent_definitions / agent_projects / agent_project_secrets /
  //    agent_project_deployments / agent_project_snapshots) is PRESERVED in
  //    NEVER_CLEAR — agent_project_secrets CASCADEs from agent_projects, so the
  //    whole persistent layer must survive to keep secrets safe.
  'agent_artifacts',               // Run output artifacts (CASCADE child of agent_runs)
  'agent_inbox_messages',          // Inter-agent inbox messages (SET NULL from agent_runs)

  // ── Flow Engine ─────────────────────────────────────────────────────
  'flow_run_steps',                // Step runs (child of flow_runs)
  'flow_runs',                     // Flow runs
  // 'flows' (definitions) is PRESERVED — admin config.

  // ── Quotes System (except global upsells and timeline steps) ────────
  'quote_analytics_events',        // Quote view/interaction analytics
  'quote_activities',              // Quote activity log
  'quote_timeline',                // Quote timeline progress
  'quote_upsells',                 // Quote upsells junction
  'quote_items',                   // Quote items
  'quote_requests',                // Quote requests
  'quotes',                        // Quotes
  'status_tags',                   // Custom status tags

  // ── Moodboards ──────────────────────────────────────────────────────
  'moodboard_comments',            // Comments on moodboards
  'moodboard_quote_requests',      // Moodboard quote requests
  'moodboard_presentation_sheets', // Presentation sheets (child of moodboards, CASCADE)
  'moodboard_products',            // Moodboard products
  'moodboard_items',               // Moodboard items
  'moodboards',                    // Moodboards

  // ── Catalogs & Presentation (user-generated deliverables) ───────────
  // 'catalog_templates' (admin branding) is PRESERVED.
  'catalog_view_events',           // Catalog view analytics (child, CASCADE)
  'catalog_access_log',            // Catalog access log (child, CASCADE)
  'catalog_email_sends',           // Catalog email sends (child, CASCADE)
  'catalog_email_grants',          // Catalog email grants (child, CASCADE)
  'presentation_catalogs',         // Generated catalogs (output in pdf-documents, orphan-reaped)
  'catalog_source_pdfs',           // Uploaded catalog source PDFs (storage orphan-reaped)

  // ── Projects & Client Views (user work-product) ─────────────────────
  'client_view_feedback',          // Client view approvals/comments (child, CASCADE)
  'project_client_views',          // Project client-view deliverables (output orphan-reaped)
  'project_tasks',                 // Project tasks (child, CASCADE)
  'project_rooms',                 // Project rooms (child, CASCADE)
  'project_events',                // Project timeline events (child, CASCADE)
  'project_collaborators',         // Project collaborators (child, CASCADE)
  'projects',                      // Projects
  'proposals',                     // User proposals

  // ── Designer module (user-generated) ────────────────────────────────
  'designer_materials',            // Designer materials
  'designer_assets',               // Designer assets
  'designer_projects',             // Designer projects

  // ── Storefront (transient commerce state) ───────────────────────────
  'cart_items',                    // Cart line items (child of shopping_carts, CASCADE)
  'shopping_carts',                // Shopping carts

  // ── Social content (connection tokens are PRESERVED) ────────────────
  'social_post_analytics',         // Post analytics (child of social_posts, CASCADE)
  'social_posts',                  // Published/scheduled social posts

  // ── Inbox — threads + child participants/messages/tokens (CASCADE) ──
  'inbox_threads',                 // unified inbox (incl. WhatsApp customer threads)
  // ── Messaging content (channels/settings/optouts are PRESERVED) ─────
  'messaging_campaign_recipients', // Campaign send recipients
  'messaging_logs',                // Message delivery logs
  'messaging_analytics',           // Messaging analytics
  'campaign_recipients',           // Campaign recipients (child of campaigns, CASCADE)
  'campaigns',                     // Marketing campaigns (operational)

  // ── Public Tools lead-gen (cache + analytics log) ───────────────────
  'public_lookup_log',             // Per-scan attempt log
  'public_lookup_cache',           // 24h lookup cache (id-less — composite PK)

  // ── Misc user-generated / derived ───────────────────────────────────
  'material_reviews',              // User material reviews
  'material_alerts',               // User low-stock / material alerts
  'user_notifications',            // Delivered in-app notifications (derived)

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
  // query_understanding_cache (no `id` column) is TRUNCATEd via reset_truncate_heavy() — STEP 3.
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

  // ── PDF Processing & Chunking (derivative data) ─────────────────────
  // job_checkpoints + job_progress dropped — history is now stored as
  // JSONB arrays on background_jobs (stage_history, recovery_history).
  'ai_analysis_queue',             // AI analysis queue
  'image_processing_queue',        // Image processing queue
  'claude_validation_queue',       // Claude validation queue
  'processing_queue',              // Generic processing queue
  'processing_metrics',            // Processing metrics
  'pipeline_strategy_metrics',     // Chunking-strategy / Phase-3 distribution metrics
  // paddleocr_metrics (bigint PK, not uuid) is TRUNCATEd via reset_truncate_heavy() — STEP 3.
  'batch_jobs',                    // Batch jobs
  'embedding_stability_metrics',   // Embedding drift metrics
  'product_prices',                // Product price rows (child of products, CASCADE)
  'product_tables',                // Layout-extracted tables
  'product_layout_regions',        // Layout regions
  'product_enrichments',           // Product enrichment results
  'product_merge_history',         // Product merge history
  'product_processing_status',     // Product processing status
  'product_usage_stats',           // Product usage stats
  'chunk_boundaries',              // Chunk boundary metadata
  'chunk_classifications',         // Chunk classifications
  'chunk_quality_flags',           // Chunk quality flags
  'chunk_validation_scores',       // Chunk validation scores
  'category_extractions',          // Category extraction results
  'document_layout_analysis',      // PaddleOCR structural-pass layout cache
  'document_processing_status',    // Document processing status
  'document_quality_metrics',      // Document quality metrics
  'ocr_results',                   // OCR results
  'spatial_analysis',              // Spatial analysis results
  'pdf_processing_results',        // PDF processing results
  'pdf_integration_health_results',// PDF integration health
  'validation_results',            // Validation results
  // review_summaries (no `id` column) is TRUNCATEd via reset_truncate_heavy() — STEP 3.
  'document_images',               // Extracted images from PDFs
  'document_chunks',               // Semantic text chunks
  'products',                      // Extracted products
  'background_jobs',               // Processing jobs
  'documents',                     // PDF documents metadata
  'processed_documents',           // Processed document records

  // ── Materials & Catalog (user-populated) ────────────────────────────
  'material_images',               // Material images
  'material_properties',           // Material properties
  // 'material_categories' (admin-curated ingestion taxonomy) is PRESERVED — see NEVER_CLEAR.
  'materials_catalog',             // Materials catalog entries

  // ── Processing Results ──────────────────────────────────────────────
  'processing_results',            // Processing results

  // ── Data Import ─────────────────────────────────────────────────────
  'data_import_job_products',      // Imported product staging rows (child, CASCADE)
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
  'storage_cleanup_log',           // Orphan-cleanup cron audit log (derived)
  // system_logs is NOT here — at ~1M+ rows a PostgREST delete-all hits the
  // statement timeout. It (plus the id-less metric/cache tables + all vecs.*
  // collections) is TRUNCATEd via the reset_truncate_heavy() RPC in STEP 3.
  'ai_pricing_update_logs',        // AI pricing auto-update audit log
  'email_events',                  // Email open/click/bounce events (child of email_logs)
  'email_actions',                 // Email action log (derived)
  'email_logs',                    // Email send log (derived; templates/settings PRESERVED)
  'social_account_insights',       // Social follower/engagement insights (derived; accounts PRESERVED)
  'facet_merge_log',               // Facet canonicalization merge audit (derived; vocab PRESERVED)

  // ── Surplus Marketplace — user-generated cross-tenant listings ───
  'marketplace_inquiries',         // Buyer inquiries (child of listings)
  'marketplace_want_lists',        // Buyer want-lists
  'marketplace_listings',          // Last-stock listings (product_id SET NULL on product wipe)

  // ── Pricing Pyramid — user-generated requests ────────────────
  'master_requests',               // Master/resale requests
  'pricing_change_requests',       // Pricing change requests

  // ── Appointments (user-generated) ───────────────────────────────────
  'appointments',                  // Booked appointments
  'appointment_availability',      // Availability slots

  // ── Connected Websites (user-generated + crawled) ───────────────────
  'user_website_pages',            // Crawled website pages (child of user_websites)
  'user_websites',                 // Connected website configs

  // ── Profile / social requests & follows (user-generated) ────────────
  'profile_reviews',               // Reviews left on profiles
  'profile_contact_requests',      // Contact requests
  'factory_access_requests',       // Factory data-access requests
  'factory_registration_requests', // Factory registration requests
  'role_upgrade_requests',         // Role-upgrade requests
  'user_follows',                  // Follow graph
  'notifications',                 // Legacy/secondary notifications table (derived)

  // ============================================================
  // PRESERVED (not in this list — see header comment for full list):
  // - Knowledge Base (kb_*)
  // - CRM (crm_*)
  // - Users / Profiles / Workspaces / Credits
  // - Admin config: system_settings, prompts,
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
// NEVER_CLEAR — hard guard against catastrophic future edits.
// These tables hold legally-retained financial records, secrets, customer
// API-key state, or long-running customer-facing observational data. If any
// of them is ever added to TABLES_TO_CLEAR (by mistake, refactor, or a future
// switch to a denylist), the reset ABORTS before deleting anything — see the
// overlap assertion at the top of the handler. This is fail-closed by design.
// Do NOT "resolve" an overlap by removing the entry from here. Remove it from
// TABLES_TO_CLEAR instead.
const NEVER_CLEAR = new Set<string>([
  // Finance / fiscal (legally retained)
  'invoices', 'invoice_items', 'credit_notes', 'credit_note_items',
  'supplier_bills', 'supplier_credit_notes', 'supplier_credit_note_items',
  'payments', 'payment_allocations', 'planned_payments', 'cheques',
  'delivery_notes', 'delivery_note_items',
  'inbound_documents', 'stock_movements', 'time_entries',
  'stock_allocations', 'supplier_products', 'warehouse_coverage',
  'warehouses', 'warehouse_items', 'warehouse_pending_items',
  'pos_sessions', 'pos_cash_movements', 'pos_signatures', 'pos_terminals',
  'document_series', 'fiscal_connectors', 'fiscal_submissions',
  'finance_settings', 'finance_branches', 'finance_categories', 'pricing_rules',
  'trip_expense_items', 'trip_expense_reports',
  'workspace_fiscal_bindings', 'workspace_inbound_credentials',
  'workspace_payment_config', 'workspace_storefront', 'workspace_doc_type',
  'workspace_module_entitlements',
  // Secrets & API keys (api_keys is the CASCADE root for all external tracking)
  'platform_secrets', 'platform_secret_module_links', 'api_keys', 'material_kai_keys',
  // Customer-facing monitoring (same policy as price monitoring)
  'tracked_queries', 'tracked_query_price_history', 'tracked_query_promoted_urls',
  'tracked_query_excluded_urls', 'price_lookups', 'price_discrepancies',
  'price_alert_log', 'match_corrections', 'classifier_verdict_cache',
  'brand_retailer_index', 'retailer_extraction_recipes',
  'tracked_mentions', 'mention_history', 'mention_outlets', 'mention_promoted_urls',
  'mention_excluded_urls', 'mention_match_corrections', 'mention_alert_log',
  'mention_classifier_verdict_cache', 'llm_mention_probes',
  'tracked_jobs', 'job_listings', 'job_excluded_urls', 'job_match_corrections',
  'job_alert_log', 'job_classifier_verdict_cache', 'job_research_sites',
  'seo_tracked_domains', 'seo_research_runs', 'seo_domain_audit_history',
  // Connection tokens + compliance
  'social_accounts', 'social_zernio_profiles', 'messaging_channels',
  'messaging_settings', 'messaging_optouts',
  // Agent Fabric persistent layer — definitions + projects + secrets +
  // deployments + snapshots. agent_project_secrets CASCADEs from agent_projects,
  // so the entire persistent layer must be preserved to keep secrets safe; only
  // the runtime (agent_runs/agent_artifacts/agent_inbox_messages) is cleared.
  'agent_definitions', 'agent_projects', 'agent_project_secrets',
  'agent_project_deployments', 'agent_project_snapshots',
  // Accounts / credits / RBAC / admin config
  'user_credits', 'credit_transactions', 'credit_packages', 'workspaces',
  'workspace_members', 'user_profiles', 'roles', 'role_permissions',
  'prompts', 'system_settings', 'modules',
  // Admin-curated materials taxonomy that drives the ingestion/PDF-processing
  // classifier (categories + subcategories, ai_extraction_enabled, prototype
  // embeddings). Config, not user content — must survive a reset.
  'material_categories',
]);

// Tables whose primary key is NOT a uuid `id` column — the default
// `.neq('id', <zero-uuid>)` delete-all predicate can't target them.
// Map each to a non-null column we can use as an always-true predicate.
const IDLESS_DELETE_COLUMN: Record<string, string> = {
  public_lookup_cache: 'query_hash', // composite PK (query_hash, scan_type)
  facet_merge_log: 'id',             // PK `id` is bigint, not uuid — zero-uuid predicate can't target it
};

// ============================================================
// Storage buckets to clear (AI/processing-generated content only)
// Post-consolidation: 6 anchor buckets exist. We clear the two
// that hold regenerable AI/processing output. pdf-documents holds raw user
// uploads (KB) plus generated outputs (catalog-source/, catalog-output/,
// quote-output/, moodboard-output/, client-view-output/) — those become
// orphans when their DB rows are cleared above (presentation_catalogs,
// catalog_source_pdfs, quotes, moodboards, project_client_views) and the
// nightly storage-orphan-cleanup-cron sweeps them within its grace window.
// pdf-tiles/catalog-extracted/ is removed outright since we wipe pdf-tiles whole.
// PRESERVED buckets:
//   - pdf-documents                ← KB raw uploads + generated outputs (cleaned by orphan cron)
//   - quote-templates              ← admin-uploaded template assets (quotes + catalog branding)
//   - profile-avatars              ← user avatars (kept across resets)
//   - moodboard-sheet-references   ← admin-curated UI illustrations
// ============================================================
const BUCKETS_TO_CLEAR = ['pdf-tiles', 'generation-images'];

// Path prefixes inside a cleared bucket that hold SETTINGS / BRANDING assets,
// not regenerable AI output. The whole-bucket wipe skips these so a reset
// doesn't destroy admin-uploaded branding whose config row (finance_settings,
// user_profiles) is preserved. Without this, the row survives pointing at a
// deleted file (broken invoice/PDF logos). Mirrors the orphan-cron protection
// added to build_storage_reference_set().
const BUCKET_PROTECTED_PREFIXES: Record<string, string[]> = {
  'generation-images': [
    'business-logos/', // finance_settings.business_logo_path (invoice/business branding)
  ],
};

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
 *            prompts, prompt_history,
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

    // SAFETY GUARD (fail-closed): never proceed if any NEVER_CLEAR table has
    // leaked into TABLES_TO_CLEAR. Protects legally-retained finance/fiscal
    // records, secrets, customer API-key state, and long-running monitoring
    // data from a bad edit. Abort the WHOLE reset before deleting anything.
    const guardViolations = TABLES_TO_CLEAR.filter((t) => NEVER_CLEAR.has(t));
    if (guardViolations.length > 0) {
      console.error('🛑 Reset aborted — protected tables present in clear list:', guardViolations);
      return new Response(
        JSON.stringify({
          error: 'Reset aborted: protected tables are present in the clear list',
          protected_tables: guardViolations,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('🔄 Starting platform reset...');
    const results: any = {
      tables: [],
      storage: [],
    };
    let totalDeleted = 0;

    // LOCK GUARD: "anything locked is never deleted". Discover which clear-list
    // tables carry a boolean `is_locked` column; for those, the delete skips
    // rows where is_locked = true (keeps false / null). Self-maintaining — a
    // new lockable table in the clear list is honored automatically. If the
    // helper RPC is unavailable, fall back to no lock awareness (still safe:
    // lockable tables are not currently in the clear list).
    let lockAwareSet = new Set<string>();
    try {
      const { data: lockAware, error: lockErr } = await supabase.rpc('reset_lock_aware_tables', {
        p_tables: TABLES_TO_CLEAR,
      });
      if (lockErr) {
        console.warn('   ⚠️ reset_lock_aware_tables RPC failed — proceeding without lock awareness:', lockErr.message);
      } else if (Array.isArray(lockAware)) {
        lockAwareSet = new Set<string>(lockAware as string[]);
        if (lockAwareSet.size > 0) {
          console.log(`   🔒 Lock-aware tables (locked rows preserved): ${[...lockAwareSet].join(', ')}`);
        }
      }
    } catch (e: any) {
      console.warn('   ⚠️ Lock-awareness lookup threw — proceeding without it:', e?.message);
    }

    // STEP 1: Clear database tables
    console.log('\n🗑️  STEP 1: Clear database tables');
    for (const tableName of TABLES_TO_CLEAR) {
      try {
        console.log(`   Clearing ${tableName}...`);

        const lockAware = lockAwareSet.has(tableName);

        // Count rows that will actually be deleted (excludes locked rows on
        // lock-aware tables) so the reported number is accurate.
        let countQ = supabase.from(tableName).select('*', { count: 'exact', head: true });
        if (lockAware) countQ = countQ.not('is_locked', 'is', true);
        const { count } = await countQ;

        if (count === 0) {
          console.log(`   ✅ ${tableName} has no clearable rows`);
          results.tables.push({ table: tableName, deleted: 0 });
          continue;
        }

        // Delete all rows. Most tables use a uuid `id`; a few use a composite
        // PK with no `id` column, so target a known non-null column instead.
        // Lock-aware tables additionally keep rows where is_locked = true.
        const idlessCol = IDLESS_DELETE_COLUMN[tableName];
        let delQ = idlessCol
          ? supabase.from(tableName).delete().not(idlessCol, 'is', null)
          : supabase.from(tableName).delete().neq('id', '00000000-0000-0000-0000-000000000000');
        if (lockAware) delQ = delQ.not('is_locked', 'is', true);
        const { error } = await delQ;

        if (error) {
          console.error(`   ❌ Failed to clear ${tableName}:`, error);
          results.tables.push({ table: tableName, deleted: 0, error: error.message });
        } else {
          console.log(`   ✅ Deleted ${count} rows from ${tableName}${lockAware ? ' (locked rows preserved)' : ''}`);
          results.tables.push({ table: tableName, deleted: count, lock_aware: lockAware || undefined });
          totalDeleted += count || 0;
        }
      } catch (error: any) {
        console.error(`   ❌ Error clearing ${tableName}:`, error);
        results.tables.push({ table: tableName, deleted: 0, error: error.message });
      }
    }

    // STEP 1.5: Clean the Knowledge Base — delete UNPROTECTED kb_docs only.
    // kb_* tables are intentionally NOT in TABLES_TO_CLEAR (their FK/lock model
    // can't be expressed by the generic neq-delete). Instead we call a helper
    // that mirrors kb_block_locked_doc_delete()'s effective_locked rule and drops
    // only docs that are public/unlocked/non-auto-synced (the auto-extracted
    // catalog docs in the per-material public categories). Agent-level + is_locked categories
    // (HeatPumps, Product Management, Internal Configuration) and their docs, plus
    // every category row, survive. Categories are left intact (unlocked ones just
    // end empty and are re-used by upsert_kb_doc on the next ingest).
    console.log('\n🗑️  STEP 1.5: Clean Knowledge Base (unprotected docs only)');
    results.knowledge_base = { deleted: 0 };
    try {
      const { data: kbDeleted, error: kbErr } = await supabase.rpc('wipe_unprotected_kb_docs');
      if (kbErr) {
        console.error('   ❌ KB clean failed:', kbErr);
        results.knowledge_base = { deleted: 0, error: kbErr.message };
      } else {
        const deleted = typeof kbDeleted === 'number' ? kbDeleted : 0;
        console.log(`   ✅ Deleted ${deleted} unprotected KB docs (locked/agent docs preserved)`);
        results.knowledge_base = { deleted };
      }
    } catch (error: any) {
      console.error('   ❌ KB clean error:', error);
      results.knowledge_base = { deleted: 0, error: error.message };
    }

    // STEP 1.6: Purge ORPHANED Agent Fabric projects (workspace_id IS NULL).
    // The Agent Fabric persistent layer (agent_projects + its CASCADE children
    // secrets/deployments/snapshots) is in NEVER_CLEAR so legitimately
    // workspace-owned, deployed agents + their secrets survive a reset. But an
    // agent_projects row with NULL workspace_id is unreachable — the RLS policy is
    // `is_workspace_admin(workspace_id)`, which never grants on NULL — so it can
    // never be seen or owned by anyone; it's pure orphan junk (e.g. an early test
    // project). Delete those; the delete CASCADEs to its secrets/deployments/
    // snapshots. NOTE: agent_definitions is intentionally NOT here — it's a GLOBAL,
    // un-workspaced agent-type registry (developer/qa-reviewer/…), preserved config.
    console.log('\n🗑️  STEP 1.6: Purge orphaned Agent Fabric projects (NULL workspace)');
    results.orphan_agent_fabric = [];
    for (const tableName of ['agent_projects']) {
      try {
        const { count } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })
          .is('workspace_id', null);
        if (!count) {
          results.orphan_agent_fabric.push({ table: tableName, deleted: 0 });
          continue;
        }
        const { error } = await supabase.from(tableName).delete().is('workspace_id', null);
        if (error) {
          console.error(`   ❌ Failed to purge orphan ${tableName}:`, error);
          results.orphan_agent_fabric.push({ table: tableName, deleted: 0, error: error.message });
        } else {
          console.log(`   ✅ Purged ${count} orphan row(s) from ${tableName} (NULL workspace)`);
          results.orphan_agent_fabric.push({ table: tableName, deleted: count });
        }
      } catch (error: any) {
        console.error(`   ❌ Error purging orphan ${tableName}:`, error);
        results.orphan_agent_fabric.push({ table: tableName, deleted: 0, error: error.message });
      }
    }

    // STEP 2: Clear storage buckets (AI/processing content only — NOT quote-templates or pdf-documents)
    console.log('\n🗑️  STEP 2: Clear storage buckets');

    for (const bucketName of BUCKETS_TO_CLEAR) {
      try {
        console.log(`   Clearing bucket: ${bucketName}...`);

        // Recursively list all files including those in subdirectories
        const listedFiles = await listAllFiles(bucketName);

        // Skip protected settings/branding prefixes (preserved across reset).
        const protectedPrefixes = BUCKET_PROTECTED_PREFIXES[bucketName] || [];
        const allFiles = protectedPrefixes.length
          ? listedFiles.filter((p) => !protectedPrefixes.some((pre) => p.startsWith(pre)))
          : listedFiles;
        const skipped = listedFiles.length - allFiles.length;
        if (skipped > 0) {
          console.log(`   🛡️  Preserving ${skipped} branding file(s) under [${protectedPrefixes.join(', ')}]`);
        }

        if (allFiles.length === 0) {
          console.log(`   ✅ Bucket ${bucketName} has no clearable files`);
          results.storage.push({ bucket: bucketName, deleted: 0, preserved: skipped });
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

        console.log(`   ✅ Deleted ${totalDeletedFromBucket} files from ${bucketName}${skipped > 0 ? ` (preserved ${skipped} branding file(s))` : ''}`);
        results.storage.push({ bucket: bucketName, deleted: totalDeletedFromBucket, preserved: skipped, error: bucketError });
      } catch (error: any) {
        console.error(`   ❌ Error clearing bucket ${bucketName}:`, error);
        results.storage.push({ bucket: bucketName, deleted: 0, error: error.message });
      }
    }

    const totalStorageDeleted = results.storage.reduce((sum: number, r: any) => sum + (r.deleted || 0), 0);

    // STEP 3: TRUNCATE high-volume / id-less tables + ALL VECS collections via RPC.
    // None of these can go through the PostgREST delete-all path:
    //   • system_logs is ~1M+ rows → DELETE hits the statement timeout
    //   • paddleocr_metrics (bigint PK) / query_understanding_cache / review_summaries
    //     have non-uuid or absent `id` columns → the .neq('id', zero-uuid) predicate errors
    //   • DELETE is NOT granted to the PostgREST role on the vecs schema, so the old
    //     per-collection delete silently no-op'd → ghost embeddings survived every reset
    // reset_truncate_heavy() is SECURITY DEFINER and TRUNCATEs all of them reliably
    // (fixed allow-list, no dynamic input). This is the single source of truth for
    // clearing every image embedding collection — missing one leaves ghost images.
    console.log('\n🗑️  STEP 3: TRUNCATE VECS + high-volume/id-less tables (RPC)');
    results.truncated = { tables: [] };
    try {
      const { data: trunc, error: truncErr } = await supabase.rpc('reset_truncate_heavy');
      if (truncErr) {
        console.error('   ❌ reset_truncate_heavy failed:', truncErr);
        results.truncated = { tables: [], error: truncErr.message };
      } else {
        const tables: string[] = (trunc && (trunc as any).truncated) || [];
        console.log(`   ✅ Truncated ${tables.length} relations: ${tables.join(', ')}`);
        results.truncated = { tables };
      }
    } catch (error: any) {
      console.error('   ❌ reset_truncate_heavy error:', error);
      results.truncated = { tables: [], error: error.message };
    }

    const totalVecsDeleted = (results.truncated.tables || []).filter((t: string) => t.startsWith('vecs.')).length;

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
    const truncatedCount = (results.truncated?.tables || []).length;
    console.log(`✅ Platform reset complete. Tables: ${totalDeleted} rows across ${successfulTables}/${TABLES_TO_CLEAR.length} tables (${failedTables} errors), KB docs cleaned: ${results.knowledge_base.deleted}, Storage: ${totalStorageDeleted} files, Truncated: ${truncatedCount} relations (incl. ${totalVecsDeleted} VECS), prompt_history trimmed: ${results.prompt_history.deleted}, server /tmp: ${results.server_tmp.ok ? 'cleaned' : 'skipped/failed'}`);

    return new Response(
      JSON.stringify({
        success: true,
        summary: `Deleted ${totalDeleted} rows from ${successfulTables}/${TABLES_TO_CLEAR.length} tables (${failedTables} failed), cleaned ${results.knowledge_base.deleted} unprotected KB docs, ${totalStorageDeleted} files from storage, truncated ${truncatedCount} heavy/id-less relations (incl. ${totalVecsDeleted} VECS collections), trimmed ${results.prompt_history.deleted} prompt_history rows, and ${results.server_tmp.ok ? 'cleaned' : 'failed to clean'} MIVAA /tmp`,
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
